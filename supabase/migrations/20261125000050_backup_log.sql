-- MO_WA rebuild M1 · DRAFT (미적용) · 백업 기록 (drop 안전장치가 참조)
create table if not exists public.mowa_backup_log (
  id bigint generated always as identity primary key,
  kind text not null,                 -- 'legacy_finance_dump'
  file_name text not null,
  sha256 text not null,
  row_counts jsonb not null,          -- {"assets":12,...}
  verified boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
alter table public.mowa_backup_log enable row level security;
revoke all on table public.mowa_backup_log from anon, authenticated;
