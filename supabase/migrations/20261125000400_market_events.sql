-- MO_WA rebuild M1 · DRAFT (미적용) · 시세·지표·목표가·결정 대기·일정
-- 근거: rules.md R-VAL-I02~I04, R-VAL-M02·M04, R-PERM 표, §5-5

create table public.price_snapshots (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  as_of date not null,
  close numeric(20,6) not null check (close > 0),
  change_pct numeric(8,3),
  currency text not null check (currency in ('KRW','USD')),
  volume bigint,
  foreign_net_buy numeric(20,2),       -- 수급(trading-rules 9절 쌍끌이 필터용)
  inst_net_buy numeric(20,2),
  source text,                         -- R-VAL-I02 없으면 WARN
  extra jsonb not null default '{}'::jsonb,
  source_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (instrument_id, as_of)        -- R-VAL-I02 중복=덮어쓰기
);
create index price_snapshots_owner_date_idx on public.price_snapshots (owner_id, as_of desc);

create table public.portfolio_snapshots (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null,
  total_value numeric(20,2),
  currency text not null default 'KRW' check (currency in ('KRW','USD')),
  weights jsonb not null default '{}'::jsonb,        -- 합 100±0.5 (R-VAL-M04 WARN)
  plan_distances jsonb not null default '{}'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  source_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (owner_id, as_of)
);

create table public.targets_valuation (                -- 이름은 plan §3 / rules 표기 그대로
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  as_of date not null,
  target_price numeric(20,6) check (target_price > 0),
  currency text not null check (currency in ('KRW','USD')),
  opinion text not null check (opinion in ('buy','hold','sell')),        -- R-VAL-I04 (현행 Buy/Hold/Sell)
  source text not null check (source in ('internal','broker')),         -- R-VAL-I04 내부/증권사
  source_name text not null default '',
  report_id uuid not null references public.reports(id) on delete restrict,  -- R-VAL-I04 report_id 필수
  note text,
  source_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (owner_id, instrument_id, as_of, source, source_name)
);
create index targets_valuation_instr_idx on public.targets_valuation (instrument_id, as_of desc);

-- R-VAL-I03: 등록된 지표 키만 (목록 확정은 '확인 필요' → 테이블로 두고 마이그레이션 없이 추가)
create table public.market_indicator_keys (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  unit text
);
insert into public.market_indicator_keys (key, label, unit) values
  ('kospi','코스피','pt'), ('kosdaq','코스닥','pt'), ('usdkrw','원/달러','KRW'),
  ('ust10y','미국채 10년','%'), ('vix','VIX','pt');     -- plan §3 예시만 시드. 나머지는 룰 매니저 확정 후 추가

create table public.market_indicators (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null,
  key text not null references public.market_indicator_keys(key),
  value numeric(20,6) not null,
  change numeric(20,6),
  change_pct numeric(8,3),
  source text,
  source_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (owner_id, key, as_of)
);
create index market_indicators_owner_date_idx on public.market_indicators (owner_id, as_of desc);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  context_md text,
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','decided','dropped')),
  due_date date,
  decided_at timestamptz,
  decision_md text,
  instrument_id uuid references public.instruments(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  client_ref text,
  source_bot_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_ref)
);
create index decisions_owner_status_idx on public.decisions (owner_id, status, due_date) where archived_at is null;
create trigger decisions_updated_at before update on public.decisions
  for each row execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,                  -- R-VAL-T03 예외: 미래 허용
  event_time time,
  is_estimated boolean not null default false,
  title text not null check (char_length(title) between 1 and 200),
  domain text not null check (domain in ('stock','realestate','macro')),
  kind text not null,
  status text not null default 'scheduled' check (status in ('scheduled','tentative','done','cancelled')),
  link text check (link is null or link ~ '^https?://\S+$'),
  instrument_id uuid references public.instruments(id) on delete set null,
  amount numeric(20,2),
  currency text check (currency in ('KRW','USD')),
  client_ref text,
  meta jsonb not null default '{}'::jsonb,
  source_bot_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_ref)
);
create index events_owner_date_idx on public.events (owner_id, event_date) where archived_at is null;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
