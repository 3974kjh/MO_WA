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

-- L-3: revoke EXECUTE from PUBLIC as well as anon; keep authenticated / service_role / needed roles
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon', r.nspname, r.proname, r.args);
  end loop;
  for r in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('revoke all on table public.%I from public, anon', r.table_name);
  end loop;
end
$$;

-- Restore execute for roles that need it (PUBLIC revoke removes default grants)
grant execute on all functions in schema public to authenticated, service_role;

-- Re-apply intentional narrow grants (user-only RPCs; bot-only auth; internal display seq)
revoke all on function public.mcp_authenticate(text, text, inet) from public, anon, authenticated;
grant execute on function public.mcp_authenticate(text, text, inet) to service_role;

revoke all on function public.approve_proposal(uuid, jsonb, text) from public, anon, service_role;
grant execute on function public.approve_proposal(uuid, jsonb, text) to authenticated;
revoke all on function public.reject_proposal(uuid, text) from public, anon, service_role;
grant execute on function public.reject_proposal(uuid, text) to authenticated;
revoke all on function public.hold_proposal(uuid, boolean, text) from public, anon, service_role;
grant execute on function public.hold_proposal(uuid, boolean, text) to authenticated;
revoke all on function public.cancel_own_proposal(uuid, text) from public, anon, service_role;
grant execute on function public.cancel_own_proposal(uuid, text) to authenticated;
revoke all on function public.apply_user_correction(uuid, numeric, text, numeric, text, text, integer) from public, anon, service_role;
grant execute on function public.apply_user_correction(uuid, numeric, text, numeric, text, text, integer) to authenticated;
revoke all on function public.acknowledge_proposal(uuid) from public, anon, service_role;
grant execute on function public.acknowledge_proposal(uuid) to authenticated;

revoke all on function public.approve_principle_proposal(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.approve_principle_proposal(uuid, text, text, text) to authenticated;
revoke all on function public.decide_principle_proposal(uuid, text, text) from public, anon, service_role;
grant execute on function public.decide_principle_proposal(uuid, text, text) to authenticated;

-- expire_stale_proposals: service_role JWT still hits R-PERM-05 by design (BE-20 = JWT-less pg_cron later)
revoke all on function public.expire_stale_proposals() from public, anon, authenticated;

revoke all on function public.mowa_next_display_no(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.mowa_setting(uuid, text, jsonb) from public, anon;

-- Revoke service_role TRUNCATE on sensitive tables (row triggers do not fire on TRUNCATE)
revoke truncate on table
  public.positions,
  public.position_proposals,
  public.report_sources,
  public.attachments,
  public.app_settings,
  public.bot_clients
from service_role;
