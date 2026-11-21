-- BE-01 acceptance: anon key must be denied select on every public table.
-- Rebuild drafts revoke anon on new objects; legacy finance tables still had
-- default grants until GATED drop. Close that gap without enabling anon RLS bypass.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end
$$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
