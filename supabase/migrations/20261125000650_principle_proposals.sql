-- MO_WA rebuild M1 · DRAFT (미적용) · 원칙 개정 제안 큐 principle_proposals
-- ⚠ 상태: 컬럼 초안 — 룰 매니저 제시안(rules v0.2 R-PERM-15, 2026-11-21)을 그대로 채택 + develop_boot 보강(clause_ref, base_body_hash 계산 방식, held_at).
--   PM·룰 매니저 검토 전. 운영 미적용.
-- 근거: R-PERM-15(최소 필드: 대상 원칙과 버전, 제안문, 이유, 근거, 제안자, 상태), R-PERM-13(상태 의미·on_hold·만료 재사용),
--       R-PERM-05(승인·거절은 사용자만), R-PERM-01/03, 권한 표 D8(봇 중 finance-manager만 P), R-SYS-03(영구 삭제 없음), R-SYS-05
-- position_proposals와 다른 점: 대상은 principles 리포트 1건, 충돌 기준은 reports.version + 본문 해시(base_body_hash).
--   positions 전용 필드·가드는 쓰지 않는다(R-PERM-15 "재사용하지 않는 것").
-- 표시 ID(PM 2026-11-21): owner 단위 별도 serial(display_sequences scope 'principle_proposal'), mowa_display_id('R', display_no) → R-0001(10000 이상 R-10000). PP- 표기는 쓰지 않는다
-- 제안 단위: 새 원칙 본문 전체(proposed_body_md). 조항 단위 diff는 화면이 base 본문과 비교해 보여준다(승인 결과가 모호하지 않게)

create table public.principle_proposals (
  id uuid primary key default gen_random_uuid(),
  display_no bigint not null,                  -- insert 때 mowa_display_no_assign('principle_proposal')이 발급, 불변·재사용 없음
  display_id text generated always as (public.mowa_display_id('R', display_no)) stored,  -- FE는 이 문자열만 표시(직접 채번·uuid 앞자리 금지)
  owner_id uuid not null references auth.users(id) on delete cascade,
  principle_id uuid not null references public.reports(id) on delete restrict,  -- 대상 principles 리포트(현재 유효본)
  base_version integer not null,               -- 서버가 채움: 제안 시점 reports.version
  base_body_hash text not null,                -- 서버가 채움: hex(sha256(제안 시점 body_md)) — 승인 시 대상이 바뀌었으면 conflict
  clause_ref text check (clause_ref is null or char_length(clause_ref) between 1 and 80),   -- 선택: 주로 바뀌는 조항(예: '3-2 손절') — 목록 표시용
  proposed_body_md text not null check (char_length(btrim(proposed_body_md)) > 0 and octet_length(proposed_body_md) <= 1048576),  -- 제안문 = 새 본문 전체(R-VAL-S02 한도)
  reason_md text not null check (char_length(reason_md) between 1 and 4000),          -- 이유
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) >= 1),  -- 근거 필수(사용자 진술 가능)
  proposed_by_type text not null check (proposed_by_type in ('bot','user')),                 -- 서버가 채움
  proposed_by uuid references public.bot_clients(id) on delete set null,
  proposed_by_user uuid,
  client_ref text,                                                                      -- 멱등(R-PERM-11)
  status text not null default 'pending'
    check (status in ('pending','on_hold','approved','rejected','superseded','cancelled','expired','conflict')),
  expires_at timestamptz not null,             -- 서버가 채움: mowa_proposal_expiry(owner) (기본 7일, app_settings). on_hold는 만료 제외
  held_at timestamptz,
  decision_note text,
  decided_at timestamptz,
  decided_by uuid,
  superseded_by uuid references public.principle_proposals(id) on delete set null,
  applied_report_id uuid references public.reports(id) on delete restrict,  -- 승인으로 생긴 새 원칙 개정본
  attention_started_at timestamptz,            -- conflict·expired가 된 시각(14일 시계, 트리거 mowa_attention_stamp). R-PERM-15 v0.5: decided_at·expires_at 기반 계산은 결함
  acknowledged_at timestamptz,                 -- '확인 필요' 그룹(conflict·expired) 사용자 확인 시각. position_proposals와 같은 규칙
  acknowledged_by uuid,                        -- 사용자만(봇 403)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_ref),
  constraint principle_proposals_one_proposer check (
    (proposed_by_type = 'bot'  and proposed_by is not null and proposed_by_user is null) or
    (proposed_by_type = 'user' and proposed_by_user is not null and proposed_by is null)),
  constraint principle_proposals_owner_display_no_key unique (owner_id, display_no)
);
create index principle_proposals_owner_status_idx on public.principle_proposals (owner_id, status, created_at desc);
create index principle_proposals_attention_idx on public.principle_proposals (owner_id, attention_started_at desc)
  where status in ('conflict','expired') and acknowledged_at is null;
create index principle_proposals_target_idx on public.principle_proposals (principle_id) where status in ('pending','on_hold');
create trigger principle_proposals_updated_at before update on public.principle_proposals
  for each row execute function public.set_updated_at();

-- 가드: 봇은 pending 생성 + 자기 pending 제안 취소만. 서버 필드는 제출 값 무시(R-PERM-03). 사용자 제안은 웹 세션에서만(R-VAL-P11 준용)
create or replace function public.principle_proposals_prepare()
returns trigger language plpgsql as $$
declare
  v_rep public.reports;
begin
  if tg_op = 'INSERT' then
    if public.mowa_is_service() then
      new.proposed_by_type := 'bot';
      new.proposed_by := public.mowa_current_bot();
      new.proposed_by_user := null;
      if new.proposed_by is null then raise exception '[R-PERM-03] missing bot identity' using errcode = '42501'; end if;
      -- M-4: revoked/expired/other-owner rejected
      perform public.mowa_assert_bot_tenant(new.owner_id);
      if not exists (select 1 from public.bot_clients b where b.id = new.proposed_by and b.owner_id = new.owner_id
                       and b.profile = 'finance-manager' and 'principles:propose' = any(b.scopes)
                       and b.revoked_at is null
                       and (b.expires_at is null or b.expires_at > now())) then
        raise exception '[R-PERM-04] only finance-manager with principles:propose can propose (D8)' using errcode = '42501';
      end if;
    elsif auth.uid() is not null and coalesce(auth.role(), '') = 'authenticated' then
      if new.owner_id <> auth.uid() then raise exception 'owner mismatch' using errcode = '42501'; end if;
      new.proposed_by_type := 'user';
      new.proposed_by_user := auth.uid();
      new.proposed_by := null;
    else
      raise exception '[R-PERM-15] proposals come from finance-manager (MCP) or a user session only' using errcode = '42501';
    end if;
    if new.status <> 'pending' or new.decided_at is not null or new.decided_by is not null
       or new.applied_report_id is not null or new.superseded_by is not null or new.held_at is not null then
      raise exception '[R-PERM-05] new proposals must start as pending' using errcode = '42501';
    end if;
    select * into v_rep from public.reports where id = new.principle_id and owner_id = new.owner_id;
    if not found or v_rep.kind <> 'principles' or v_rep.archived_at is not null then
      raise exception '[R-PERM-15] target must be an active principles report' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(new.evidence) e
                where (e ? 'report_id' and not exists (select 1 from public.reports r
                         where r.id::text = e->>'report_id' and r.owner_id = new.owner_id))
                   or (e ? 'journal_entry_id' and not exists (select 1 from public.journal_entries j
                         where j.id::text = e->>'journal_entry_id' and j.owner_id = new.owner_id))) then
      raise exception '[R-VAL-P10] evidence references a missing report/journal entry' using errcode = '22023';
    end if;
    new.base_version := v_rep.version;
    new.base_body_hash := encode(extensions.digest(v_rep.body_md, 'sha256'), 'hex');
    new.expires_at := public.mowa_proposal_expiry(new.owner_id);
    return new;
  end if;

  -- M-2: superseded only when pg_trigger_depth()>1; bot direct UPDATE = cancelled on own proposal; lock other columns
  if public.mowa_is_service() then
    if tg_op = 'DELETE' then raise exception '[R-PERM-01] bots cannot delete proposals' using errcode = '42501'; end if;
    if new.status = 'superseded' then
      if pg_trigger_depth() <= 1 or old.status not in ('pending','on_hold') then
        raise exception '[R-PERM-05] bots cannot mark proposals superseded (server-only)' using errcode = '42501';
      end if;
      if new.owner_id is distinct from old.owner_id
         or (new.proposed_body_md, new.reason_md, new.base_version, new.base_body_hash, new.evidence, new.display_no)
            is distinct from (old.proposed_body_md, old.reason_md, old.base_version, old.base_body_hash, old.evidence, old.display_no)
         or (new.acknowledged_at, new.acknowledged_by, new.attention_started_at)
            is distinct from (old.acknowledged_at, old.acknowledged_by, old.attention_started_at) then
        raise exception '[R-PERM-05] superseded update may only change status/decision fields' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.status <> 'cancelled'
       or old.status not in ('pending','on_hold')
       or old.proposed_by_type <> 'bot'
       or old.proposed_by is distinct from public.mowa_current_bot()
       or new.owner_id is distinct from old.owner_id
       or (new.proposed_body_md, new.reason_md, new.base_version, new.base_body_hash, new.evidence, new.display_no, new.principle_id)
          is distinct from (old.proposed_body_md, old.reason_md, old.base_version, old.base_body_hash, old.evidence, old.display_no, old.principle_id)
       or new.applied_report_id is not null or new.decided_by is not null
       or (new.acknowledged_at, new.acknowledged_by, new.attention_started_at)
          is distinct from (old.acknowledged_at, old.acknowledged_by, old.attention_started_at) then
      raise exception '[R-PERM-05] bots can only cancel their own pending/on_hold proposals' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger b_principle_proposals_attention before update of status on public.principle_proposals
  for each row execute function public.mowa_attention_stamp();
create trigger a0_principle_proposals_display_no before insert or update on public.principle_proposals
  for each row execute function public.mowa_display_no_assign('principle_proposal');
create trigger a_principle_proposals_prepare before insert or update or delete on public.principle_proposals
  for each row execute function public.principle_proposals_prepare();

-- 같은 원칙에 새 제안 → 이전 pending·on_hold는 superseded (R-PERM-13 v0.2: on_hold에도 적용)
create or replace function public.principle_proposals_supersede()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.principle_proposals p
     set status = 'superseded', superseded_by = new.id, decided_at = now()
   where p.owner_id = new.owner_id and p.status in ('pending','on_hold') and p.id <> new.id
     and p.principle_id = new.principle_id;
  return null;
end;
$$;
create trigger principle_proposals_supersede after insert on public.principle_proposals
  for each row execute function public.principle_proposals_supersede();

-- RLS: 사용자는 읽기 + 사용자 제안 insert. 상태 변경은 RPC만. 삭제 없음(Q-01)
alter table public.principle_proposals enable row level security;
revoke all on table public.principle_proposals from anon;
revoke update, delete, truncate on table public.principle_proposals from authenticated;
grant select, insert on table public.principle_proposals to authenticated;
create policy "principle_proposals_owner_select" on public.principle_proposals for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "principle_proposals_owner_insert" on public.principle_proposals for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- 승인: 대상의 version·본문 해시가 제안 시점과 같을 때만 → 새 principles 개정본(report_date = 오늘 KST, 같은 slug, 사용자 작성)
--   p_final_body_md를 주면 사용자가 고친 최종 본문을 쓴다(없으면 proposed_body_md). 봇은 실행 불가(R-PERM-05)
create or replace function public.approve_principle_proposal(p_id uuid, p_final_body_md text default null, p_summary text default null, p_note text default null)
returns public.principle_proposals
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.principle_proposals;
  v_rep public.reports;
  v_new uuid;
  v_date date := (now() at time zone 'Asia/Seoul')::date;   -- R-SYS-02
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] approve requires a user session' using errcode = '42501';
  end if;
  select * into v_p from public.principle_proposals where id = p_id for update;
  if not found or v_p.owner_id <> v_uid then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  if v_p.status not in ('pending','on_hold') then raise exception 'proposal is already %', v_p.status using errcode = 'P0001'; end if;
  if v_p.status = 'pending' and v_p.expires_at <= now() then
    update public.principle_proposals set status = 'expired', decided_at = now() where id = p_id returning * into v_p;
    return v_p;
  end if;
  select * into v_rep from public.reports where id = v_p.principle_id for update;
  if v_rep.version <> v_p.base_version or encode(extensions.digest(v_rep.body_md, 'sha256'), 'hex') <> v_p.base_body_hash
     or v_rep.archived_at is not null then
    update public.principle_proposals set status = 'conflict', decided_at = now(), decided_by = v_uid
     where id = p_id returning * into v_p;
    return v_p;                                   -- reports 변경 없음(R-PERM-13 conflict)
  end if;

  insert into public.reports (owner_id, kind, domain, slug, title, headline, report_date, summary, body_md, tags, status, source_bot_id, meta)
  values (v_uid, 'principles', v_rep.domain, v_rep.slug, v_rep.title, v_rep.headline, v_date,
          coalesce(p_summary, v_rep.summary), coalesce(nullif(btrim(p_final_body_md), ''), v_p.proposed_body_md),
          v_rep.tags, 'published', null,
          jsonb_build_object('revised_from', v_rep.id, 'principle_proposal_id', p_id))
  on conflict (owner_id, kind, report_date, slug) do update
     set body_md = excluded.body_md, summary = excluded.summary, meta = public.reports.meta || excluded.meta
  returning id into v_new;

  update public.principle_proposals
     set status = 'approved', decided_at = now(), decided_by = v_uid, decision_note = p_note, applied_report_id = v_new
   where id = p_id returning * into v_p;
  -- 같은 원칙의 나머지 열린 제안은 superseded(승인된 제안이 대체)
  update public.principle_proposals set status = 'superseded', superseded_by = p_id, decided_at = now(), decided_by = v_uid
   where owner_id = v_uid and principle_id = v_p.principle_id and status in ('pending','on_hold') and id <> p_id;

  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids, args_preview)
  values (v_uid, 'user', v_uid, 'principle_proposal.approve', 'ok',
          jsonb_build_array(jsonb_build_object('table','principle_proposals','id',p_id),
                            jsonb_build_object('table','reports','id',v_new)),
          jsonb_build_object('display_id', public.mowa_display_id('R', v_p.display_no), 'edited', p_final_body_md is not null));
  return v_p;
end;
$$;
revoke all on function public.approve_principle_proposal(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.approve_principle_proposal(uuid, text, text, text) to authenticated;

create or replace function public.decide_principle_proposal(p_id uuid, p_action text, p_note text default null)
returns public.principle_proposals
language plpgsql security definer set search_path = public, pg_temp
as $$
-- p_action: 'reject' (pending|on_hold → rejected) / 'hold' (pending → on_hold) / 'unhold' (on_hold → pending, 만료 재계산)
--           'ack' (conflict|expired → acknowledged_at/by만 설정, 상태 불변)
--           'cancel' (사용자 작성 제안만 pending|on_hold → cancelled, R-VAL-P14·Q-29. 봇 제안은 reject로 거절)
declare
  v_uid uuid := auth.uid();
  v_p public.principle_proposals;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] requires a user session' using errcode = '42501';
  end if;
  if p_action = 'reject' then
    update public.principle_proposals set status = 'rejected', decided_at = now(), decided_by = v_uid, decision_note = p_note
     where id = p_id and owner_id = v_uid and status in ('pending','on_hold') returning * into v_p;
  elsif p_action = 'hold' then
    update public.principle_proposals set status = 'on_hold', held_at = now(), decision_note = coalesce(p_note, decision_note)
     where id = p_id and owner_id = v_uid and status = 'pending' and expires_at > now() returning * into v_p;
  elsif p_action = 'unhold' then
    update public.principle_proposals set status = 'pending', held_at = null, expires_at = public.mowa_proposal_expiry(v_uid)
     where id = p_id and owner_id = v_uid and status = 'on_hold' returning * into v_p;
  elsif p_action = 'ack' then
    update public.principle_proposals set acknowledged_at = now(), acknowledged_by = v_uid
     where id = p_id and owner_id = v_uid and status in ('conflict','expired') and acknowledged_at is null returning * into v_p;
  elsif p_action = 'cancel' then
    if exists (select 1 from public.principle_proposals where id = p_id and owner_id = v_uid and proposed_by_type <> 'user') then
      raise exception '[R-PERM-05] users reject bot proposals instead of cancelling them (Q-29)' using errcode = '42501';
    end if;
    update public.principle_proposals set status = 'cancelled', decided_at = now(), decided_by = v_uid, decision_note = p_note
     where id = p_id and owner_id = v_uid and proposed_by_type = 'user' and proposed_by_user = v_uid
       and status in ('pending','on_hold') returning * into v_p;
  else
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  if not found then raise exception 'proposal not found in expected state' using errcode = 'P0002'; end if;
  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids)
  values (v_uid, 'user', v_uid, 'principle_proposal.' || p_action, 'ok',
          jsonb_build_array(jsonb_build_object('table','principle_proposals','id',p_id)));
  return v_p;
end;
$$;
revoke all on function public.decide_principle_proposal(uuid, text, text) from public, anon, service_role;
grant execute on function public.decide_principle_proposal(uuid, text, text) to authenticated;

-- 권한 표 targets_valuation: equity-analyst만 W. finance-manager(Q-25: 목표가·의견은 reports.meta + 본문, R-VAL-R13 WARN) 등 다른 봇은 403
-- M-4: tenant assert first; equity-analyst profile limit does not replace tenant guard
create or replace function public.targets_valuation_guard()
returns trigger language plpgsql as $$
declare
  v_bot uuid;
begin
  if public.mowa_is_service() then
    if tg_op = 'DELETE' then
      raise exception '[R-PERM-01] bots cannot delete' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
      raise exception '[R-PERM-01] owner_id is immutable' using errcode = '42501';
    end if;
    v_bot := public.mowa_assert_bot_tenant(case when tg_op = 'UPDATE' then old.owner_id else new.owner_id end);
    if not exists (select 1 from public.bot_clients b where b.id = v_bot and b.profile = 'equity-analyst') then
      raise exception '[R-PERM-04] targets_valuation is equity-analyst only (Q-25)' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger a0_targets_valuation_guard before insert or update or delete on public.targets_valuation
  for each row execute function public.targets_valuation_guard();
