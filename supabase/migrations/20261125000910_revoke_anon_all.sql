-- BE-01 acceptance: anon key must be denied select on every public table.
-- Rebuild drafts revoke anon on new objects; legacy finance tables still had
-- default grants until GATED drop. Close that gap without enabling anon RLS bypass.
--
-- Privilege RULE (repeat in every new migration that creates functions/tables):
--   * New functions must not grant PUBLIC/anon EXECUTE; grant only roles that need it.
--   * New tables must REVOKE TRUNCATE from service_role; REVOKE TRUNCATE, DELETE from authenticated
--     (TRUNCATE bypasses RLS). Include matching revokes in the same migration that creates objects.
-- ALTER DEFAULT PRIVILEGES below (and in 000100) prevent defaults from reappearing.

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end
$$;

-- Global (schema-less): cluster-wide PUBLIC EXECUTE must be revoked FOR ROLE <creator>.
-- Keep FOR ROLE postgres; also apply for current_user when migrations run as MOWA_DB_USER ≠ postgres.
alter default privileges for role postgres revoke execute on functions from public;
do $$
begin
  if current_user is distinct from 'postgres' then
    execute format(
      'alter default privileges for role %I revoke execute on functions from public',
      current_user
    );
  end if;
exception
  when insufficient_privilege then
    raise notice 'skip ALTER DEFAULT PRIVILEGES FOR ROLE %: insufficient_privilege', current_user;
end
$$;

-- supabase_admin: only when current_user is a MEMBER (hosted postgres is not superuser).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin')
     and pg_has_role(current_user, 'supabase_admin', 'MEMBER') then
    execute 'alter default privileges for role supabase_admin revoke execute on functions from public';
  end if;
exception
  when insufficient_privilege then
    raise notice 'skip ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: insufficient_privilege';
end
$$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema public revoke truncate on tables from service_role;
alter default privileges in schema public revoke truncate, delete on tables from authenticated;

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

-- Revoke service_role TRUNCATE on every public table (owned-data + catalog helpers).
-- Explicit list kept for review clarity; loop ensures none are left out.
revoke truncate on table
  public.instruments,
  public.positions,
  public.journal_entries,
  public.reports,
  public.report_revisions,
  public.report_sources,
  public.report_instruments,
  public.attachments,
  public.price_snapshots,
  public.portfolio_snapshots,
  public.targets_valuation,
  public.market_indicator_keys,
  public.market_indicators,
  public.decisions,
  public.events,
  public.re_complexes,
  public.re_complex_snapshots,
  public.re_market_stats,
  public.re_subscriptions,
  public.app_settings,
  public.bot_clients,
  public.mcp_rate_buckets,
  public.mcp_audit_log,
  public.display_sequences,
  public.position_proposals,
  public.principle_proposals,
  public.mowa_backup_log
from service_role;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate on table public.%I from service_role', t);
  end loop;
end
$$;
