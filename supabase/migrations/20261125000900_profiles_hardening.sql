-- MO_WA rebuild M1 · DRAFT (미적용) · profiles 정책 정리 (유지 대상이므로 구조는 그대로, 정책만 세분화)
-- 기존: "profiles are user-owned" for all (삭제까지 허용) → select/insert/update만 허용
drop policy if exists "profiles are user-owned" on public.profiles;
create policy "profiles_self_select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_self_insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on table public.profiles from anon;
revoke delete, truncate on table public.profiles from authenticated;   -- Q-01: 영구 삭제 없음
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
