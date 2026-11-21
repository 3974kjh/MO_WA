-- MO_WA rebuild M1 · DRAFT (미적용) · 서술형 리포트 (D1, D2, D5, D6, D7 분석, D8)
-- 근거: rules.md R-CLS-01~05, R-VAL-R01~R10, R-VAL-T05, R-SRC-03, PM 확정(매수 계획서 = equity_analysis/subtype=buy_plan, intraday 1차 비활성)

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (                                             -- R-VAL-R01 (intraday 제외)
    'daily_brief','weekly_report','equity_analysis','realestate_brief','realestate_analysis','strategy','principles')),
  subtype text constraint reports_subtype_check check (subtype is null or (kind = 'equity_analysis' and subtype = 'buy_plan')),  -- PM 확정(Q-04)
  domain text not null check (domain in ('stock','realestate','macro')),          -- R-VAL-R02 (Q-22 확정: daily/weekly·시장 전체 = macro, 종목 단위 = stock, 부동산 = realestate)
  slug text not null check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- R-VAL-S06
  title text not null check (char_length(title) between 1 and 200),              -- R-VAL-S05
  headline text check (headline is null or (char_length(headline) between 1 and 120 and headline !~ '[\r\n]')), -- PM 추가: 목록용 한 줄 요약
  report_date date not null,
  period_start date,                                                              -- PM 확정(Q-06)
  period_end date,
  summary text check (summary is null or array_length(string_to_array(summary, E'\n'), 1) <= 3),  -- R-VAL-R04 (3줄)
  body_md text not null check (octet_length(body_md) <= 1048576),                -- R-VAL-S02
  body_blocks jsonb,
  toc jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  tickers text[] not null default '{}',                                           -- R-VAL-C04는 domain에서 instruments 대조
  meta jsonb not null default '{}'::jsonb,                                        -- 구조화 부가정보(예: buy_plan의 회차·손절선 — Q-20 결정 전 자유형)
  status text not null default 'published' check (status in ('draft','published')),  -- R-VAL-R05 (보관은 archived_at)
  generated_at timestamptz,                                                       -- D1 필수(R-VAL-T02)
  source_bot_id uuid,                                                             -- FK 06 파일 (R-CLS-05, null=사용자)
  source_ref jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  search_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(summary,'') || ' ' || left(coalesce(body_md,''), 200000))
  ) stored,
  archived_at timestamptz,                                                        -- R-CLS-04 / R-SYS-03 (복원 가능)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, report_date, slug),                                     -- R-CLS-03 / R-VAL-R03
  constraint reports_domain_matches_kind check ((kind like 'realestate_%') = (domain = 'realestate')),  -- R-VAL-R02
  constraint reports_domain_macro_brief check (kind not in ('daily_brief','weekly_report') or domain = 'macro'),  -- R-VAL-R02 (Q-22): tickers[]가 있어도 macro
  constraint reports_domain_stock_analysis check (kind <> 'equity_analysis' or domain = 'stock'),
  constraint reports_meta_alignment check (not (meta ? 'alignment') or (kind = 'equity_analysis'                       -- R-VAL-R15 (Q-20): 허용값·kind. 나머지 키는 zod
                                          and meta->>'alignment' in ('aligned','partial','conflict','unchecked'))),             -- R-VAL-R02 (Q-22): 종목 단위 = stock
  constraint reports_weekly_period check (kind <> 'weekly_report' or (                                 -- R-VAL-T05
    extract(isodow from report_date) = 7 and period_end = report_date and period_start = report_date - 6)),
  constraint reports_period_order check (period_start is null or period_end is null or period_start <= period_end)
);
create index reports_owner_kind_date_idx on public.reports (owner_id, kind, report_date desc) where archived_at is null;
create index reports_owner_domain_date_idx on public.reports (owner_id, domain, report_date desc) where archived_at is null;
create index reports_tags_gin on public.reports using gin (tags);
create index reports_tickers_gin on public.reports using gin (tickers);
create index reports_search_gin on public.reports using gin (search_tsv);
create index reports_title_trgm on public.reports using gin (title extensions.gin_trgm_ops);
create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

create table public.report_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  version integer not null,
  title text not null,
  headline text,
  summary text,
  body_md text not null,
  tags text[] not null default '{}',
  changed_by_type text not null check (changed_by_type in ('user','bot','system')),
  changed_by_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (report_id, version)
);

-- M-3: history/evidence rows are immutable (insert via reports_keep_revision only)
-- Account deletion: CASCADE DELETE from auth.users must not be blocked (owner gone ⇒ allow DELETE only).
-- App UPDATE/DELETE remains prohibited.
create or replace function public.report_revisions_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.owner_id) then
    return old;
  end if;
  raise exception '[R-SYS-05] report_revisions is append-only (no update/delete)' using errcode = '42501';
end;
$$;
create trigger report_revisions_immutable before update or delete on public.report_revisions
  for each row execute function public.report_revisions_immutable();
revoke truncate on table public.report_revisions from public, anon, authenticated, service_role;

-- R-CLS-03: 같은 키 재작성 = version+1, 이전본 보존
-- security definer: report_revisions는 사용자에게 읽기 전용(R-PERM-05)이라, 사용자가 리포트를 고칠 때도 이력 insert가 되도록 함수 소유자 권한으로 실행
create or replace function public.reports_keep_revision()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.body_md, new.title, new.headline, new.summary) is distinct from (old.body_md, old.title, old.headline, old.summary) then
    insert into public.report_revisions
      (owner_id, report_id, version, title, headline, summary, body_md, tags, changed_by_type, changed_by_bot_id)
    values
      (old.owner_id, old.id, old.version, old.title, old.headline, old.summary, old.body_md, old.tags,
       case when public.mowa_is_service() then 'bot' when auth.uid() is not null then 'user' else 'system' end,
       case when public.mowa_is_service() then public.mowa_current_bot() end);
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
create trigger reports_revision before update on public.reports
  for each row execute function public.reports_keep_revision();

create table public.report_sources (                                             -- R-SRC-03
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  label text not null,
  url text check (url is null or url ~ '^https?://\S+$'),
  publisher text not null,
  accessed_at timestamptz not null,
  is_primary boolean not null default false,
  sort smallint not null default 0
);
create index report_sources_report_idx on public.report_sources (report_id, sort);

create table public.report_instruments (
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  primary key (report_id, instrument_id)
);
create index report_instruments_instr_idx on public.report_instruments (instrument_id);
create trigger report_instruments_instrument_owner before insert or update of owner_id, instrument_id on public.report_instruments
  for each row execute function public.mowa_instrument_owner_guard();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete cascade,
  storage_path text not null,
  mime text not null,
  bytes integer check (bytes >= 0),
  caption text,
  created_at timestamptz not null default now()
);

alter table public.journal_entries
  add constraint journal_entries_report_fk foreign key (report_id) references public.reports(id) on delete restrict;
