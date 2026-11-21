-- MO_WA rebuild M1 · DRAFT (미적용) · 종목 / 보유·매수계획(D3) / 매매일지(D4)
-- 근거: rules.md D3·D4, §4-2·§4-3(R-VAL-C*, M*, P*, J*, I01), §5-1·§5-2 매핑

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,                         -- R-VAL-C01~C03 형식은 domain(zod)에서 market별로 검사
  name text not null,
  market text not null check (market in ('KRX','NASDAQ','NYSE','NYSEARCA','AMEX','OTC','BOND','OTHER')),
  asset_type text not null check (asset_type in ('stock','etf','bond','cash')),   -- R-VAL-I01
  sector text,
  aliases text[] not null default '{}',         -- 이전 변환기 전용(R-VAL-C05: 봇 요청의 별칭은 ERROR)
  is_watchlist boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  source_bot_id uuid,                           -- FK는 06 파일
  source_ref jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, ticker),                    -- R-VAL-I01
  constraint instruments_krx_code check (market <> 'KRX' or ticker ~ '^\d{6}$'),                         -- R-VAL-C01
  constraint instruments_us_ticker check (market not in ('NASDAQ','NYSE','NYSEARCA','AMEX')
                                          or ticker ~ '^[A-Z]{1,5}([.-][A-Z]{1,2})?$'),                   -- R-VAL-C02
  constraint instruments_internal_code check (asset_type not in ('bond','cash') or market = 'KRX'
                                          or ticker ~ '^[A-Z][A-Z0-9_]{1,31}$')                           -- R-VAL-C03
);
create index instruments_owner_watch_idx on public.instruments (owner_id, is_watchlist) where archived_at is null;
create index instruments_name_trgm_idx on public.instruments using gin (name extensions.gin_trgm_ops);
create trigger instruments_updated_at before update on public.instruments
  for each row execute function public.set_updated_at();

-- D3 보유·매수계획. qty·avg_price·status·currency는 승인 큐로만(R-PERM-02). trigger_price·breakeven은 finance-manager 직접 W(R-PERM-17, Q-13 확정)
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  status text not null check (status in ('holding','planned','closed')),          -- R-VAL-P02
  currency text not null check (currency in ('KRW','USD')),                       -- R-VAL-M01, R-VAL-P05 (모든 가격 필드 공통 통화)
  qty numeric(20,6) not null default 0 check (qty >= 0),                          -- R-VAL-M03: 주식·ETF 정수(Q-15), cash 소수 2자리까지(Q-31) — mowa_check_qty, positions_guard가 강제
  avg_price numeric(20,6) check (avg_price > 0),                                  -- R-VAL-M02
  breakeven numeric(20,6) check (breakeven > 0),
  base_price numeric(20,6) check (base_price > 0),                                -- 기준가 (finance-manager W)
  base_at timestamptz,                                                            -- 기준시각 (R-VAL-P06)
  trigger_price numeric(20,6) check (trigger_price > 0),                          -- 트리거 가격 (finance-manager W, R-PERM-17)
  trigger_direction text not null default 'below' check (trigger_direction in ('below','above')),  -- R-VAL-P15 (Q-34): 트리거 방향. 쓰기에서 생략하면 기존 값 유지(새 행 below). finance-manager만 W, 감사 before/after(R-PERM-17). watch_only·trigger null이면 게이지 끔(R-VAL-P16), null 강제 안 함
  memo text,                                                                      -- (finance-manager W)
  watch_only boolean not null default false,                                      -- R-VAL-P13 (Q-32): 관찰 전용 표시(봇 중 finance-manager만 W, 감사 로그). UI는 memo가 아니라 이 필드를 읽는다. status 값은 바꾸지 않는다. 현대차(005380)는 true로 이전
  version integer not null default 1,                                             -- 변경 이력 버전: 승인 필드 + trigger_price·breakeven 변경마다 +1 (R-PERM-17 '이력(버전)')
  approval_version integer not null default 1,                                    -- 승인 큐 충돌 감지 전용: qty·avg_price·status·currency 변경 때만 +1 (봇의 트리거 갱신이 대기 제안을 conflict로 만들지 않게)
  source_bot_id uuid,                                                             -- null = 사용자/이전 (R-CLS-05)
  source_ref jsonb not null default '{}'::jsonb,                                  -- {"notion_url": "..."} (rules §5-2)
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_holding_has_qty check (status <> 'holding' or qty > 0),    -- R-VAL-P04
  constraint positions_watch_only_no_trigger check (not watch_only or trigger_price is null)  -- R-VAL-P13: watch_only=true면 trigger_price null
);
-- PM 확정(Q-07): 같은 종목에 holding 1개 + planned 1개 동시 허용. 같은 status 활성 행은 1개(R-VAL-P03 조정)
create unique index positions_one_active_per_status
  on public.positions (owner_id, instrument_id, status)
  where status in ('holding','planned') and archived_at is null;
create index positions_owner_status_idx on public.positions (owner_id, status) where archived_at is null;
create trigger positions_updated_at before update on public.positions
  for each row execute function public.set_updated_at();

-- D4 매매일지
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,                                                       -- R-VAL-T01
  kind text not null check (kind in ('buy','sell','thought','plan','review')),    -- R-VAL-J01
  state text not null default 'pending' check (state in ('pending','done','hold','closed')),
  instrument_id uuid references public.instruments(id) on delete restrict,       -- R-VAL-J03: buy/sell 필수, thought/review/plan은 null 가능
  tickers text[] not null default '{}',                                           -- R-VAL-J08 (Q-16): 다종목 연결. 모든 코드는 instruments에 있어야 함(R-VAL-C04, journal_tickers_check). tags에 넣지 않음
  title text not null check (char_length(title) between 1 and 200),              -- R-VAL-S05
  price numeric(20,6) check (price > 0),                                          -- 체결가/관측 종가만(R-VAL-J05)
  qty numeric(20,6) check (qty > 0),
  avg_price numeric(20,6) check (avg_price > 0),
  breakeven numeric(20,6) check (breakeven > 0),
  currency text check (currency in ('KRW','USD')),                                -- rules 요청 신규 컬럼
  source_url text check (source_url is null or source_url ~ '^https?://\S+$'),    -- R-VAL-S04
  memo_md text,
  report_id uuid,                                                                 -- FK 03 파일 (R-VAL-J04)
  client_ref text check (client_ref is null or char_length(client_ref) between 1 and 120), -- PM 확정(Q-08): 멱등 키
  source_bot_id uuid,
  source_ref jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_price_needs_currency check (price is null or currency is not null),      -- R-VAL-J05
  constraint journal_trade_needs_instrument check (kind not in ('buy','sell') or instrument_id is not null),  -- R-VAL-J03 (Q-16)
  constraint journal_tickers_max check (cardinality(tickers) <= 30),
  unique (owner_id, client_ref)                                                   -- null은 중복 허용(사용자 웹 작성)
);
create index journal_owner_date_idx on public.journal_entries (owner_id, entry_date desc) where archived_at is null;
create index journal_instrument_date_idx on public.journal_entries (instrument_id, entry_date desc);
create index journal_owner_kind_state_idx on public.journal_entries (owner_id, kind, state);
create trigger journal_entries_updated_at before update on public.journal_entries
  for each row execute function public.set_updated_at();
-- R-VAL-J02/J03: buy/sell 조건부 필수(Q-16: plan/thought/review는 instrument 선택). strict/migration 모드 차이는 domain(zod)에서 검사.

-- Q-16 / R-VAL-C04: journal_entries.tickers[]의 모든 코드는 같은 owner의 instruments에 있어야 한다(별칭 런타임 변환 없음, Q-24·R-VAL-C05)
create or replace function public.journal_tickers_check()
returns trigger language plpgsql as $$
declare v_bad text;
begin
  select t into v_bad from unnest(new.tickers) t
   where not exists (select 1 from public.instruments i where i.owner_id = new.owner_id and i.ticker = t) limit 1;
  if v_bad is not null then
    raise exception '[R-VAL-C04] unknown ticker % in journal_entries.tickers', v_bad using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger journal_tickers_check before insert or update of tickers, owner_id on public.journal_entries
  for each row execute function public.journal_tickers_check();
create index journal_tickers_gin on public.journal_entries using gin (tickers);
