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
alter default privileges in schema public revoke all on functions from anon;

-- L-3: also revoke existing function/view privileges from anon
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on function %I.%I(%s) from anon', r.nspname, r.proname, r.args);
  end loop;
  for r in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('revoke all on table public.%I from anon', r.table_name);
  end loop;
end
$$;
