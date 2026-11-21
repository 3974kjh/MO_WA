-- BE-17: principle revision proposal queue — RPC hardening only (table already in 00650).
-- Do NOT apply this file to remote/Preview from the agent — PM only. Local mowa_local only.
--
-- Schema note (design vs 00650 — keep 00650 names; do not rename):
--   design proposed_by_bot_id / proposed_by_user_id  → actual proposed_by / proposed_by_user
--   design proposer_type                            → actual proposed_by_type
--   design snapshot-or-hash                          → actual base_body_hash (+ base_version)
--   Extra vs design: clause_ref, held_at, client_ref, applied_report_id, display_id generated
--
-- Gaps closed here (approve/decide already exist in 00650):
--   1) approve must INSERT a new principles report row — never ON CONFLICT UPDATE the live row
--      (R-PERM-15 / "기존 행 덮어쓰기 없음"). Same-day unique key clash → conflict status.
--   2) audit args_preview carries before/after (report id, version, body hash).
--   3) decide locks the row FOR UPDATE (same concurrency pattern as approve).
--
-- GRANT note (same class as 20261125100000 reports render-cache):
--   These are CREATE OR REPLACE of SECURITY DEFINER functions. Re-REVOKE/GRANT EXECUTE
--   explicitly — do not rely on DEFAULT PRIVILEGES alone. No new tables/columns in this
--   file; if a later migration adds columns to principle_proposals after table-level
--   REVOKE UPDATE on authenticated, re-GRANT only the columns RPC/triggers need.
--
-- Rollback (manual, after this file applied):
--   -- Restore 00650 bodies of approve_principle_proposal / decide_principle_proposal
--   -- (copy from supabase/migrations/20261125000650_principle_proposals.sql), then:
--   REVOKE ALL ON FUNCTION public.approve_principle_proposal(uuid, text, text, text)
--     FROM PUBLIC, anon, service_role;
--   GRANT EXECUTE ON FUNCTION public.approve_principle_proposal(uuid, text, text, text)
--     TO authenticated;
--   REVOKE ALL ON FUNCTION public.decide_principle_proposal(uuid, text, text)
--     FROM PUBLIC, anon, service_role;
--   GRANT EXECUTE ON FUNCTION public.decide_principle_proposal(uuid, text, text)
--     TO authenticated;

create or replace function public.approve_principle_proposal(
  p_id uuid,
  p_final_body_md text default null,
  p_summary text default null,
  p_note text default null
)
returns public.principle_proposals
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.principle_proposals;
  v_rep public.reports;
  v_new uuid;
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  v_body text;
  v_before_hash text;
  v_after_hash text;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] approve requires a user session' using errcode = '42501';
  end if;

  select * into v_p from public.principle_proposals where id = p_id for update;
  if not found or v_p.owner_id <> v_uid then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_p.status not in ('pending', 'on_hold') then
    raise exception 'proposal is already %', v_p.status using errcode = 'P0001';
  end if;
  if v_p.status = 'pending' and v_p.expires_at <= now() then
    update public.principle_proposals
       set status = 'expired', decided_at = now()
     where id = p_id
     returning * into v_p;
    return v_p;
  end if;

  select * into v_rep from public.reports where id = v_p.principle_id for update;
  v_before_hash := encode(extensions.digest(v_rep.body_md, 'sha256'), 'hex');
  if v_rep.version <> v_p.base_version
     or v_before_hash <> v_p.base_body_hash
     or v_rep.archived_at is not null then
    update public.principle_proposals
       set status = 'conflict', decided_at = now(), decided_by = v_uid
     where id = p_id
     returning * into v_p;
    return v_p;
  end if;

  v_body := coalesce(nullif(btrim(p_final_body_md), ''), v_p.proposed_body_md);
  v_after_hash := encode(extensions.digest(v_body, 'sha256'), 'hex');

  begin
    insert into public.reports (
      owner_id, kind, domain, slug, title, headline, report_date, summary, body_md,
      tags, status, source_bot_id, meta
    ) values (
      v_uid, 'principles', v_rep.domain, v_rep.slug, v_rep.title, v_rep.headline, v_date,
      coalesce(p_summary, v_rep.summary), v_body,
      v_rep.tags, 'published', null,
      jsonb_build_object('revised_from', v_rep.id, 'principle_proposal_id', p_id)
    )
    returning id into v_new;
  exception
    when unique_violation then
      -- Never overwrite an existing principles row (same owner/kind/date/slug).
      update public.principle_proposals
         set status = 'conflict', decided_at = now(), decided_by = v_uid,
             decision_note = coalesce(p_note, 'same-day principles key already exists')
       where id = p_id
       returning * into v_p;
      return v_p;
  end;

  -- Target principle_id row stays immutable; only the new revision id is linked.
  update public.principle_proposals
     set status = 'approved', decided_at = now(), decided_by = v_uid,
         decision_note = p_note, applied_report_id = v_new
   where id = p_id
   returning * into v_p;

  update public.principle_proposals
     set status = 'superseded', superseded_by = p_id, decided_at = now(), decided_by = v_uid
   where owner_id = v_uid
     and principle_id = v_p.principle_id
     and status in ('pending', 'on_hold')
     and id <> p_id;

  insert into public.mcp_audit_log (
    owner_id, actor_type, user_id, tool, result, affected_ids, args_preview
  ) values (
    v_uid, 'user', v_uid, 'principle_proposal.approve', 'ok',
    jsonb_build_array(
      jsonb_build_object('table', 'principle_proposals', 'id', p_id),
      jsonb_build_object('table', 'reports', 'id', v_new)
    ),
    jsonb_build_object(
      'display_id', public.mowa_display_id('R', v_p.display_no),
      'edited', p_final_body_md is not null and btrim(p_final_body_md) <> '',
      'before', jsonb_build_object(
        'report_id', v_rep.id,
        'version', v_rep.version,
        'body_hash', v_before_hash
      ),
      'after', jsonb_build_object(
        'report_id', v_new,
        'body_hash', v_after_hash
      )
    )
  );
  return v_p;
end;
$$;

revoke all on function public.approve_principle_proposal(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.approve_principle_proposal(uuid, text, text, text)
  to authenticated;

create or replace function public.decide_principle_proposal(
  p_id uuid,
  p_action text,
  p_note text default null
)
returns public.principle_proposals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
-- p_action: reject | hold | unhold | cancel | ack
declare
  v_uid uuid := auth.uid();
  v_p public.principle_proposals;
  v_before jsonb;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] requires a user session' using errcode = '42501';
  end if;

  select * into v_p from public.principle_proposals where id = p_id for update;
  if not found or v_p.owner_id <> v_uid then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  v_before := jsonb_build_object(
    'status', v_p.status,
    'acknowledged_at', v_p.acknowledged_at,
    'expires_at', v_p.expires_at
  );

  if p_action = 'reject' then
    if v_p.status not in ('pending', 'on_hold') then
      raise exception 'proposal not found in expected state' using errcode = 'P0002';
    end if;
    update public.principle_proposals
       set status = 'rejected', decided_at = now(), decided_by = v_uid, decision_note = p_note
     where id = p_id
     returning * into v_p;
  elsif p_action = 'hold' then
    if v_p.status <> 'pending' or v_p.expires_at <= now() then
      raise exception 'proposal not found in expected state' using errcode = 'P0002';
    end if;
    update public.principle_proposals
       set status = 'on_hold', held_at = now(), decision_note = coalesce(p_note, decision_note)
     where id = p_id
     returning * into v_p;
  elsif p_action = 'unhold' then
    if v_p.status <> 'on_hold' then
      raise exception 'proposal not found in expected state' using errcode = 'P0002';
    end if;
    -- expires_at recalculated from unhold time (mowa_proposal_expiry / app_settings, default 7d)
    update public.principle_proposals
       set status = 'pending', held_at = null, expires_at = public.mowa_proposal_expiry(v_uid)
     where id = p_id
     returning * into v_p;
  elsif p_action = 'ack' then
    if v_p.status not in ('conflict', 'expired') or v_p.acknowledged_at is not null then
      raise exception 'proposal not found in expected state' using errcode = 'P0002';
    end if;
    -- status/row otherwise unchanged — leaves '확인 필요' group only
    update public.principle_proposals
       set acknowledged_at = now(), acknowledged_by = v_uid
     where id = p_id
     returning * into v_p;
  elsif p_action = 'cancel' then
    if v_p.proposed_by_type <> 'user' then
      raise exception '[R-PERM-05] users reject bot proposals instead of cancelling them (Q-29)'
        using errcode = '42501';
    end if;
    if v_p.proposed_by_user <> v_uid or v_p.status not in ('pending', 'on_hold') then
      raise exception 'proposal not found in expected state' using errcode = 'P0002';
    end if;
    update public.principle_proposals
       set status = 'cancelled', decided_at = now(), decided_by = v_uid, decision_note = p_note
     where id = p_id
     returning * into v_p;
  else
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;

  insert into public.mcp_audit_log (
    owner_id, actor_type, user_id, tool, result, affected_ids, args_preview
  ) values (
    v_uid, 'user', v_uid, 'principle_proposal.' || p_action, 'ok',
    jsonb_build_array(jsonb_build_object('table', 'principle_proposals', 'id', p_id)),
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'status', v_p.status,
        'acknowledged_at', v_p.acknowledged_at,
        'expires_at', v_p.expires_at
      )
    )
  );
  return v_p;
end;
$$;

revoke all on function public.decide_principle_proposal(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.decide_principle_proposal(uuid, text, text)
  to authenticated;
