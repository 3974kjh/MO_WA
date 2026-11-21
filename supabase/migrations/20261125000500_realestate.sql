-- MO_WA rebuild M1 · DRAFT (미적용) · 부동산 (D7, 3차 출시. 스키마만 선반영)
-- 근거: rules.md D7, R-VAL-M05~M08, R-VAL-RE01~RE05, R-SRC-06

create table public.re_complexes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_source text not null check (external_source in ('zigbang','naver','kb','reb','molit','internal')),  -- PM 확정(Q-09) 외부 ID 출처
  external_id text not null,
  name text not null,
  sido text not null,                         -- R-VAL-RE01 타깃 외 시도 WARN
  sigungu text,
  dong text,
  address text,
  lat numeric(9,6) check (lat between 33 and 39),       -- R-VAL-M07
  lng numeric(9,6) check (lng between 124 and 132),
  households integer check (households > 0),            -- R-VAL-M06
  built_year smallint,
  builder text,
  main_type text,
  scores jsonb not null default '{}'::jsonb,            -- R-VAL-RE03 키 9개는 domain 검사
  total_score numeric(5,2) check (total_score between 0 and 100),   -- R-VAL-M08
  rating numeric(2,1) check (rating between 1.0 and 5.0 and rating * 2 = floor(rating * 2)),
  scoring_version text,                                 -- scoring.md 산식 버전(D7)
  is_target boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  source_bot_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, external_source, external_id)
);
create index re_complexes_region_idx on public.re_complexes (owner_id, sido, sigungu) where archived_at is null;
create trigger re_complexes_updated_at before update on public.re_complexes
  for each row execute function public.set_updated_at();

create table public.re_complex_snapshots (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  complex_id uuid not null references public.re_complexes(id) on delete cascade,
  as_of date not null,
  med_price integer,            -- 만원 정수 (R-VAL-M05, RE02)
  ask_min integer,              -- 호가(만원). 실거래와 구분(R-SRC-06)
  ask_max integer,
  trades jsonb not null default '[]'::jsonb,   -- 실거래(만원, 계약일)
  score numeric(5,2) check (score between 0 and 100),
  source_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (complex_id, as_of)
);

create table public.re_market_stats (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('reb','kb')),                       -- R-VAL-RE04 부동산원/KB
  cadence text not null check (cadence in ('weekly','monthly')),
  as_of date not null,
  published_at date not null,                                                -- R-VAL-RE04 필수
  region text not null,
  metric text not null check (metric in ('sale','jeonse','buyer_dominance')), -- 매매/전세/매수우위
  value numeric(20,6) not null,
  is_primary boolean not null default false,
  link text,
  source_bot_id uuid,
  created_at timestamptz not null default now(),
  unique (owner_id, source, cadence, as_of, region, metric)
);
create index re_market_stats_series_idx on public.re_market_stats (owner_id, region, metric, as_of desc);

create table public.re_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,                  -- 청약홈 공고번호
  name text not null,
  sido text,
  sigungu text,
  households integer check (households > 0),
  apply_start date,
  apply_end date,
  announce_date date,
  price_range text,                           -- 만원 단위 표기(R-VAL-M05)
  competition jsonb not null default '{}'::jsonb,
  link text,                                  -- 없으면 WARN (R-VAL-RE05)
  meta jsonb not null default '{}'::jsonb,
  source_bot_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, external_id),
  constraint re_subscriptions_date_order check (                               -- R-VAL-RE05
    (apply_start is null or apply_end is null or apply_start <= apply_end)
    and (apply_end is null or announce_date is null or apply_end <= announce_date))
);
create index re_subscriptions_dates_idx on public.re_subscriptions (owner_id, apply_start) where archived_at is null;
create trigger re_subscriptions_updated_at before update on public.re_subscriptions
  for each row execute function public.set_updated_at();
