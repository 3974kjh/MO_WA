-- BE-12: issue_bot_client — authenticated SECURITY DEFINER insert for bot API keys.
-- Do NOT apply this file to remote/Preview/production from the agent — PM only.
-- Local mowa_local only when test:db needs it.
--
-- Why: 000700 revoked authenticated INSERT on bot_clients and does not GRANT
-- key_hash/key_prefix writes. Issuance must go through this RPC (hash computed
-- server-side with MCP_KEY_PEPPER; plaintext never stored).
--
-- Rollback (manual, after this file applied):
--   DROP FUNCTION IF EXISTS public.issue_bot_client(
--     text, text, text, text, text[], text, integer, timestamptz
--   );
-- Signature order matches CREATE / REVOKE / GRANT below:
--   (p_name, p_profile, p_key_prefix, p_key_hash, p_scopes, p_description,
--    p_rate_limit_per_min, p_expires_at)

create or replace function public.issue_bot_client(
  p_name text,
  p_profile text,
  p_key_prefix text,
  p_key_hash text,
  p_scopes text[] default '{read}',
  p_description text default null,
  p_rate_limit_per_min integer default 60,
  p_expires_at timestamptz default null
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  profile text,
  description text,
  key_prefix text,
  scopes text[],
  rate_limit_per_min integer,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  last_used_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.bot_clients;
begin
  if v_uid is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception '[R-PERM-05] issue_bot_client requires a user session' using errcode = '42501';
  end if;

  insert into public.bot_clients (
    owner_id, name, profile, description, key_prefix, key_hash, scopes,
    rate_limit_per_min, expires_at
  ) values (
    v_uid, p_name, p_profile, p_description, p_key_prefix, p_key_hash, coalesce(p_scopes, '{read}'),
    coalesce(p_rate_limit_per_min, 60), p_expires_at
  )
  returning * into v_row;

  insert into public.mcp_audit_log (owner_id, actor_type, user_id, tool, result, affected_ids, args_preview)
  values (
    v_uid, 'user', v_uid, 'bot_key.issue', 'ok',
    jsonb_build_array(jsonb_build_object('table', 'bot_clients', 'id', v_row.id)),
    jsonb_build_object(
      'name', v_row.name,
      'profile', v_row.profile,
      'key_prefix', v_row.key_prefix,
      'scopes', to_jsonb(v_row.scopes),
      'rate_limit_per_min', v_row.rate_limit_per_min,
      'expires_at', v_row.expires_at
    )
  );

  return query select
    v_row.id,
    v_row.owner_id,
    v_row.name,
    v_row.profile,
    v_row.description,
    v_row.key_prefix,
    v_row.scopes,
    v_row.rate_limit_per_min,
    v_row.expires_at,
    v_row.revoked_at,
    v_row.revoked_reason,
    v_row.last_used_at,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

revoke all on function public.issue_bot_client(text, text, text, text, text[], text, integer, timestamptz)
  from public, anon, service_role;
grant execute on function public.issue_bot_client(text, text, text, text, text[], text, integer, timestamptz)
  to authenticated;
