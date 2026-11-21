-- BE cleanup: Supabase advisor function_search_path_mutable + trigger EXECUTE surface.
-- (a) Pin search_path on advisor-flagged mutable functions (and mowa_* helpers/guards
--     that still lack a fixed path).
-- (b) REVOKE EXECUTE from public/anon/authenticated on trigger-only functions so they
--     cannot be called via PostgREST RPC; table triggers still fire (PG11+).
--
-- Intentionally NOT changed here:
--   * get_world_leaderboard (legacy non-MO_WA)
--   * approval RPCs (approve_*/reject_*/hold_*/cancel_*/decide_*/acknowledge_*/apply_user_correction)
--   * RLS/CHECK helpers used in policies or constraints:
--       mowa_is_service, mowa_current_bot, mowa_approval_fields, mowa_check_qty,
--       mowa_display_id, mowa_proposal_expiry, mowa_assert_*, mowa_setting
--     (search_path IS set on the mutable ones above; EXECUTE is left alone)
--   * non-trigger guestbook/rank functions
--
-- Rollback (manual):
--   ALTER FUNCTION <sig> RESET search_path;
--   GRANT EXECUTE ON FUNCTION <sig> TO authenticated;
--   (re-GRANT public/anon only if a prior migration required it; after 000910 they are revoked)

-- ---------------------------------------------------------------------------
-- (a) search_path = public, extensions, pg_temp
-- ---------------------------------------------------------------------------

alter function public.mowa_backup_log_immutable()
  set search_path = public, extensions, pg_temp;

alter function public.set_updated_at()
  set search_path = public, extensions, pg_temp;

alter function public.mowa_is_service()
  set search_path = public, extensions, pg_temp;

alter function public.mowa_current_bot()
  set search_path = public, extensions, pg_temp;

alter function public.mowa_approval_fields(uuid)
  set search_path = public, extensions, pg_temp;

alter function public.mowa_bot_row_guard()
  set search_path = public, extensions, pg_temp;

alter function public.mowa_proposal_expiry(uuid)
  set search_path = public, extensions, pg_temp;

alter function public.mowa_check_qty(text, numeric)
  set search_path = public, extensions, pg_temp;

alter function public.mowa_instrument_owner_guard()
  set search_path = public, extensions, pg_temp;

alter function public.journal_tickers_check()
  set search_path = public, extensions, pg_temp;

alter function public.report_revisions_immutable()
  set search_path = public, extensions, pg_temp;

alter function public.mcp_audit_log_append_only()
  set search_path = public, extensions, pg_temp;

alter function public.mcp_audit_log_no_truncate()
  set search_path = public, extensions, pg_temp;

alter function public.mowa_display_id(text, bigint)
  set search_path = public, extensions, pg_temp;

alter function public.mowa_bot_stamp_guard()
  set search_path = public, extensions, pg_temp;

alter function public.instruments_guard()
  set search_path = public, extensions, pg_temp;

alter function public.reports_guard()
  set search_path = public, extensions, pg_temp;

alter function public.reports_key_conflict_guard()
  set search_path = public, extensions, pg_temp;

alter function public.positions_guard()
  set search_path = public, extensions, pg_temp;

alter function public.position_proposals_prepare()
  set search_path = public, extensions, pg_temp;

alter function public.mowa_attention_stamp()
  set search_path = public, extensions, pg_temp;

alter function public.principle_proposals_prepare()
  set search_path = public, extensions, pg_temp;

alter function public.targets_valuation_guard()
  set search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- (b) REVOKE EXECUTE on trigger-only functions (RETURNS trigger)
-- ---------------------------------------------------------------------------

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.mowa_backup_log_immutable() from public, anon, authenticated;
revoke execute on function public.mowa_bot_row_guard() from public, anon, authenticated;
revoke execute on function public.mowa_instrument_owner_guard() from public, anon, authenticated;
revoke execute on function public.journal_tickers_check() from public, anon, authenticated;
revoke execute on function public.report_revisions_immutable() from public, anon, authenticated;
revoke execute on function public.mcp_audit_log_append_only() from public, anon, authenticated;
revoke execute on function public.mcp_audit_log_no_truncate() from public, anon, authenticated;
revoke execute on function public.mowa_bot_stamp_guard() from public, anon, authenticated;
revoke execute on function public.instruments_guard() from public, anon, authenticated;
revoke execute on function public.reports_guard() from public, anon, authenticated;
revoke execute on function public.reports_key_conflict_guard() from public, anon, authenticated;
revoke execute on function public.positions_guard() from public, anon, authenticated;
revoke execute on function public.position_proposals_prepare() from public, anon, authenticated;
revoke execute on function public.mowa_attention_stamp() from public, anon, authenticated;
revoke execute on function public.principle_proposals_prepare() from public, anon, authenticated;
revoke execute on function public.targets_valuation_guard() from public, anon, authenticated;

-- Trigger helpers that already had a fixed search_path (still RPC-callable)
revoke execute on function public.mowa_display_no_assign() from public, anon, authenticated;
revoke execute on function public.position_proposals_supersede() from public, anon, authenticated;
revoke execute on function public.positions_audit_trigger_breakeven() from public, anon, authenticated;
revoke execute on function public.principle_proposals_supersede() from public, anon, authenticated;
revoke execute on function public.reports_keep_revision() from public, anon, authenticated;

-- Legacy hosted-only rank trigger (absent from rebuild migrations / local stack)
do $legacy_trg$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'trg_trim_rank_run_records'
       and pg_get_function_identity_arguments(p.oid) = ''
       and p.prorettype = 'trigger'::regtype
  ) then
    execute 'revoke execute on function public.trg_trim_rank_run_records() from public, anon, authenticated';
  end if;
end
$legacy_trg$;
