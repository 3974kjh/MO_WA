-- G3 + L-1: approve_proposal 재정의.
--  (1) 보관된 보유 기록·종목을 대상으로 한 제안은 승인하지 않는다(포지션 FOR UPDATE → 종목 FOR SHARE 로 잠근 뒤 확인, 포지션 없는
--      open_holding 도 종목을 잠근다). SQLSTATE MW001(보유 보관)·MW002(종목 보관), 메시지 태그 [R-VAL-P02].
--  (2) 합친 값의 소수 자릿수(R-FMT-13, ≤4)·avg_price 타입/부호(R-VAL-M02)·qty 타입/부호(R-VAL-M03/P04)·통화(R-VAL-M01)를
--      만료·superseded·버전 충돌·보관 확인 '뒤'에 다시 검사(L-2 순서, RPC 직접 호출 우회 방지).
--  변경 없음: 세션·소유자·상태·만료·키 허용목록·sibling superseded·감사 로그·권한(authenticated 만 EXECUTE, SECURITY DEFINER,
--  search_path = public, pg_temp). positions_guard / approval_version 은 건드리지 않는다(잠금 + 확인이 원자적이라 불필요).
-- 롤백: supabase/rollbacks/20261127010000_approve_proposal_block_archived.down.sql (0800 의 원본 정의로 되돌림). 재적용 가능(create or replace).

create or replace function public.approve_proposal(p_id uuid, p_overrides jsonb default '{}'::jsonb, p_note text default null)
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.position_proposals;
  v_pos public.positions;
  v_inst public.instruments;
  v_v jsonb;
  v_bad text;
  v_allowed text[];
  v_target uuid;
  v_asset text;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] approve requires a user session' using errcode = '42501';
  end if;
  select * into v_p from public.position_proposals where id = p_id for update;
  if not found or v_p.owner_id <> v_uid then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  if v_p.status not in ('pending','on_hold') then raise exception 'proposal is already %', v_p.status using errcode = 'P0001'; end if;
  if v_p.status = 'pending' and v_p.expires_at <= now() then   -- on_hold는 만료 제외(G-1)
    update public.position_proposals set status = 'expired', decided_at = now(), decided_by = v_uid
     where id = p_id returning * into v_p;
    return v_p;
  end if;

  v_allowed := case v_p.change_type   -- override도 직접 쓰기 필드(trigger·breakeven·watch_only) 불가(R-VAL-P07)
    when 'open_holding' then array['qty','avg_price','currency']
    when 'set_qty_avg' then array['qty','avg_price'] || case when v_p.proposed_by_type = 'user' then array['currency'] else array[]::text[] end
    when 'close' then array[]::text[] end;
  select k into v_bad from jsonb_object_keys(coalesce(p_overrides, '{}'::jsonb)) k where not (k = any(v_allowed)) limit 1;
  if v_bad is not null then raise exception '[R-PERM-13] override field % not allowed', v_bad using errcode = '22023'; end if;
  v_v := v_p.proposed_values || coalesce(p_overrides, '{}'::jsonb);

  -- R-VAL-M03: 주식·ETF 정수(Q-15), cash 소수 2자리까지(Q-31) (override 포함)
  select asset_type into v_asset from public.instruments where id = v_p.instrument_id;
  if v_v ? 'qty' and jsonb_typeof(v_v->'qty') = 'number' then perform public.mowa_check_qty(v_asset, (v_v->>'qty')::numeric); end if;   -- Q-31 cash 2자리 포함 (숫자 아님은 아래 G3 검사가 R-VAL-M03 으로)

  perform set_config('mowa.via_proposal', 'on', true);

  -- G3: 포지션(FOR UPDATE)→종목(FOR SHARE) 순으로 잠근 뒤 보관 여부를 본다. 보관 처리(UPDATE)는 같은 행 잠금을 기다리므로
  --     '확인 직후 보관' 경쟁이 없다. 오류 SQLSTATE: MW001 = 보유 기록 보관, MW002 = 종목 보관(앱이 코드로 구분해 문구를 고른다).
  if v_p.position_id is not null then
    select * into v_pos from public.positions where id = v_p.position_id and owner_id = v_uid for update;
    if not found then raise exception 'position not found' using errcode = 'P0002'; end if;
    if v_pos.archived_at is not null then
      raise exception '[R-VAL-P02] position is archived; restore it or reject the proposal' using errcode = 'MW001';
    end if;
  end if;
  select * into v_inst from public.instruments
   where id = coalesce(v_p.instrument_id, v_pos.instrument_id) and owner_id = v_uid for share;
  if not found then raise exception 'instrument not found' using errcode = 'P0002'; end if;
  if v_inst.archived_at is not null then
    raise exception '[R-VAL-P02] instrument is archived; restore it or reject the proposal' using errcode = 'MW002';
  end if;

  if v_p.position_id is not null then
    if v_pos.approval_version <> v_p.base_version then
      update public.position_proposals
         set status = 'conflict', decided_at = now(), decided_by = v_uid,
             decision_note = coalesce(p_note, 'position changed after proposal (approval_version ' || v_pos.approval_version || ')')
       where id = p_id returning * into v_p;
      insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, error_code, affected_ids)
      values (v_uid, 'user', v_uid, 'proposal.approve', 'error', 'conflict',
              jsonb_build_array(jsonb_build_object('table','position_proposals','id',p_id)));
      return v_p;
    end if;
  end if;

  -- G3 (L-1): 합친 값(proposed_values || overrides)을 DB 에서도 다시 검사한다(RPC 직접 호출 우회 방지).
  --   만료·superseded·버전 충돌·보관 처리는 위에서 먼저 끝났다. 규칙은 앱 revalidate.ts / MCP propose 와 같다.
  if jsonb_typeof(v_p.proposed_values) <> 'object' then
    raise exception '[R-VAL-P07] proposed_values must be an object' using errcode = '22023';
  end if;
  if v_p.change_type = 'open_holding' and not (v_v ? 'qty' and v_v ? 'avg_price') then
    raise exception '[R-VAL-P04] open_holding needs qty and avg_price' using errcode = '22023';
  end if;
  if v_p.change_type = 'set_qty_avg' and not (v_v ? 'qty') and not (v_v ? 'avg_price') then
    raise exception '[R-VAL-P07] set_qty_avg needs qty and/or avg_price' using errcode = '22023';
  end if;
  if v_v ? 'qty' then
    if jsonb_typeof(v_v->'qty') <> 'number' then
      raise exception '[R-VAL-M03] qty must be a finite number' using errcode = '22023';
    end if;
    if (v_v->>'qty')::numeric <= 0 then
      raise exception '[R-VAL-P04] qty must be greater than 0' using errcode = '22023';
    end if;
  end if;
  if v_v ? 'avg_price' then
    if jsonb_typeof(v_v->'avg_price') <> 'number' or (v_v->>'avg_price')::numeric <= 0 then
      raise exception '[R-VAL-M02] avg_price must be a positive number' using errcode = '22023';
    end if;
    if scale(trim_scale((v_v->>'avg_price')::numeric)) > 4 then
      raise exception '[R-FMT-13] unit prices keep at most 4 decimals on write' using errcode = '22023';
    end if;
  end if;
  if v_v ? 'currency' and (jsonb_typeof(v_v->'currency') <> 'string' or (v_v->>'currency') not in ('KRW','USD')) then
    raise exception '[R-VAL-M01] currency must be KRW or USD' using errcode = '22023';
  end if;
  if v_p.change_type = 'open_holding' and v_p.position_id is null and not (v_v ? 'currency') then
    raise exception '[R-VAL-M01] currency is required to open a new holding' using errcode = '22023';
  end if;

  if v_p.change_type = 'open_holding' and v_p.position_id is null then
    if exists (select 1 from public.positions where owner_id = v_uid and instrument_id = v_p.instrument_id
               and status = 'holding' and archived_at is null) then
      raise exception '[R-VAL-P03] active holding already exists; use set_qty_avg' using errcode = '23505';
    end if;
    insert into public.positions (owner_id, instrument_id, status, currency, qty, avg_price, breakeven, source_ref)
    values (v_uid, v_p.instrument_id, 'holding', v_v->>'currency', (v_v->>'qty')::numeric,
            (v_v->>'avg_price')::numeric, (v_v->>'breakeven')::numeric, jsonb_build_object('proposal_id', p_id))
    returning id into v_target;
  else
    update public.positions set
      status        = case v_p.change_type when 'open_holding' then 'holding' when 'close' then 'closed' else status end,
      qty           = case when v_p.change_type = 'close' then 0 when v_v ? 'qty' then (v_v->>'qty')::numeric else qty end,
      avg_price     = case when v_v ? 'avg_price' then (v_v->>'avg_price')::numeric else avg_price end,
      currency      = case when v_v ? 'currency' then v_v->>'currency' else currency end,
      breakeven     = case when v_v ? 'breakeven' then (v_v->>'breakeven')::numeric else breakeven end,
      closed_at     = case when v_p.change_type = 'close' then now() else closed_at end
    where id = v_p.position_id;
    v_target := v_p.position_id;
  end if;

  update public.position_proposals
     set status = 'approved', decided_at = now(), decided_by = v_uid, decision_note = p_note,
         applied_values = v_v, result_position_id = v_target
   where id = p_id returning * into v_p;

  -- 같은 대상의 남은 pending은 superseded
  update public.position_proposals set status = 'superseded', decided_at = now(), decided_by = v_uid
   where owner_id = v_uid and status in ('pending','on_hold') and id <> p_id
     and (position_id = v_target or (position_id is null and instrument_id = v_p.instrument_id));

  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids, args_preview)
  values (v_uid, 'user', v_uid, 'proposal.approve', 'ok',
          jsonb_build_array(jsonb_build_object('table','position_proposals','id',p_id),
                            jsonb_build_object('table','positions','id',v_target)),
          jsonb_build_object('change_type', v_p.change_type, 'overrides', coalesce(p_overrides, '{}'::jsonb)));
  return v_p;
end;
$$;
revoke all on function public.approve_proposal(uuid, jsonb, text) from public, anon, service_role;
grant execute on function public.approve_proposal(uuid, jsonb, text) to authenticated;