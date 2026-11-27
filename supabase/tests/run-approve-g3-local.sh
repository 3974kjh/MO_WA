#!/usr/bin/env bash
# G3 로컬 DB 테스트 러너: (기준선 정의 저장) → 마이그레이션 적용 → 테스트 → 두 세션 잠금 테스트 → 롤백 → 원본과 동일 확인 → 재적용 → 테스트 → 두 세션 잠금 테스트.
# 로컬 전용(기본 127.0.0.1:55435 mowa_local_g3). 운영·원격·I-7(55433) 금지.
set -eo pipefail
HOST=${PGHOST:-127.0.0.1}; PORT=${PGPORT:-55435}; DB=${PGDATABASE:-mowa_local_g3}; USER_=${PGUSER:-postgres}
if [ "$PORT" = "55433" ] || [ "$HOST" != "127.0.0.1" ]; then echo "refusing: local isolated cluster only" >&2; exit 2; fi
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
MIG=$ROOT/supabase/migrations/20261127010000_approve_proposal_block_archived.sql
DOWN=$ROOT/supabase/rollbacks/20261127010000_approve_proposal_block_archived.down.sql
P="psql -v ON_ERROR_STOP=1 -X -q -h $HOST -p $PORT -U $USER_ -d $DB"
def() { $P -tA -c "select md5(pg_get_functiondef('public.approve_proposal(uuid,jsonb,text)'::regprocedure))"; }
acl() { $P -tA -c "select md5(coalesce(proacl::text,'')||prosecdef::text||coalesce(proconfig::text,'')) from pg_proc where oid='public.approve_proposal(uuid,jsonb,text)'::regprocedure"; }
if $P -tA -c "select pg_get_functiondef('public.approve_proposal(uuid,jsonb,text)'::regprocedure)" | grep -q MW001; then
  echo "refusing: G3 already applied on $DB; run the .down.sql first so the baseline is the pre-G3 definition" >&2; exit 3; fi
echo "# G3 local DB test  $(date '+%F %T %Z')  target=$HOST:$PORT/$DB"
BASE_DEF=$(def); BASE_ACL=$(acl); echo "baseline def md5=$BASE_DEF acl md5=$BASE_ACL"
echo "## apply #1"; $P -f "$MIG"; NEW_DEF=$(def); NEW_ACL=$(acl); echo "new def md5=$NEW_DEF acl md5=$NEW_ACL"
[ "$NEW_DEF" != "$BASE_DEF" ] && echo "ok - definition changed"; [ "$NEW_ACL" = "$BASE_ACL" ] && echo "ok - ACL/secdef/search_path unchanged"
echo "## tests (new)"; $P -v is_new=1 -f "$HERE/approve_proposal_g3.psql" 2>&1 | sed -e 's/^psql:[^ ]*: //' -e '/^$/d'
echo "## two-session locks (new)"; bash "$HERE/approve_proposal_g3_concurrency.sh"
echo "## rollback"; $P -f "$DOWN"; RB_DEF=$(def); RB_ACL=$(acl); echo "rolled-back def md5=$RB_DEF acl md5=$RB_ACL"
[ "$RB_DEF" = "$BASE_DEF" ] && echo "ok - rollback definition == baseline" || { echo "FAIL rollback differs"; exit 1; }
[ "$RB_ACL" = "$BASE_ACL" ] && echo "ok - rollback ACL == baseline" || { echo "FAIL rollback ACL differs"; exit 1; }
echo "## tests (old, post-rollback)"; $P -v is_new=0 -f "$HERE/approve_proposal_g3.psql" 2>&1 | sed -e 's/^psql:[^ ]*: //' -e '/^$/d'
echo "## re-apply #2"; $P -f "$MIG"; RE_DEF=$(def); RE_ACL=$(acl)
[ "$RE_DEF" = "$NEW_DEF" ] && [ "$RE_ACL" = "$NEW_ACL" ] && echo "ok - re-apply definition == first apply" || { echo "FAIL re-apply differs"; exit 1; }
echo "## tests (new, after re-apply)"; $P -v is_new=1 -f "$HERE/approve_proposal_g3.psql" 2>&1 | sed -e 's/^psql:[^ ]*: //' -e '/^$/d'
echo "## two-session locks (new, after re-apply)"; bash "$HERE/approve_proposal_g3_concurrency.sh"
echo "# DONE: apply -> tests -> two-session -> rollback -> tests(old) -> re-apply -> tests -> two-session all passed"
