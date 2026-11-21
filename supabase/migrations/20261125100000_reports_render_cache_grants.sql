-- BE-07: reports.body_blocks / reports.toc writable ONLY via SECURITY DEFINER RPC
-- mowa_set_report_render_cache, which sets local GUC mowa.render_cache_write=on.
-- A BEFORE trigger rejects any INSERT/UPDATE that changes those columns without the GUC.
--
-- Why not column REVOKE alone:
--   Postgres table-level INSERT/UPDATE grants imply all columns; column REVOKE does not
--   override that. We REVOKE table-level INSERT/UPDATE, then re-GRANT every column except
--   body_blocks/toc.
--
-- IMPORTANT — adding a column to public.reports later:
--   Because table-level INSERT/UPDATE are revoked, a new column is NOT writable until you
--   explicitly GRANT INSERT (col) / UPDATE (col) ON public.reports TO authenticated, service_role
--   in a follow-up migration (or extend the grant lists below). Do not rely on DEFAULT PRIVILEGES
--   alone for this table after this file. Never GRANT body_blocks/toc to those roles.
--
-- Trust boundary (product rules — keep out of locked rules.md; document here only):
--   External bots hold a bot API key (Bearer mowa_…) only. The Supabase service_role key lives
--   solely in the MCP server process. Bots never receive service_role; DB probes that SET ROLE
--   service_role + x-mowa-bot-id simulate the MCP server path, not a bot-held service key.
--
-- No new columns. HMAC / wrangler secrets are not used.
-- Do NOT apply this file to remote/Preview from the agent — PM only.
--
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS a_reports_render_cache_guard ON public.reports;
--   DROP FUNCTION IF EXISTS public.reports_render_cache_guard();
--   REVOKE ALL ON FUNCTION public.mowa_set_report_render_cache(uuid, uuid, jsonb, jsonb)
--     FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.mowa_set_report_render_cache(uuid, uuid, jsonb, jsonb);
--   -- Restore table-level INSERT/UPDATE as before this migration (default privileges):
--   GRANT INSERT, UPDATE ON public.reports TO authenticated, service_role;
--   -- Column grants left behind are redundant once table-level grants return; optional cleanup:
--   -- REVOKE INSERT, UPDATE ON public.reports FROM authenticated, service_role;
--   -- then GRANT INSERT, UPDATE ON public.reports TO authenticated, service_role;

-- 1) Table-level: strip INSERT/UPDATE so column grants become authoritative.
revoke insert, update on table public.reports from public, anon, authenticated, service_role;

-- 2) Re-GRANT every writable column except body_blocks / toc / generated search_tsv.
--    authenticated + service_role had table INSERT/UPDATE via ALTER DEFAULT PRIVILEGES.
--    anon never had writes — do not grant.
--    Any future reports column MUST be added to both GRANT lists below (or a new migration).
grant insert (
  id, owner_id, kind, subtype, domain, slug, title, headline,
  report_date, period_start, period_end, summary, body_md,
  tags, tickers, meta, status, generated_at, source_bot_id, source_ref,
  version, archived_at, created_at, updated_at
) on public.reports to authenticated, service_role;

grant update (
  id, owner_id, kind, subtype, domain, slug, title, headline,
  report_date, period_start, period_end, summary, body_md,
  tags, tickers, meta, status, generated_at, source_bot_id, source_ref,
  version, archived_at, created_at, updated_at
) on public.reports to authenticated, service_role;

-- Explicitly ensure render columns stay without INSERT/UPDATE for client roles.
revoke insert (body_blocks, toc) on public.reports from public, anon, authenticated, service_role;
revoke update (body_blocks, toc) on public.reports from public, anon, authenticated, service_role;

-- 3) Trigger: reject body_blocks/toc changes unless RPC set mowa.render_cache_write=on (transaction-local).
create or replace function public.reports_render_cache_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  allowed boolean := coalesce(current_setting('mowa.render_cache_write', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if (new.body_blocks is not null)
       or (new.toc is distinct from '[]'::jsonb) then
      if not allowed then
        raise exception '[R-PERM-01] reports.body_blocks/toc writable only via mowa_set_report_render_cache'
          using errcode = '42501';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.body_blocks is distinct from old.body_blocks)
       or (new.toc is distinct from old.toc) then
      if not allowed then
        raise exception '[R-PERM-01] reports.body_blocks/toc writable only via mowa_set_report_render_cache'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a_reports_render_cache_guard on public.reports;
-- Name a_… so it runs with other BEFORE triggers; order vs bot guard does not matter for this check.
create trigger a_reports_render_cache_guard
  before insert or update on public.reports
  for each row execute function public.reports_render_cache_guard();

revoke all on function public.reports_render_cache_guard() from public, anon, authenticated;

-- 4) Server-only writer: service_role may EXECUTE; function owner updates columns under GUC.
create or replace function public.mowa_set_report_render_cache(
  p_report_id uuid,
  p_owner_id uuid,
  p_body_blocks jsonb,
  p_toc jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_report_id is null or p_owner_id is null then
    raise exception '[R-SYS-01] report id and owner_id are required for render cache write'
      using errcode = '22023';
  end if;
  -- Transaction-local flag consumed by reports_render_cache_guard (and only that path).
  perform set_config('mowa.render_cache_write', 'on', true);
  update public.reports
     set body_blocks = p_body_blocks,
         toc = coalesce(p_toc, '[]'::jsonb)
   where id = p_report_id
     and owner_id = p_owner_id;
  if not found then
    raise exception '[R-SYS-01] report not found for render cache write'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.mowa_set_report_render_cache(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.mowa_set_report_render_cache(uuid, uuid, jsonb, jsonb)
  to service_role;
