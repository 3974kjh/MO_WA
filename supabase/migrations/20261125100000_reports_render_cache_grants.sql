-- BE-07: reports.body_blocks / reports.toc are writeable only via the server
-- render path (SECURITY DEFINER RPC). Bots (service_role PostgREST), authenticated
-- users, and anon must not UPDATE/INSERT these columns directly.
-- No new columns — existing body_blocks + toc only.
--
-- Rollback (manual, do not auto-apply remotely):
--   REVOKE ALL ON FUNCTION public.mowa_set_report_render_cache(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.mowa_set_report_render_cache(uuid, uuid, jsonb, jsonb);
--   GRANT UPDATE (body_blocks, toc) ON public.reports TO service_role;
--   GRANT INSERT (body_blocks, toc) ON public.reports TO service_role;
--   -- authenticated never had column grants for these; leave revoked.

-- Column-level: strip render-cache writes from every client-facing / bot PostgREST role.
revoke insert (body_blocks, toc) on public.reports from public, anon, authenticated, service_role;
revoke update (body_blocks, toc) on public.reports from public, anon, authenticated, service_role;

-- Server-only writer: service_role may EXECUTE; function runs as owner and updates columns.
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
