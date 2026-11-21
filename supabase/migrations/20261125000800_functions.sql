-- MO_WA rebuild M1 · DRAFT (미적용) · RPC (MCP 인증·레이트리밋 / 승인·거절)

-- R-PERM-10: 인증 + 분당 레이트리밋 + last_used 갱신을 왕복 1회로. service_role 전용. 불일치 = 빈 결과(401)
create or replace function public.mcp_authenticate(p_prefix text, p_hash text, p_ip inet default null)
returns table (bot_client_id uuid, owner_id uuid, bot_name text, profile text, scopes text[], allowed boolean, retry_after_s integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_bot public.bot_clients;
  v_count integer;
  v_window timestamptz := date_trunc('minute', now());
begin
  select * into v_bot from public.bot_clients b where b.key_prefix = p_prefix;
  if not found or v_bot.key_hash <> p_hash or v_bot.revoked_at is not null
     or (v_bot.expires_at is not null and v_bot.expires_at <= now()) then
    return;
  end if;
  insert into public.mcp_rate_buckets as r (bot_client_id, window_start, count)
  values (v_bot.id, v_window, 1)
  on conflict on constraint mcp_rate_buckets_pkey do update set count = r.count + 1
  returning r.count into v_count;
  update public.bot_clients b set last_used_at = now(), last_used_ip = p_ip
   where b.id = v_bot.id and (b.last_used_at is null or b.last_used_at < now() - interval '1 minute');
  if random() < 0.01 then
    delete from public.mcp_rate_buckets where window_start < now() - interval '1 day';
  end if;
  return query select v_bot.id, v_bot.owner_id, v_bot.name, v_bot.profile, v_bot.scopes,
    v_count <= v_bot.rate_limit_per_min,
    case when v_count <= v_bot.rate_limit_per_min then 0 else greatest(1, 60 - extract(second from now())::integer) end;
end;
$$;
revoke all on function public.mcp_authenticate(text, text, inet) from public, anon, authenticated;
grant execute on function public.mcp_authenticate(text, text, inet) to service_role;

-- R-PERM-13: 사용자 승인 → 한 트랜잭션으로 positions 반영 + 감사 로그. 봇(service_role)은 실행 권한 없음(R-PERM-05)
-- p_overrides: 사용자가 승인 화면에서 고친 값(같은 change_type 허용 필드만)
-- R-PERM-18 (rules v0.5, G-2 (a)안만): FE-07은 승인 확정 후 5초 기다렸다가 이 RPC를 한 번 호출한다. 5초 안 실행 취소·탭 닫힘이면 미호출
--   → 제안은 pending/on_hold 그대로, positions 쓰기·감사 로그 없음. 서버 되돌리기 RPC는 없다(서버는 유예를 모른다). 거절·보류는 즉시.
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

create or replace function public.reject_proposal(p_id uuid, p_note text default null)
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.position_proposals;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] reject requires a user session' using errcode = '42501';
  end if;
  update public.position_proposals
     set status = 'rejected', decided_at = now(), decided_by = v_uid, decision_note = p_note
   where id = p_id and owner_id = v_uid and status in ('pending','on_hold')
  returning * into v_p;
  if not found then raise exception 'pending proposal not found' using errcode = 'P0002'; end if;
  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids)
  values (v_uid, 'user', v_uid, 'proposal.reject', 'ok',
          jsonb_build_array(jsonb_build_object('table','position_proposals','id',p_id)));
  return v_p;
end;
$$;
revoke all on function public.reject_proposal(uuid, text) from public, anon, service_role;
grant execute on function public.reject_proposal(uuid, text) to authenticated;

-- G-1 on_hold: pending ↔ on_hold, 사용자만(R-PERM-13 v0.2). on_hold는 만료 제외, 보류 해제 시 만료 시각을 다시 계산(Q-28)
create or replace function public.hold_proposal(p_id uuid, p_hold boolean default true, p_note text default null)
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.position_proposals;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] hold requires a user session' using errcode = '42501';
  end if;
  if p_hold then
    update public.position_proposals set status = 'on_hold', held_at = now(), decision_note = coalesce(p_note, decision_note)
     where id = p_id and owner_id = v_uid and status = 'pending' and expires_at > now()
    returning * into v_p;
  else
    update public.position_proposals set status = 'pending', held_at = null, expires_at = public.mowa_proposal_expiry(v_uid)
     where id = p_id and owner_id = v_uid and status = 'on_hold'
    returning * into v_p;
  end if;
  if not found then raise exception 'proposal not found in expected state' using errcode = 'P0002'; end if;
  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids)
  values (v_uid, 'user', v_uid, case when p_hold then 'proposal.hold' else 'proposal.unhold' end, 'ok',
          jsonb_build_array(jsonb_build_object('table','position_proposals','id',p_id)));
  return v_p;
end;
$$;
revoke all on function public.hold_proposal(uuid, boolean, text) from public, anon, service_role;
grant execute on function public.hold_proposal(uuid, boolean, text) to authenticated;

-- R-PERM-13 expired: 정기 작업(Cron)이 호출. positions·reports는 바꾸지 않는다. 기간은 제안 생성 시 mowa_proposal_expiry(Q-28)로 정해짐
-- R-VAL-P14 (Q-29): 사용자는 자기가 쓴 제안(proposed_by_type='user')만 pending·on_hold → cancelled(철회). 봇 제안은 reject_proposal로 거절
--   봇의 자기 제안 취소는 MCP cancel_proposal → position_proposals_prepare 가드 경로
create or replace function public.cancel_own_proposal(p_id uuid, p_note text default null)
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.position_proposals;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] requires a user session' using errcode = '42501';
  end if;
  select * into v_p from public.position_proposals where id = p_id and owner_id = v_uid for update;
  if not found then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  if v_p.proposed_by_type <> 'user' or v_p.proposed_by_user is distinct from v_uid then
    raise exception '[R-PERM-05] users reject bot proposals instead of cancelling them (Q-29)' using errcode = '42501';
  end if;
  if v_p.status not in ('pending','on_hold') then raise exception 'proposal is already %', v_p.status using errcode = 'P0001'; end if;
  update public.position_proposals set status = 'cancelled', decided_at = now(), decided_by = v_uid, decision_note = p_note
   where id = p_id returning * into v_p;
  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids)
  values (v_uid, 'user', v_uid, 'proposal.cancel', 'ok', jsonb_build_array(jsonb_build_object('table','position_proposals','id',p_id)));
  return v_p;
end;
$$;
revoke all on function public.cancel_own_proposal(uuid, text) from public, anon, service_role;
grant execute on function public.cancel_own_proposal(uuid, text) to authenticated;

-- R-VAL-P11·R-PERM-18 (rules v0.4·v0.5, PM 결정 2026-11-21): 사용자 정정 제안 = 확인 시트 한 번으로 생성 + 승인 + positions 반영(한 트랜잭션).
--   pending으로 큐에 쌓지 않는다. 이력 상태는 approved. 제안 행·positions 반영·감사 로그가 한 트랜잭션. base_version 충돌 검사 유지.
--   G-2 (R-PERM-18, (a)안만): 클라이언트가 확인 후 5초 기다렸다가 이 RPC를 한 번 호출(탭 닫힘·실행 취소면 미호출 → 제안 행·positions·감사 로그 모두 없음). 서버 되돌리기 RPC는 없다.
--   같은 5초 유예가 봇 제안 승인(approve_proposal, FE-07)에도 적용된다(PM 확정 2026-11-21). 서버 쪽 변경 없음
--   입력: 정수 수량(R-VAL-M03), 통화, 평단(USD 종목은 USD 평단), 한 줄 사유(1~120자, CorrectionSheet와 같음. PM 결정 2026-11-21, 121자 이상 ERROR. calc_note ≤200자와 별개). 웹 세션 전용(봇 실행 권한 없음, R-VAL-P11)
create or replace function public.apply_user_correction(
  p_position_id uuid, p_qty numeric, p_currency text, p_avg_price numeric, p_reason text, p_client_ref text default null,
  p_base_version integer default null)   -- 화면이 본 positions.approval_version. 다르면 CONFLICT(handoff-fe v1.1 '서버는 before 값을 재검증')
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pos public.positions;
  v_id uuid;
  v_p public.position_proposals;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-VAL-P11] user corrections require a web session' using errcode = '42501';
  end if;
  if p_client_ref is not null then
    select * into v_p from public.position_proposals where owner_id = v_uid and client_ref = p_client_ref;
    if found then return v_p; end if;                       -- 멱등(R-PERM-11)
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 120 or p_reason ~ '[\r\n]' then
    raise exception '[R-VAL-P11] reason must be one line, 1-120 chars' using errcode = '22023';
  end if;
  if p_qty is null or p_qty <= 0 or p_avg_price is null or p_avg_price <= 0 or p_currency not in ('KRW','USD') then
    raise exception '[R-VAL-M02] qty, avg_price (>0) and currency are required' using errcode = '22023';
  end if;
  select * into v_pos from public.positions where id = p_position_id and owner_id = v_uid and archived_at is null;
  if not found or v_pos.status not in ('holding','planned') then raise exception 'position not found' using errcode = 'P0002'; end if;
  if p_base_version is not null and p_base_version <> v_pos.approval_version then
    raise exception '[R-PERM-13] CONFLICT: position changed since the sheet was opened (approval_version %)', v_pos.approval_version using errcode = '40001';
  end if;

  perform set_config('mowa.via_user_correction', 'on', true);
  insert into public.position_proposals (owner_id, change_type, position_id, proposed_values, evidence, reason_md, client_ref)
  values (v_uid, case v_pos.status when 'planned' then 'open_holding' else 'set_qty_avg' end, p_position_id,
          jsonb_build_object('qty', p_qty, 'avg_price', p_avg_price, 'currency', p_currency),
          jsonb_build_array(jsonb_build_object('user_statement', btrim(p_reason), 'stated_at', now())),
          btrim(p_reason), p_client_ref)
  returning id into v_id;
  perform set_config('mowa.via_user_correction', 'off', true);

  v_p := public.approve_proposal(v_id, '{}'::jsonb, 'user correction');
  if v_p.status <> 'approved' then
    raise exception 'user correction could not be applied (%)', v_p.status using errcode = 'P0001';
  end if;
  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids, args_preview)
  values (v_uid, 'user', v_uid, 'proposal.user_correction', 'ok',
          jsonb_build_array(jsonb_build_object('table','position_proposals','id',v_id),
                            jsonb_build_object('table','positions','id',v_p.result_position_id)),
          jsonb_build_object('before', jsonb_build_object('qty', v_pos.qty, 'avg_price', v_pos.avg_price, 'currency', v_pos.currency),
                             'after', v_p.applied_values));
  return v_p;
end;
$$;
revoke all on function public.apply_user_correction(uuid, numeric, text, numeric, text, text, integer) from public, anon, service_role;
grant execute on function public.apply_user_correction(uuid, numeric, text, numeric, text, text, integer) to authenticated;

-- PM 결정 2026-11-21: '확인 필요' 그룹(conflict·expired) 확인. acknowledged_at/by만 설정하고 상태·행은 그대로(이력에 남음). 사용자만(봇 실행 권한 없음)
--   그룹 = status in ('conflict','expired') and acknowledged_at is null and attention_started_at > now() - interval '14 days' (R-PERM-13 v0.5 — decided_at·expires_at으로 계산하면 결함)
create or replace function public.acknowledge_proposal(p_id uuid)
returns public.position_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.position_proposals;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] acknowledge requires a user session' using errcode = '42501';
  end if;
  update public.position_proposals set acknowledged_at = now(), acknowledged_by = v_uid
   where id = p_id and owner_id = v_uid and status in ('conflict','expired') and acknowledged_at is null
  returning * into v_p;
  if not found then raise exception 'proposal not found in conflict/expired (or already acknowledged)' using errcode = 'P0002'; end if;
  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids)
  values (v_uid, 'user', v_uid, 'proposal.acknowledge', 'ok', jsonb_build_array(jsonb_build_object('table','position_proposals','id',p_id)));
  return v_p;
end;
$$;
revoke all on function public.acknowledge_proposal(uuid) from public, anon, service_role;
grant execute on function public.acknowledge_proposal(uuid) to authenticated;

create or replace function public.expire_stale_proposals()
returns integer language sql security definer set search_path = public, pg_temp as $$
  with a as (update public.position_proposals set status = 'expired', decided_at = now()
              where status = 'pending' and expires_at <= now() returning 1),
       b as (update public.principle_proposals set status = 'expired', decided_at = now()
              where status = 'pending' and expires_at <= now() returning 1)
  select ((select count(*) from a) + (select count(*) from b))::integer;
$$;
revoke all on function public.expire_stale_proposals() from public, anon, authenticated;

revoke all on function public.mowa_setting(uuid, text, jsonb) from public, anon;
