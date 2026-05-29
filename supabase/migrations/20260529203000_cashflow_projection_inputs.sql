create type public.cashflow_direction as enum ('income', 'expense');
create type public.cashflow_cadence as enum ('monthly', 'yearly');

create table public.cashflow_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  direction public.cashflow_direction not null,
  cadence public.cashflow_cadence not null default 'monthly',
  amount numeric(18, 2) not null default 0,
  category text,
  start_date date,
  end_date date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cashflow_items enable row level security;

create policy "cashflow items are user-owned" on public.cashflow_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.assets
  add column if not exists monthly_contribution numeric(18, 2),
  add column if not exists contribution_end_date date;
