#!/usr/bin/env bash
# G3 L-A 두 세션 잠금 테스트. 로컬 전용(기본 127.0.0.1:55435 mowa_local_g3). 운영·원격·I-7(55433) 금지.
#  1) 종목 FOR SHARE: 세션 B가 종목을 보관(미커밋)하면 승인은 기다렸다가 MW002.
#     승인이 먼저 잠그면 보관 UPDATE 가 기다리고, 승인이 먼저 커밋된다.
#  2) 포지션 FOR UPDATE: 같은 순서로 MW001.
# FOR SHARE / FOR UPDATE 만 뺀 변이는 보관 중인 대상의 승인이 성공해 이 스크립트가 실패한다.
set -euo pipefail
HOST=${PGHOST:-127.0.0.1}; PORT=${PGPORT:-55435}; DB=${PGDATABASE:-mowa_local_g3}; USER_=${PGUSER:-postgres}
if [ "$PORT" = "55433" ] || [ "$HOST" != "127.0.0.1" ]; then
  echo "refusing: local isolated cluster only" >&2
  exit 2
fi
P() { psql -v ON_ERROR_STOP=1 -X -q -h "$HOST" -p "$PORT" -U "$USER_" -d "$DB" "$@"; }
if ! P -tA -c "select pg_get_functiondef('public.approve_proposal(uuid,jsonb,text)'::regprocedure)" | grep -q MW002; then
  echo "refusing: G3 definition (MW002) not applied on $DB" >&2
  exit 3
fi

WORKDIR=$(mktemp -d /tmp/g3c.XXXXXX)
PASS=0
FAIL=0
log() { printf '%s\n' "$*"; }
ok() { log "ok   - $1"; PASS=$((PASS+1)); }
fail() { log "FAIL - $1"; FAIL=$((FAIL+1)); }

cleanup() {
  # 테스트 세션이 잠금을 들고 남아 있지 않게 먼저 끊고, 우리가 만든 행만 지운다.
  P -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and application_name like 'g3c-%';" >/dev/null 2>&1 || true
  P <<'SQL' >/dev/null 2>&1 || true
begin;
select set_config('session_replication_role', 'replica', true);
delete from public.mcp_audit_log where owner_id in (select owner_id from public.instruments where ticker like '91100%');
delete from public.position_proposals where owner_id in (select owner_id from public.instruments where ticker like '91100%');
delete from public.positions where owner_id in (select owner_id from public.instruments where ticker like '91100%');
delete from public.instruments where ticker like '91100%';
delete from auth.users where email like '%@g3c.invalid';
drop table if exists public.g3c_ctl;
commit;
SQL
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

P <<'SQL' >/dev/null
begin;
create table if not exists public.g3c_ctl(k text primary key, v text not null default '0');
delete from public.g3c_ctl;
insert into public.g3c_ctl(k, v) values ('go_a','0'), ('go_b','0');
select set_config('session_replication_role', 'replica', true);
insert into auth.users(id, email) values (gen_random_uuid(), 'u1@g3c.invalid');
insert into public.instruments(id, owner_id, ticker, name, market, asset_type, archived_at)
select gen_random_uuid(), u.id, t.ticker, t.ticker, 'KRX', 'stock', null
  from auth.users u,
       (values ('911001'),('911002'),('911003'),('911004')) as t(ticker)
 where u.email = 'u1@g3c.invalid';
insert into public.positions(id, owner_id, instrument_id, status, currency, qty, avg_price, archived_at)
select gen_random_uuid(), i.owner_id, i.id, 'holding', 'KRW', 10, 1000, null
  from public.instruments i where i.ticker like '91100%';
insert into public.position_proposals(id, owner_id, display_no, change_type, position_id, instrument_id, base_version,
    proposed_values, evidence, proposed_by_type, status, expires_at)
select gen_random_uuid(), p.owner_id, 9000 + row_number() over (order by i.ticker), 'set_qty_avg', p.id, i.id, p.approval_version,
       '{"qty":11}'::jsonb, '[{"note":"g3c"}]'::jsonb, 'bot', 'pending', now() + interval '7 days'
  from public.positions p join public.instruments i on i.id = p.instrument_id
 where i.ticker like '91100%';
commit;
SQL

ids() { P -tA -c "select $1 from public.instruments i join public.positions p on p.instrument_id=i.id join public.position_proposals pp on pp.position_id=p.id where i.ticker='$2'"; }
uid=$(P -tA -c "select id::text from auth.users where email='u1@g3c.invalid'")
jwt=$(printf '{"sub":"%s","role":"authenticated"}' "$uid")

set_go() { P -c "update public.g3c_ctl set v='$2' where k='$1';" >/dev/null; }
reset_go() { P -c "update public.g3c_ctl set v='0';" >/dev/null; }

wait_file() { # $1 file $2 needle $3 timeout sec
  local i=0 max=$(( ${3:-8} * 20 ))
  while [ "$i" -lt "$max" ]; do
    if grep -q -- "$2" "$1" 2>/dev/null; then return 0; fi
    sleep 0.05; i=$((i+1))
  done
  return 1
}

# 세션이 Lock 을 기다리거나, 아직 결과에 도달하지 못했는지 본다.
is_waiting() { # $1 application_name
  local ev
  ev=$(P -tA -c "select coalesce(wait_event_type,'') from pg_stat_activity where application_name='$1' and pid <> pg_backend_pid() limit 1")
  [ "$ev" = "Lock" ]
}

backend_alive() {
  local n
  n=$(P -tA -c "select count(*) from pg_stat_activity where application_name='$1' and pid <> pg_backend_pid()")
  [ "$n" -ge 1 ]
}

# $1 app name  $2 sql file  $3 out file
start_sql() {
  local app="$1" sql="$2" out="$3"
  # statement_timeout 으로 교착·분실 시그널에도 무한 대기를 막는다.
  P -v ON_ERROR_STOP=1 -c "set statement_timeout = '20s';" -f "$sql" >"$out" 2>&1 &
  echo $!
}

# ---------- 시나리오: 보관을 먼저(미커밋) → 승인이 잠금을 기다렸다가 MW00x ----------
# $1 ticker  $2 table (instruments|positions)  $3 expect SQLSTATE  $4 label
archive_first() {
  local ticker="$1" table="$2" want="$3" label="$4"
  local appA="g3c-A-$ticker" appB="g3c-B-$ticker"
  local id proposal outA outB sqlA sqlB
  if [ "$table" = instruments ]; then id=$(ids "i.id::text" "$ticker"); else id=$(ids "p.id::text" "$ticker"); fi
  proposal=$(ids "pp.id::text" "$ticker")
  outA="$WORKDIR/$ticker-A.out"; outB="$WORKDIR/$ticker-B.out"
  sqlB="$WORKDIR/$ticker-B.sql"; sqlA="$WORKDIR/$ticker-A.sql"
  reset_go
  cat >"$sqlB" <<SQL
begin;
set application_name = '$appB';
set statement_timeout = '20s';
update public.$table set archived_at = clock_timestamp() where id = '$id';
\\echo LOCKED
do \$\$
begin
  while (select v from public.g3c_ctl where k = 'go_b') is distinct from '1' loop
    perform pg_sleep(0.05);
  end loop;
end \$\$;
commit;
\\echo COMMITTED
SQL
  cat >"$sqlA" <<SQL
set application_name = '$appA';
set statement_timeout = '20s';
\\echo STARTED
do \$\$
declare r text;
begin
  perform set_config('request.jwt.claims', '$jwt', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.approve_proposal('$proposal'::uuid, '{}'::jsonb, null);
    r := 'ok';
  exception when others then
    r := sqlstate || '|' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  raise notice 'RESULT:%', r;
end \$\$;
SQL

  start_sql "$appB" "$sqlB" "$outB" >/dev/null
  if ! wait_file "$outB" "LOCKED" 8; then
    fail "$label: session B did not take the archive lock"; cat "$outB"; return
  fi
  start_sql "$appA" "$sqlA" "$outA" >/dev/null
  if ! wait_file "$outA" "STARTED" 8; then
    fail "$label: session A did not start"; cat "$outA"; set_go go_b 1; return
  fi
  # A 가 잠금을 기다리기 시작할 시간을 준다. 변이(잠금 없음)면 이 사이에 끝나 버린다.
  local waited=0 i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if is_waiting "$appA"; then waited=1; break; fi
    if grep -q 'RESULT:' "$outA" 2>/dev/null; then break; fi
    sleep 0.1
  done
  local result
  if [ "$waited" -eq 1 ]; then
    set_go go_b 1
    if ! wait_file "$outA" "RESULT:" 8; then
      fail "$label: session A did not finish after B committed"; cat "$outA"; return
    fi
  else
    # 기다리지 않고 끝났다면(잠금 빠진 변이) 결과를 읽고 B 를 커밋한다.
    wait_file "$outA" "RESULT:" 4 || true
    set_go go_b 1
  fi
  wait_file "$outB" "COMMITTED" 8 || true
  result=$(grep -o 'RESULT:.*' "$outA" | tail -1 | sed 's/^RESULT://')
  local status
  status=$(P -tA -c "select status from public.position_proposals where id='$proposal'")
  if [ "$waited" -ne 1 ]; then
    fail "$label: approve did not wait on the lock (got [$result], status=$status) — lock probably missing"
    return
  fi
  case "$result" in
    "$want"|$want\|*) ok "$label: waited then $want (status=$status)" ;;
    *) fail "$label: expected $want after wait, got [$result] status=$status"; cat "$outA" ;;
  esac
  if [ "$status" != "pending" ]; then
    fail "$label: proposal should stay pending, got $status"
  fi
}

# ---------- 시나리오: 승인이 먼저 잠금 → 보관 UPDATE 가 기다리고 승인이 먼저 커밋 ----------
# $1 ticker $2 table $3 label
approve_first() {
  local ticker="$1" table="$2" label="$3"
  local appA="g3c-A-$ticker" appB="g3c-B-$ticker"
  local id proposal outA outB sqlA sqlB
  if [ "$table" = instruments ]; then id=$(ids "i.id::text" "$ticker"); else id=$(ids "p.id::text" "$ticker"); fi
  proposal=$(ids "pp.id::text" "$ticker")
  outA="$WORKDIR/$ticker-A.out"; outB="$WORKDIR/$ticker-B.out"
  sqlA="$WORKDIR/$ticker-A.sql"; sqlB="$WORKDIR/$ticker-B.sql"
  reset_go
  cat >"$sqlA" <<SQL
begin;
set application_name = '$appA';
set statement_timeout = '20s';
select set_config('request.jwt.claims', '$jwt', true);
select set_config('role', 'authenticated', true);
select public.approve_proposal('$proposal'::uuid, '{}'::jsonb, null);
select set_config('role', 'none', true);
\\echo APPROVED
do \$\$
begin
  while (select v from public.g3c_ctl where k = 'go_a') is distinct from '1' loop
    perform pg_sleep(0.05);
  end loop;
end \$\$;
commit;
\\echo COMMITTED
SQL
  cat >"$sqlB" <<SQL
set application_name = '$appB';
set statement_timeout = '20s';
\\echo STARTED
begin;
update public.$table set archived_at = clock_timestamp() where id = '$id';
commit;
\\echo COMMITTED
SQL

  start_sql "$appA" "$sqlA" "$outA" >/dev/null
  if ! wait_file "$outA" "APPROVED" 8; then
    fail "$label: session A did not approve"; cat "$outA"; set_go go_a 1; return
  fi
  start_sql "$appB" "$sqlB" "$outB" >/dev/null
  if ! wait_file "$outB" "STARTED" 8; then
    fail "$label: session B did not start"; cat "$outB"; set_go go_a 1; return
  fi
  local waited=0 i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if is_waiting "$appB"; then waited=1; break; fi
    if grep -q COMMITTED "$outB" 2>/dev/null; then break; fi
    sleep 0.1
  done
  # 승인 커밋 전 보관이 끝났다면 잠금이 없는 것
  local archived_before
  archived_before=$(P -tA -c "select (archived_at is not null)::text from public.$table where id='$id'")
  if [ "$waited" -ne 1 ]; then
    set_go go_a 1
    wait_file "$outA" "COMMITTED" 8 || true
    wait_file "$outB" "COMMITTED" 8 || true
    fail "$label: archive did not wait for the approve transaction (archived_before_commit=$archived_before)"
    return
  fi
  if [ "$archived_before" = "true" ]; then
    set_go go_a 1
    fail "$label: archive became visible before approve committed"
    return
  fi
  set_go go_a 1
  if ! wait_file "$outA" "COMMITTED" 8; then
    fail "$label: session A did not commit"; cat "$outA"; return
  fi
  if ! wait_file "$outB" "COMMITTED" 8; then
    fail "$label: session B did not finish after A committed"; cat "$outB"; return
  fi
  local status archived
  status=$(P -tA -c "select status from public.position_proposals where id='$proposal'")
  archived=$(P -tA -c "select (archived_at is not null)::text from public.$table where id='$id'")
  if [ "$status" = "approved" ] && [ "$archived" = "true" ]; then
    ok "$label: archive waited, approve committed first (then archived)"
  else
    fail "$label: expected approved+archived, got status=$status archived=$archived"
  fi
}

log "# G3 two-session lock tests  $(date '+%F %T %Z')  target=$HOST:$PORT/$DB"
archive_first 911001 instruments MW002 "instrument FOR SHARE: archive first (uncommitted) -> approve waits then MW002"
approve_first 911002 instruments "instrument FOR SHARE: approve first -> archive waits, approve commits first"
archive_first 911003 positions MW001 "position FOR UPDATE: archive first (uncommitted) -> approve waits then MW001"
approve_first 911004 positions "position FOR UPDATE: approve first -> archive waits, approve commits first"

log "---- summary ----"
log "passed=$PASS failed=$FAIL"
if [ "$FAIL" -ne 0 ]; then exit 1; fi
log "# DONE: two-session lock tests passed"
