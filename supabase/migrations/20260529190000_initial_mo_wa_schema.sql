create extension if not exists "pgcrypto";

create type public.asset_category as enum ('real_estate', 'investment', 'cash', 'liability');
create type public.asset_currency as enum ('KRW', 'USD', 'BTC', 'ETH', 'XAU', 'XAG');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category public.asset_category not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, category, name)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category public.asset_category not null,
  subcategory text not null,
  name text not null,
  institution text,
  principal_amount numeric(18, 2) not null default 0,
  current_value numeric(18, 2) not null default 0,
  currency public.asset_currency not null default 'KRW',
  valuation_date date not null default current_date,
  annual_rate numeric(8, 3),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value numeric(18, 2) not null,
  currency public.asset_currency not null default 'KRW',
  valued_at date not null default current_date,
  source text,
  created_at timestamptz not null default now()
);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  name text not null,
  liability_type text not null,
  principal_amount numeric(18, 2) not null default 0,
  remaining_amount numeric(18, 2) not null default 0,
  interest_rate numeric(8, 3),
  started_at date,
  due_at date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.liability_payments (
  id uuid primary key default gen_random_uuid(),
  liability_id uuid not null references public.liabilities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  paid_at date not null default current_date,
  principal_paid numeric(18, 2) not null default 0,
  interest_paid numeric(18, 2) not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  total_assets numeric(18, 2) not null default 0,
  total_liabilities numeric(18, 2) not null default 0,
  net_worth numeric(18, 2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_net_worth numeric(18, 2) not null,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.asset_categories enable row level security;
alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;
alter table public.liabilities enable row level security;
alter table public.liability_payments enable row level security;
alter table public.snapshots enable row level security;
alter table public.goals enable row level security;

create policy "profiles are user-owned" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "asset categories are user-owned" on public.asset_categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "assets are user-owned" on public.assets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "asset valuations are user-owned" on public.asset_valuations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "liabilities are user-owned" on public.liabilities
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "liability payments are user-owned" on public.liability_payments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "snapshots are user-owned" on public.snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goals are user-owned" on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
