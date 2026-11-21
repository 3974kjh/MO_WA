-- MO_WA rebuild M1 · DRAFT (미적용) · RLS
--  * 사용자(authenticated): owner_id = auth.uid() 행만. **delete 정책 없음**(PM 확정 Q-01: 영구 삭제 없음, 보관·복원만 / R-SYS-03)
--  * anon: 권한 회수
--  * 봇(MCP): service_role(BYPASSRLS) + 리포지토리 owner_id 강제 + 06 파일 가드 트리거
do $$
declare
  t text;
  owner_rw text[] := array[
    'instruments','positions','journal_entries',
    'reports','report_sources','report_instruments','attachments',
    'price_snapshots','portfolio_snapshots','targets_valuation','market_indicators',
    'decisions','events',
    're_complexes','re_complex_snapshots','re_market_stats','re_subscriptions','app_settings'];
  read_only text[] := array['report_revisions','position_proposals','mcp_audit_log'];
begin
  foreach t in array owner_rw || read_only || array['bot_clients','mcp_rate_buckets','market_indicator_keys'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke delete, truncate on table public.%I from authenticated', t);
  end loop;

  foreach t in array owner_rw loop
    execute format($f$create policy "%1$s_owner_select" on public.%1$I for select to authenticated
                     using (owner_id = (select auth.uid()))$f$, t);
    execute format($f$create policy "%1$s_owner_insert" on public.%1$I for insert to authenticated
                     with check (owner_id = (select auth.uid()))$f$, t);
    execute format($f$create policy "%1$s_owner_update" on public.%1$I for update to authenticated
                     using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$f$, t);
  end loop;

  -- 이력·승인 큐·감사 로그: 읽기만. 승인·거절은 approve_proposal / reject_proposal RPC (R-PERM-05, R-PERM-13)
  foreach t in array read_only loop
    execute format($f$create policy "%1$s_owner_select" on public.%1$I for select to authenticated
                     using (owner_id = (select auth.uid()))$f$, t);
    execute format('revoke insert, update on table public.%I from authenticated', t);
  end loop;
end
$$;

-- 지표 키 마스터: 읽기만
create policy "market_indicator_keys_read" on public.market_indicator_keys for select to authenticated using (true);
revoke insert, update on table public.market_indicator_keys from authenticated;

-- bot_clients: 조회·폐기(update). 발급 insert/key_hash 쓰기는 BE-12 RPC만(authenticated 직접 insert 금지)
create policy "bot_clients_owner_select" on public.bot_clients for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "bot_clients_owner_update" on public.bot_clients for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke insert, update on table public.bot_clients from authenticated;
grant update (name, description, scopes, rate_limit_per_min, expires_at, revoked_at, revoked_reason)
  on table public.bot_clients to authenticated;
revoke select on table public.bot_clients from authenticated;
grant select (id, owner_id, name, profile, description, key_prefix, scopes, rate_limit_per_min, expires_at,
              revoked_at, revoked_reason, last_used_at, last_used_ip, created_at, updated_at)
  on table public.bot_clients to authenticated;

revoke all on table public.mcp_rate_buckets from authenticated;

-- G-4 / R-VAL-P11 + PM 결정 2026-11-21: 사용자 정정 제안은 apply_user_correction RPC(security definer)로만 생성되며
-- 생성 즉시 승인·반영된다. 그래서 authenticated에 position_proposals insert 권한을 주지 않는다(select만, 상태 변경은 RPC).
