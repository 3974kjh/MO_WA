-- MO_WA rebuild M1 · DRAFT (미적용) · 봇 키 / 레이트리밋 / 감사 로그 / 승인 큐 + 봇 쓰기 가드
-- 근거: rules.md R-PERM-01~05, R-PERM-10(HMAC 수용), R-PERM-13(상태 7종), R-PERM-14(service-role 조건), R-PERM-16, R-SYS-05, R-VAL-P01~P07, R-VAL-R11

-- 봇별 API 키 (R-PERM-10). key = 'mowa_' || key_prefix || '_' || secret
-- key_hash = hex(HMAC-SHA256(MCP_KEY_PEPPER, secret)) — R-PERM-10(2026-11-21 개정, 수용).
--   키 원문은 발급 때 한 번만 보여주고 어디에도 저장·로그하지 않는다. pepper는 DB·저장소·wrangler·로그에 두지 않는다(Cloudflare secret만).
--   pepper 교체 = 모든 키 재발급.
create table public.bot_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                          -- 'finance-manager-boot'
  profile text not null check (profile in ('finance-manager','equity-analyst','house-signal','importer','custom')),
  description text,
  key_prefix text not null unique check (key_prefix ~ '^[a-z0-9]{10}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{read}',
  rate_limit_per_min integer not null default 60 check (rate_limit_per_min between 1 and 600),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  last_used_at timestamptz,
  last_used_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name),
  -- PM 확정: 수량·평단 제안은 finance-manager-boot만 (R-PERM 표 D3 qty/avg = finance-manager P)
  constraint bot_clients_propose_only_fm check (not ('positions:propose' = any(scopes)) or profile = 'finance-manager'),
  -- R-PERM-15 / 권한 표 D8: 원칙 개정 제안은 finance-manager만
  constraint bot_clients_principles_propose_only_fm check (not ('principles:propose' = any(scopes)) or profile = 'finance-manager'),
  -- importer(이전 전용) 키는 만료 필수
  constraint bot_clients_importer_expires check (profile <> 'importer' or expires_at is not null)
);
create trigger bot_clients_updated_at before update on public.bot_clients
  for each row execute function public.set_updated_at();

create table public.mcp_rate_buckets (
  bot_client_id uuid not null references public.bot_clients(id) on delete cascade,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bot_client_id, window_start)
);

-- 감사 로그 (R-SYS-05). 이름은 rules 표기(mcp_audit_log) 그대로, 사용자 승인 이벤트도 함께 기록(actor_type)
create table public.mcp_audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_type text not null check (actor_type in ('bot','user','system')),
  bot_client_id uuid references public.bot_clients(id) on delete set null,
  user_id uuid,
  tool text not null,                          -- 'upsert_report' | 'proposal.approve' | 'bot_key.revoke' ...
  request_id text,
  args_digest text,                            -- sha256(정렬 JSON)
  args_preview jsonb,                          -- 2KB 이하 요약(본문 제외)
  result text not null check (result in ('ok','error','denied','rate_limited')),
  error_code text,
  rule_ids text[] not null default '{}',       -- 위반·경고 규칙 ID (예: {R-VAL-T05})
  warnings jsonb not null default '[]'::jsonb, -- WARN 목록 [{rule, field, message}] (§0-4 ERROR/WARN, PM 확정)
  affected_ids jsonb not null default '[]'::jsonb,  -- [{"table":"reports","id":"..."}]
  duration_ms integer,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index mcp_audit_log_owner_time_idx on public.mcp_audit_log (owner_id, created_at desc);
create index mcp_audit_log_bot_time_idx on public.mcp_audit_log (bot_client_id, created_at desc);
create index mcp_audit_log_warn_idx on public.mcp_audit_log (owner_id, created_at desc) where jsonb_array_length(warnings) > 0;

create or replace function public.mcp_audit_log_append_only()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('mowa.audit_purge', true), '') <> 'on' then
    raise exception '[R-SYS-05] mcp_audit_log is append-only' using errcode = '42501';
  end if;
  return coalesce(old, new);
end;
$$;
create trigger mcp_audit_log_no_update before update or delete on public.mcp_audit_log
  for each row execute function public.mcp_audit_log_append_only();

-- M-3: block TRUNCATE (row triggers do not fire on TRUNCATE)
create or replace function public.mcp_audit_log_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception '[R-SYS-05] mcp_audit_log cannot be truncated' using errcode = '42501';
end;
$$;
create trigger mcp_audit_log_no_truncate before truncate on public.mcp_audit_log
  for each statement execute function public.mcp_audit_log_no_truncate();
revoke truncate on table public.mcp_audit_log from public, anon, authenticated, service_role;

-- ── 표시 ID 카운터 display_sequences (PM 결정 2026-11-21, 디자인 v1.1 표시 규칙) ──
-- owner·scope별 행 잠금 카운터. 증가만 하고 감소하지 않는다 → 취소·거절·만료 뒤에도 번호를 다시 쓰지 않는다.
-- scope: 'position_proposal'(표시 P-0412, 10000 이상은 P-10000) / 'principle_proposal'(표시 R-0001).
--   주의: lpad(n::text,4,'0')는 4자보다 긴 값을 잘라 10000 → '1000'이 된다. 표시는 반드시 mowa_display_id()(아래)나 같은 규칙의 FE 함수로 만든다. 내부 PK는 두 테이블 모두 uuid 유지.
-- 직접 접근 권한 없음(RLS on, 정책 없음, grant 회수). 번호는 BEFORE INSERT 트리거의 SECURITY DEFINER 함수만 발급한다.
create table public.display_sequences (
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('position_proposal','principle_proposal')),
  next_no bigint not null default 1 check (next_no >= 1),
  updated_at timestamptz not null default now(),
  primary key (owner_id, scope)
);
alter table public.display_sequences enable row level security;
revoke all on public.display_sequences from public, anon, authenticated, service_role;

-- upsert가 (owner_id, scope) 행을 잠그므로 동시 insert도 번호가 겹치지 않는다. 롤백되면 증가도 같이 롤백(빈 번호 없음, 재사용 없음)
create or replace function public.mowa_next_display_no(p_owner uuid, p_scope text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_no bigint;
begin
  insert into public.display_sequences as d (owner_id, scope, next_no) values (p_owner, p_scope, 2)
  on conflict (owner_id, scope) do update set next_no = d.next_no + 1, updated_at = now()
  returning d.next_no - 1 into v_no;
  return v_no;
end;
$$;
revoke all on function public.mowa_next_display_no(uuid, text) from public, anon, authenticated, service_role;

-- 표시 문자열: 4자리 0채움, 10000 이상은 그대로(P-10000). lpad 단독 사용 금지(잘림)
create or replace function public.mowa_display_id(p_prefix text, p_no bigint)
returns text language sql immutable as $$
  select p_prefix || '-' || case when p_no < 10000 then lpad(p_no::text, 4, '0') else p_no::text end
$$;

-- 트리거 함수: insert 시 클라이언트 값과 상관없이 번호 발급, update 시 변경 금지(불변)
create or replace function public.mowa_display_no_assign()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.display_no := public.mowa_next_display_no(new.owner_id, tg_argv[0]);
  elsif new.display_no is distinct from old.display_no or new.owner_id is distinct from old.owner_id then
    raise exception '[DISPLAY-ID] display_no and owner_id are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── 보유 승인 큐 position_proposals (R-PERM-13, rules v0.2) ──
-- positions 변경 제안만 담는다. 원칙 개정 제안은 넣지 않는다(R-PERM-15 → principle_proposals, 000650 파일).
-- change_type: open_holding, set_qty_avg, close (확정). set_trigger·set_breakeven은 v0.4에서 제거(사용자 확정 Q-13 → R-PERM-17 직접 쓰기, R-VAL-P07 거부)
-- 제안자: finance-manager 봇(proposed_by_type='bot') 또는 웹 사용자(proposed_by_type='user', G-4, R-VAL-P11)
-- 상태(8): pending, on_hold(비종결, 사용자만, G-1), approved, rejected, superseded, cancelled, expired, conflict
--   open_holding  : 새 보유 행 생성(instrument_id) 또는 planned 행을 holding으로 전환(position_id). proposed: qty, avg_price, currency
--   set_qty_avg   : holding 행의 수량·평단 변경(추가매수·일부매도 반영). proposed: qty 그리고/또는 avg_price (사용자 정정은 currency 포함). trigger_price·trigger_direction·breakeven·watch_only는 R-VAL-P07 ERROR
--   close         : holding/planned 행 청산(status=closed, qty=0). proposed: {} (근거만)
create table public.position_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_no bigint not null,                  -- 표시 ID(PM 2026-11-21): owner 단위 serial, display_sequences('position_proposal')가 insert 때 발급, 불변·재사용 없음. 화면 mowa_display_id('P', display_no) → P-0412, 10000 이상 P-10000
  display_id text generated always as (public.mowa_display_id('P', display_no)) stored,  -- FE는 이 문자열만 표시(직접 채번·uuid 앞자리 금지)
  change_type text not null check (change_type in ('open_holding','set_qty_avg','close')),
  position_id uuid references public.positions(id) on delete restrict,
  instrument_id uuid references public.instruments(id) on delete restrict,
  current_values jsonb,                        -- 서버가 채움(트리거)
  base_version integer,                        -- 서버가 채움: positions.approval_version (충돌 감지)
  proposed_values jsonb not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) >= 1),  -- R-VAL-P07
  reason_md text check (reason_md is null or char_length(reason_md) <= 4000),
  calc_note text check (calc_note is null or (char_length(calc_note) between 1 and 200 and calc_note !~ '[\r\n]')),  -- G-7 / R-VAL-P09 (선택, 필수 여부 Q-30)
  proposed_by_type text not null default 'bot' check (proposed_by_type in ('bot','user')),  -- 서버가 채움 (G-4, R-VAL-P11)
  proposed_by uuid references public.bot_clients(id) on delete set null,   -- 봇 제안: 서버가 채움 (R-PERM-03)
  proposed_by_user uuid,                                                   -- 사용자 제안: 서버가 auth.uid()로 채움
  client_ref text,
  status text not null default 'pending'
    check (status in ('pending','on_hold','approved','rejected','superseded','cancelled','expired','conflict')),
  expires_at timestamptz not null,               -- 서버가 채움: mowa_proposal_expiry(owner) = 기본 7일, app_settings로 변경(Q-28). on_hold는 만료 제외(G-1)
  held_at timestamptz,                           -- on_hold 설정 시각(사용자)
  decided_at timestamptz,
  decided_by uuid,
  decision_note text,
  applied_values jsonb,                        -- 사용자가 고친 값 포함 최종 반영값
  result_position_id uuid,
  attention_started_at timestamptz,            -- R-PERM-13 v0.5: conflict 또는 expired가 된 시각(14일 '확인 필요' 시계). decided_at·expires_at으로 14일을 계산하면 결함. 트리거가 채움
  acknowledged_at timestamptz,                 -- PM 결정 2026-11-21 '확인 필요' 그룹: 사용자 확인 시각(상태는 바꾸지 않음)
  acknowledged_by uuid,                        -- 사용자만(봇 403). acknowledge_proposal RPC로만 설정
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_ref),
  constraint position_proposals_proposer check (
    (proposed_by_type = 'bot' and proposed_by_user is null) or (proposed_by_type = 'user' and proposed_by is null and proposed_by_user is not null)),
  constraint position_proposals_target check (
    case change_type
      when 'open_holding' then position_id is not null or instrument_id is not null
      else position_id is not null end),
  constraint position_proposals_owner_display_no_key unique (owner_id, display_no)
);
create index position_proposals_pending_idx on public.position_proposals (owner_id, created_at desc) where status = 'pending';
create index position_proposals_position_idx on public.position_proposals (position_id, status);
-- '확인 필요' 그룹: status in (conflict, expired) and acknowledged_at is null and attention_started_at > now() - interval '14 days'
create index position_proposals_attention_idx on public.position_proposals (owner_id, attention_started_at desc)
  where status in ('conflict','expired') and acknowledged_at is null;
create trigger position_proposals_updated_at before update on public.position_proposals
  for each row execute function public.set_updated_at();

-- 지연 FK (source_bot_id → bot_clients)
do $$
declare t text;
begin
  foreach t in array array['instruments','positions','journal_entries','reports','price_snapshots','portfolio_snapshots',
                           'targets_valuation','market_indicators','decisions','events',
                           're_complexes','re_complex_snapshots','re_market_stats','re_subscriptions'] loop
    execute format('alter table public.%1$I add constraint %1$s_source_bot_fk foreign key (source_bot_id) references public.bot_clients(id) on delete set null', t);
  end loop;
end
$$;

-- ── 가드 트리거 ──

-- (1) 자기 행 가드(R-PERM-01/03, R-SYS-03): 서술·기록 테이블
do $$
declare t text;
begin
  foreach t in array array['journal_entries','decisions','events','re_complexes','re_subscriptions'] loop
    execute format('create trigger a_%1$s_bot_guard before insert or update or delete on public.%1$I
                    for each row execute function public.mowa_bot_row_guard()', t);
  end loop;
end
$$;

-- (2) 스냅샷류: 덮어쓰기(upsert) 허용, 삭제 금지, source_bot_id는 호출 봇으로 강제 (R-PERM-11)
create or replace function public.mowa_bot_stamp_guard()
returns trigger language plpgsql as $$
begin
  if not public.mowa_is_service() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    raise exception '[R-PERM-01] bots cannot delete' using errcode = '42501';
  end if;
  if public.mowa_current_bot() is null then
    raise exception '[R-PERM-03] missing bot identity' using errcode = '42501';
  end if;
  new.source_bot_id := public.mowa_current_bot();
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['price_snapshots','portfolio_snapshots','targets_valuation','market_indicators',
                           're_complex_snapshots','re_market_stats'] loop
    execute format('create trigger a_%1$s_bot_guard before insert or update or delete on public.%1$I
                    for each row execute function public.mowa_bot_stamp_guard()', t);
  end loop;
end
$$;

-- (3) instruments: 여러 봇이 같은 행을 보강(R-PERM 표) → 자기 행 제한 없음. 삭제·보관·복원은 봇 금지
create or replace function public.instruments_guard()
returns trigger language plpgsql as $$
begin
  if not public.mowa_is_service() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then raise exception '[R-PERM-01] bots cannot delete' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.archived_at is not null then raise exception '[R-PERM-01] bots cannot archive instruments' using errcode = '42501'; end if;
    new.source_bot_id := public.mowa_current_bot();
  elsif new.archived_at is distinct from old.archived_at or new.ticker is distinct from old.ticker
        or new.owner_id is distinct from old.owner_id then
    raise exception '[R-PERM-01] bots cannot archive/rename instrument keys' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger a_instruments_guard before insert or update or delete on public.instruments
  for each row execute function public.instruments_guard();

-- (4) reports: 자기 행 가드 + 원칙은 봇 쓰기 금지(R-PERM 표 D8 — 개정은 principle_proposals로만, R-PERM-15) + buy_plan은 봇이 draft만(D5-buy_plan, rules §3-5 ④ 유지 요구)
create or replace function public.reports_guard()
returns trigger language plpgsql as $$
begin
  if public.mowa_is_service() and tg_op <> 'DELETE' then
    if new.kind = 'principles' then
      raise exception '[R-PERM-04] bots cannot write principles; use principle_proposals (R-PERM-15)' using errcode = '42501';
    end if;
    if new.kind = 'equity_analysis' and new.subtype = 'buy_plan' and new.status <> 'draft' then
      raise exception '[R-PERM-04] buy_plan can be published only by the user' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
-- (4-0) R-PERM-16 / R-VAL-R11: 같은 (kind, report_date, slug) 키는 먼저 만든 봇(또는 사용자)의 행.
--   다른 봇이 같은 키로 upsert하면(ON CONFLICT DO UPDATE → UPDATE) 내용 변경은 CONFLICT로 거부. 보관 시도는 아래 R-PERM-01 가드가 거부.
--   트리거 이름 a0_ 은 a_reports_bot_guard보다 먼저 실행되도록 정한 것(같은 BEFORE 트리거는 이름순)
create or replace function public.reports_key_conflict_guard()
returns trigger language plpgsql as $$
begin
  if public.mowa_is_service() and public.mowa_current_bot() is not null
     and old.source_bot_id is distinct from public.mowa_current_bot()
     and old.archived_at is not distinct from new.archived_at then
    raise exception '[R-PERM-16][R-VAL-R11] CONFLICT: report key (%, %, %) belongs to another author; use a different slug',
      old.kind, old.report_date, old.slug using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger a0_reports_key_conflict before update on public.reports
  for each row execute function public.reports_key_conflict_guard();
create trigger a_reports_bot_guard before insert or update or delete on public.reports
  for each row execute function public.mowa_bot_row_guard();
create trigger b_reports_guard before insert or update or delete on public.reports
  for each row execute function public.reports_guard();

-- (5) positions (R-PERM-02, R-VAL-P01): 봇은 ① planned 새 행(수량·평단·승인필드 없음) ② base_price/base_at/memo 수정만
create or replace function public.positions_guard()
returns trigger language plpgsql as $$
declare
  f text;
  v_fields text[];
  v_new jsonb; v_old jsonb;
  v_asset text;
begin
  if public.mowa_is_service() and coalesce(current_setting('mowa.via_proposal', true), '') <> 'on' then
    if tg_op = 'DELETE' then
      raise exception '[R-PERM-01] bots cannot delete positions' using errcode = '42501';
    end if;
    if public.mowa_current_bot() is null then
      raise exception '[R-PERM-03] missing bot identity' using errcode = '42501';
    end if;
    -- 권한 표 D3: positions 쓰기는 finance-manager만 (R-PERM-17 / R-VAL-P12: trigger_price·breakeven 포함, 다른 봇 403)
    if not exists (select 1 from public.bot_clients b where b.id = public.mowa_current_bot() and b.profile = 'finance-manager') then
      raise exception '[R-VAL-P12][R-PERM-04] only finance-manager may write positions' using errcode = '42501';
    end if;
    v_fields := public.mowa_approval_fields(new.owner_id);
    v_new := to_jsonb(new);
    if tg_op = 'INSERT' then
      if new.status <> 'planned' or new.qty <> 0 or new.avg_price is not null or new.archived_at is not null then
        raise exception '[R-VAL-P01] bots may only create planned positions without qty/avg_price' using errcode = '42501';
      end if;
      new.source_bot_id := public.mowa_current_bot();
    else
      v_old := to_jsonb(old);
      foreach f in array v_fields || array['owner_id','instrument_id','archived_at','closed_at','source_bot_id','approval_version'] loop
        if (v_new->f) is distinct from (v_old->f) then
          raise exception '[R-VAL-P01] bots cannot change positions.% (use position_proposals)', f using errcode = '42501';
        end if;
      end loop;
    end if;
  end if;
  -- R-VAL-M03: 주식·ETF 정수(Q-15), cash 소수 2자리까지(Q-31). 사용자·봇·승인 경로 모두
  if tg_op <> 'DELETE' and new.qty <> trunc(new.qty) then
    select asset_type into v_asset from public.instruments where id = new.instrument_id;
    perform public.mowa_check_qty(v_asset, new.qty);
  end if;
  if tg_op = 'UPDATE' then
    if (new.qty, new.avg_price, new.status, new.currency) is distinct from (old.qty, old.avg_price, old.status, old.currency) then
      new.approval_version := old.approval_version + 1;
    end if;
    if (new.qty, new.avg_price, new.status, new.currency, new.trigger_price, new.trigger_direction, new.breakeven, new.watch_only)
       is distinct from (old.qty, old.avg_price, old.status, old.currency, old.trigger_price, old.trigger_direction, old.breakeven, old.watch_only) then
      new.version := old.version + 1;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- R-PERM-17: trigger_price·breakeven 변경은 DB에서도 이전/새 값을 감사 로그에 남긴다(앱 로그 누락 대비, 행위자 무관)
create or replace function public.positions_audit_trigger_breakeven()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.trigger_price, new.trigger_direction, new.breakeven, new.watch_only) is distinct from (old.trigger_price, old.trigger_direction, old.breakeven, old.watch_only) then   -- R-VAL-P13 watch_only, trigger_direction 포함
    insert into public.mcp_audit_log (owner_id, actor_type, bot_client_id, user_id, tool, result, rule_ids, affected_ids, args_preview)
    values (new.owner_id,
            case when public.mowa_is_service() then 'bot' when auth.uid() is not null then 'user' else 'system' end,
            case when public.mowa_is_service() then public.mowa_current_bot() end,
            auth.uid(), 'positions.trigger_breakeven', 'ok', '{R-PERM-17}',
            jsonb_build_array(jsonb_build_object('table','positions','id',new.id)),
            jsonb_build_object('before', jsonb_build_object('trigger_price', old.trigger_price, 'trigger_direction', old.trigger_direction, 'breakeven', old.breakeven, 'watch_only', old.watch_only),
                               'after',  jsonb_build_object('trigger_price', new.trigger_price, 'trigger_direction', new.trigger_direction, 'breakeven', new.breakeven, 'watch_only', new.watch_only),
                               'version', new.version));
  end if;
  return null;
end;
$$;

create trigger a_positions_guard before insert or update or delete on public.positions
  for each row execute function public.positions_guard();
create trigger positions_audit_trigger_breakeven after update on public.positions
  for each row execute function public.positions_audit_trigger_breakeven();

-- (6) 승인 큐: 서버가 current_values/base_version/proposed_by를 채우고 형식을 검사 (R-PERM-13, R-VAL-P07)
create or replace function public.position_proposals_prepare()
returns trigger language plpgsql as $$
declare
  v_pos public.positions;
  v_allowed text[];
  v_bad text;
  v_cur jsonb;
begin
  if tg_op = 'INSERT' then
    if public.mowa_is_service() then
      -- 봇 제안 (R-PERM-03: 신원·제안자 유형은 서버가 정함. 봇이 proposed_by_type='user'를 보내도 무시, R-VAL-P11)
      new.proposed_by := public.mowa_current_bot();
      new.proposed_by_type := 'bot';
      new.proposed_by_user := null;
      if new.proposed_by is null then raise exception '[R-PERM-03] missing bot identity' using errcode = '42501'; end if;
      if not exists (select 1 from public.bot_clients b where b.id = new.proposed_by and b.owner_id = new.owner_id
                       and b.profile = 'finance-manager' and 'positions:propose' = any(b.scopes)) then
        raise exception '[R-VAL-P07] only finance-manager with positions:propose can propose' using errcode = '42501';
      end if;
    elsif auth.uid() is not null and coalesce(auth.role(), '') = 'authenticated' then
      -- 사용자 정정 제안 (G-4, R-VAL-P11): 웹 세션 + apply_user_correction RPC 안에서만(PM 결정 2026-11-21: 생성·승인·반영을 한 번에, pending으로 쌓지 않음)
      if coalesce(current_setting('mowa.via_user_correction', true), '') <> 'on' then
        raise exception '[R-VAL-P11] user corrections go through apply_user_correction (created approved, never queued)' using errcode = '42501';
      end if;
      if new.owner_id <> auth.uid() then raise exception 'owner mismatch' using errcode = '42501'; end if;
      new.proposed_by_type := 'user';
      new.proposed_by := null;
      new.proposed_by_user := auth.uid();
    else
      raise exception '[R-VAL-P11] proposals come from finance-manager (MCP) or a user session only' using errcode = '42501';
    end if;
    if new.status <> 'pending' or new.decided_at is not null or new.decided_by is not null
       or new.applied_values is not null or new.held_at is not null then
      raise exception '[R-PERM-05] new proposals must start as pending' using errcode = '42501';
    end if;
    if new.change_type in ('set_trigger','set_breakeven') then
      raise exception '[R-VAL-P07] % is not allowed (Q-13: trigger_price/breakeven are written directly, R-PERM-17)', new.change_type using errcode = '22023';
    end if;
    if new.change_type not in ('open_holding','set_qty_avg','close') then
      raise exception '[R-PERM-13][R-PERM-15] position_proposals accepts position change types only (principles → principle_proposals)' using errcode = '22023';
    end if;
    new.expires_at := public.mowa_proposal_expiry(new.owner_id);   -- Q-28 (제출 값 무시)
    -- R-VAL-P10: evidence의 report_id·journal_entry_id는 같은 owner의 존재하는 행
    if exists (select 1 from jsonb_array_elements(new.evidence) e
                where (e ? 'report_id' and not exists (select 1 from public.reports r
                         where r.id::text = e->>'report_id' and r.owner_id = new.owner_id))
                   or (e ? 'journal_entry_id' and not exists (select 1 from public.journal_entries j
                         where j.id::text = e->>'journal_entry_id' and j.owner_id = new.owner_id))) then
      raise exception '[R-VAL-P10] evidence references a missing report/journal entry' using errcode = '22023';
    end if;
    -- R-VAL-P07 (v0.4): 직접 쓰기 필드(R-PERM-17·R-VAL-P13·P15)는 승인 큐로 바꿀 수 없다
    select k into v_bad from jsonb_object_keys(new.proposed_values) k
     where k in ('trigger_price','trigger_direction','breakeven','watch_only') limit 1;
    if v_bad is not null then
      raise exception '[R-VAL-P07] % is a direct-write field and cannot be proposed (R-PERM-17)', v_bad using errcode = '22023';
    end if;
    v_allowed := case new.change_type
      when 'open_holding'  then array['qty','avg_price','currency']
      when 'set_qty_avg'   then array['qty','avg_price'] || case when new.proposed_by_type = 'user' then array['currency'] else array[]::text[] end  -- 사용자 정정은 통화 포함(Q-21)
      when 'close'         then array[]::text[] end;
    select k into v_bad from jsonb_object_keys(new.proposed_values) k where not (k = any(v_allowed)) limit 1;
    if v_bad is not null then
      raise exception '[R-PERM-13] field % not allowed for %', v_bad, new.change_type using errcode = '22023';
    end if;
    if new.change_type = 'open_holding' and not (new.proposed_values ? 'qty' and new.proposed_values ? 'avg_price') then
      raise exception '[R-VAL-P04] open_holding needs qty and avg_price' using errcode = '22023';
    end if;
    if new.position_id is not null then
      select * into v_pos from public.positions where id = new.position_id and owner_id = new.owner_id;
      if not found then raise exception 'position not found' using errcode = 'P0002'; end if;
      if v_pos.archived_at is not null or v_pos.status = 'closed' then
        raise exception 'position is not active' using errcode = '22023';
      end if;
      if new.change_type = 'open_holding' and v_pos.status <> 'planned' then
        raise exception 'open_holding with position_id requires a planned position' using errcode = '22023';
      end if;
      if new.change_type = 'set_qty_avg' and v_pos.status <> 'holding' then
        raise exception 'set_qty_avg requires a holding position' using errcode = '22023';
      end if;
      new.instrument_id := v_pos.instrument_id;
      v_cur := jsonb_build_object('status', v_pos.status, 'qty', v_pos.qty, 'avg_price', v_pos.avg_price,
                                  'currency', v_pos.currency, 'breakeven', v_pos.breakeven, 'trigger_price', v_pos.trigger_price);
      new.current_values := v_cur;
      new.base_version := v_pos.approval_version;
      -- R-VAL-M03 (Q-15): 주식·ETF 제안 수량 정수
      if new.proposed_values ? 'qty' then   -- R-VAL-M03 (Q-15 정수, Q-31 cash 2자리)
        perform public.mowa_check_qty((select i.asset_type from public.instruments i where i.id = new.instrument_id), (new.proposed_values->>'qty')::numeric);
      end if;
      if new.change_type <> 'close' and new.proposed_values <@ v_cur then
        raise exception '[R-VAL-P07] proposed values equal current approved values' using errcode = '22023';
      end if;
    elsif not exists (select 1 from public.instruments i where i.id = new.instrument_id and i.owner_id = new.owner_id) then
      raise exception 'instrument not found' using errcode = 'P0002';
    else
      new.current_values := null;
      if new.proposed_values ? 'qty' then   -- R-VAL-M03 (Q-15 정수, Q-31 cash 2자리)
        perform public.mowa_check_qty((select i.asset_type from public.instruments i where i.id = new.instrument_id), (new.proposed_values->>'qty')::numeric);
      end if;
    end if;
    return new;
  end if;

  -- UPDATE / DELETE by bot (M-2)
  -- superseded: only internal trigger/RPC (pg_trigger_depth()>1). Direct bot UPDATE: cancelled on own proposal only; lock other columns.
  if public.mowa_is_service() then
    if tg_op = 'DELETE' then raise exception '[R-PERM-01] bots cannot delete proposals' using errcode = '42501'; end if;
    if new.status = 'superseded' then
      if pg_trigger_depth() <= 1 or old.status not in ('pending','on_hold') then
        raise exception '[R-PERM-05] bots cannot mark proposals superseded (server-only)' using errcode = '42501';
      end if;
      if new.owner_id is distinct from old.owner_id
         or new.proposed_values is distinct from old.proposed_values
         or new.evidence is distinct from old.evidence
         or new.calc_note is distinct from old.calc_note
         or new.display_no is distinct from old.display_no
         or new.proposed_by is distinct from old.proposed_by
         or new.proposed_by_type is distinct from old.proposed_by_type
         or new.applied_values is distinct from old.applied_values
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
       or new.position_id is distinct from old.position_id
       or new.instrument_id is distinct from old.instrument_id
       or new.change_type is distinct from old.change_type
       or new.proposed_values is distinct from old.proposed_values
       or new.evidence is distinct from old.evidence
       or new.calc_note is distinct from old.calc_note
       or new.current_values is distinct from old.current_values
       or new.display_no is distinct from old.display_no
       or new.proposed_by is distinct from old.proposed_by
       or new.proposed_by_type is distinct from old.proposed_by_type
       or new.applied_values is not null
       or new.decided_by is not null
       or (new.acknowledged_at, new.acknowledged_by, new.attention_started_at)
          is distinct from (old.acknowledged_at, old.acknowledged_by, old.attention_started_at) then
      raise exception '[R-PERM-05] bots can only cancel their own pending/on_hold proposals' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
-- R-PERM-13·R-PERM-15 v0.5: conflict·expired로 바뀌는 순간 attention_started_at = now() (어떤 경로든). 다른 상태로는 바뀌지 않으므로 지우지 않는다
create or replace function public.mowa_attention_stamp()
returns trigger language plpgsql as $$
begin
  if new.status in ('conflict','expired') and old.status is distinct from new.status then
    new.attention_started_at := now();
  end if;
  return new;
end;
$$;
create trigger b_position_proposals_attention before update of status on public.position_proposals
  for each row execute function public.mowa_attention_stamp();
-- a0_: prepare 트리거보다 먼저 번호 발급(같은 트랜잭션, 거부되면 증가도 롤백)
create trigger a0_position_proposals_display_no before insert or update on public.position_proposals
  for each row execute function public.mowa_display_no_assign('position_proposal');
create trigger a_position_proposals_prepare before insert or update or delete on public.position_proposals
  for each row execute function public.position_proposals_prepare();

-- 같은 대상의 이전 pending은 superseded (R-PERM-13)
-- security definer: 사용자 작성 제안(G-4)도 이전 제안을 superseded로 바꿀 수 있게(사용자는 update 권한 없음)
create or replace function public.position_proposals_supersede()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.position_proposals p
     set status = 'superseded', decided_at = now(), decision_note = 'superseded by ' || new.id
   where p.owner_id = new.owner_id and p.status in ('pending','on_hold') and p.id <> new.id   -- R-PERM-13 v0.2: on_hold에도 적용
     and ((new.position_id is not null and p.position_id = new.position_id)
          or (new.position_id is null and p.position_id is null and p.instrument_id = new.instrument_id));
  return null;
end;
$$;
create trigger position_proposals_supersede after insert on public.position_proposals
  for each row execute function public.position_proposals_supersede();
