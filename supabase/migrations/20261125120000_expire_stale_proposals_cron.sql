-- BE-20: schedule public.expire_stale_proposals() via pg_cron (JWT-less).
-- Do NOT apply this file to remote/Preview from the agent — PM only. Local mowa_local only.
--
-- Behavior (unchanged; function body lives in 20261125000800_functions.sql):
--   Updates only status='pending' AND expires_at <= now() on position_proposals and
--   principle_proposals. on_hold is excluded (G-1). 14-day '확인 필요' clock stays on
--   mowa_attention_stamp → attention_started_at (not decided_at / expires_at).
--
-- 00910 note: BE-20 is JWT-less pg_cron. Do NOT add auth.uid()/auth.role() guards
--   that would make the cron fail. Do NOT GRANT EXECUTE to anon / authenticated / PUBLIC.
--   Cron role (usually postgres) runs the job; REVOKE keeps API roles blocked.
--
-- Schedule: 0 * * * * (top of every hour). No project doc named a cadence; hourly is
--   enough for a 7-day proposal TTL and keeps worker load low.
--
-- Idempotent: CREATE EXTENSION IF NOT EXISTS; if job name exists → unschedule then schedule.
-- Extension: IF NOT EXISTS is safe on hosted Supabase and local. Do not ALTER SYSTEM /
--   shared_preload_libraries here (hosted already loads pg_cron; local prep is outside
--   this migration — if preload is missing, NOTICE and skip schedule so mowa_local still boots).
--
-- Rollback (manual, after this file applied):
--   SELECT cron.unschedule('expire-stale-proposals');
--   -- Do NOT DROP EXTENSION pg_cron — other jobs may share it.

do $be20_ext$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception
  when others then
    -- Typical local miss: "pg_cron must be loaded via shared_preload_libraries".
    -- Hosted Supabase already preloads pg_cron; this path should not run there.
    raise notice 'BE-20: pg_cron unavailable (%) — skip schedule (enable shared_preload locally to verify cron.job)',
      sqlerrm;
end
$be20_ext$;

do $be20_sched$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  execute 'grant usage on schema cron to postgres';
  execute 'grant all privileges on all tables in schema cron to postgres';

  -- Idempotent: drop existing job by name when present.
  if exists (
    select 1 from cron.job where jobname = 'expire-stale-proposals'
  ) then
    perform cron.unschedule('expire-stale-proposals');
  end if;

  perform cron.schedule(
    'expire-stale-proposals',
    '0 * * * *',
    $cmd$select public.expire_stale_proposals()$cmd$
  );
end
$be20_sched$;

-- Re-assert EXECUTE lockdown (CREATE OR REPLACE elsewhere must not leave anon/auth open).
-- No auth.uid()/auth.role() checks on the function — cron has no JWT.
revoke all on function public.expire_stale_proposals() from public, anon, authenticated;
