-- 롤백: 20261127010000_approve_proposal_block_archived.sql 이전(20261125000800_functions.sql)의 approve_proposal 로 되돌린다.
-- 원본 본문을 그대로 복사한 것(바이트 단위 비교는 DB 테스트가 한다). supabase/migrations 밖에 두어 db push 가 자동 적용하지 않는다.
-- 실행은 PM 만. 롤백 뒤에도 앱 쪽 재검증(handleApprove)은 남는다.

create or replace function public.approve_proposal(p_id uuid, p_overrides jsonb default '{}'::jsonb, p_note text default null)
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.position_proposals;
  v_pos public.positions;
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
  if v_v ? 'qty' then perform public.mowa_check_qty(v_asset, (v_v->>'qty')::numeric); end if;   -- Q-31 cash 2자리 포함

  perform set_config('mowa.via_proposal', 'on', true);

  if v_p.position_id is not null then
    select * into v_pos from public.positions where id = v_p.position_id and owner_id = v_uid for update;
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
