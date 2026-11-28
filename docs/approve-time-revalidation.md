# 승인 시점 재검증 (approve-time re-validation) — 설계

상태: **설계 + 구현(별도 브랜치 `cursor/approve-revalidate`, main 22f8548 위에 리베이스). main 에 올리지 않았고 운영 DB 에도 적용하지 않았다.**
위험도: 높음 — `proposalActions.ts`(승인 경로)·`approve_proposal` RPC·마이그레이션. 공식 pre-review PASS 와 사용자 재확인 전에는 main 에 올리거나 운영에 적용하지 않는다(적용은 PM 만).

## 1. 문제

`approve_proposal` RPC 는 `proposed_values || overrides` 를 그대로 `positions` 에 쓴다.

| 입력                                                    | 어디서 검사했나(이 작업 이전)                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| overrides (사용자가 고쳐 쓴 값)                         | 앱 `validateOverrides` + RPC 내부 키 허용목록·`mowa_check_qty`                                                                                       |
| proposed_values (봇이 보낸 값), 고치지 않고 그대로 승인 | propose 시점 MCP `validateProposedValues` + DB INSERT 트리거(키 허용목록·필수값·수량 M03) + `positions` CHECK. **승인 때는 앱에서 다시 보지 않는다** |

빈틈과 이 작업의 처리:

- **G1** 소수 자릿수 R-FMT-13(평균 단가 ≤ 4자리): MCP propose 에서만 봤다. 다른 경로로 들어온 `1.00005` 는 승인 시 `numeric(20,6)` 이 조용히 반올림. → 앱(`revalidate.ts`)과 **RPC 둘 다** 승인 시점에 다시 검사.
- **G2** 승인 때 실패하면 일반 오류만 보였다. → 봇이 보낸 값 문제는 무엇이 문제인지와 푸는 방법(고쳐서 반영/거절)을 안내(§4). 문제가 확실한 요청은 카드에서 **미리** 표시(M-1).
- **G3** 보관(archived)된 포지션/종목 위 제안은 RPC 가 보지 않았다. → **마이그레이션 `20261127010000_approve_proposal_block_archived.sql`** 이 막는다(§7). 사용자 확인 후 PM 이 적용.

## 2. 무엇을 다시 검사하나 (합친 값 `merged = proposed_values ∪ overrides`, override 우선)

| 검사                                    | 규칙 ID                                  | 앱 revalidate |       RPC(G3)       |
| --------------------------------------- | ---------------------------------------- | :-----------: | :-----------------: |
| proposed_values 가 객체                 | R-VAL-P07                                |       ✓       |          ✓          |
| 키 허용목록(변경 종류·제안자 종류별)    | 직접 쓰기 키 R-VAL-P07 / 그 밖 R-PERM-13 |       ✓       | override 키만(기존) |
| open_holding: qty·avg_price 모두 있음   | R-VAL-P04 (`missing`)                    |       ✓       |          ✓          |
| set_qty_avg: 둘 중 하나 이상            | R-VAL-P07 (`missing`)                    |       ✓       |          ✓          |
| qty: 유한 숫자, > 0, 자산 종류별 단위   | R-VAL-M03 / R-VAL-P04                    |       ✓       |          ✓          |
| avg_price: 숫자, > 0                    | R-VAL-M02                                |       ✓       |          ✓          |
| avg_price 소수 ≤ 4자리                  | **R-FMT-13**                             |       ✓       |          ✓          |
| currency ∈ {KRW, USD}                   | R-VAL-M01                                |       ✓       |          ✓          |
| 포지션 없는 open_holding: currency 필수 | R-VAL-M01 (`missing`)                    |       ✓       |          ✓          |
| 보관된 포지션 / 보관된 종목             | R-VAL-P02 · SQLSTATE MW001 / MW002       | (앱은 안내용) |          ✓          |

검사하지 **않는** 것(RPC 가 원자적으로 권위): 소유권, 상태/만료, base_version 충돌, 중복 보유. 앱 재검증은 포지션 현재 상태를 읽지 않는다.

### 순서 (L-2): 만료·superseded·버전 충돌이 값 재검사보다 먼저

- 앱: `handleApprove` 는 이미 읽은 행이 `pending`(만료 시각 전) 또는 `on_hold` 일 때만 재검증한다. 만료됐거나 superseded/종결 상태면 재검증 없이 RPC 로 보내 RPC 가 상태를 먼저 가린다(만료 → `expired` 로 전환, superseded → 중립 안내). on_hold 는 만료 제외 규칙(G-1)대로 항상 재검증.
- RPC: 세션 → 행 잠금 → 상태(superseded 등) → 만료 → 키 허용목록 → (포지션 FOR UPDATE → 종목 FOR SHARE → **보관 확인**) → base_version 충돌 → **값 재검사** → 쓰기. 보관 확인이 충돌보다 앞인 것은 의도: 보관된 대상은 어떤 경우에도 반영 불가이고, 충돌로 상태를 바꾸지 않아 사용자가 거절/복원할 수 있다.

## 3. 어디서

- 앱 서버: `src/lib/server/domain/proposals/revalidate.ts` → `revalidateMergedForApprove`. 호출: `proposalActions.ts` `handleApprove` — `validateOverrides` 뒤, `approveProposalRpc` 앞. RPC 는 **검사를 통과한 바로 그 overrides 객체**를 받는다(L-3, 테스트로 고정). 실패 시 `failValidation(400, ruleId, message, { key, source, asset, missing? })`, RPC 호출 없음.
- 앱 클라이언트: `src/lib/queue/proposals.ts` `proposedProblem(item)` — 같은 규칙으로 대기 요청 카드에서 미리 찾는다(M-1).
- DB: `approve_proposal` 재정의(§7).
- 거절·고쳐쓰기·ack·MCP 소스는 건드리지 않는다.

### 규칙이 있는 곳 (REPORT.md 열린 점 (b) 의 5곳 + 새 RPC 검사)

1. MCP `validateProposedValues` (`tools/portfolio.ts`, propose 시점)
2. `revalidate.ts` (승인 시점, 앱 서버)
3. `validateOverrides` (`overrides.ts`, 사용자가 고친 값)
4. DB 트리거 / RPC — INSERT 트리거 + **새 `approve_proposal` 값 재검사**(G3 마이그레이션)
5. 클라이언트 `checkOverrideDraft` (입력 안내) — 같은 파일의 `proposedProblem` 도 같은 규칙

드리프트 감시: `portfolio.parity.spec.ts` 가 같은 케이스 표(25건)를 MCP propose 핸들러(소스 수정 없음)·`revalidate.ts`·클라이언트 `proposedProblem` 에 돌려 첫 규칙 ID 를 비교하고, DB 는 `supabase/tests/approve_proposal_g3.psql` 이 같은 값들로 검증한다. 알려진 차이(표에 명시): ① set_qty_avg 에 두 값이 없을 때 MCP·revalidate 는 R-VAL-P07, 클라이언트는 안내용으로 R-VAL-P04; ② 포지션 없는 open_holding 에 통화가 없으면 MCP 는 통과시키지만 RPC·revalidate·클라이언트는 R-VAL-M01(원래도 positions.currency NOT NULL 로 일반 오류가 났던 건). 카드·서버 안내는 L-B 로 ‘통화가 빠져 있어요… 통화를 고르거나’에 맞춘다(수량·단가 누락 문구와 구분). MCP 가 통화 없는 open_holding 을 받아 주는 문제는 이후 **별도 고위험 MCP 변경**에서 막는다. 공유 검증 모듈도 그 변경에 둔다.

Info: avg_price ≥ 1e14 는 앱·RPC 어디서도 상한을 두지 않아 numeric(20,6) 오버플로가 일반 DB 오류로 실패한다(기존 상한 없음 건과 같은 문제, 이번에도 손대지 않음).

## 4. 오류 문구 (designer 확정 문구, 규칙 코드는 화면에 노출하지 않음)

`classifyActionResult` 가 `source === 'proposed'` 면 봇 값 문제용 문구를 쓴다. 안내 위치: 시트 안에서 승인하다 실패하면 시트 안 `mw-callout`(role=alert), 카드에서 5초 유예 뒤 실패하면 기존 롤백·오류 경로.

| 규칙 (source=proposed)                  | 문구                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-FMT-13                                | 봇이 보낸 평균 단가가 소수점 아래 4자리를 넘어서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.                              |
| R-VAL-M02                               | 봇이 보낸 평균 단가가 숫자가 아니거나 0 이하라서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.                              |
| R-VAL-M01                               | 봇이 보낸 통화가 원화·달러가 아니라서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.                                         |
| R-VAL-M03                               | 봇이 보낸 수량이 0 이하이거나 이 종목에 쓸 수 없는 단위예요**(주식·ETF는 정수만 / 현금은 소수 둘째 자리까지 / 그 밖은 괄호 없음)**. ‘고쳐서 반영’으로 … |
| R-VAL-P04                               | 봇이 보낸 요청에 수량이나 평균 단가가 빠졌거나 0 이하예요. ‘고쳐서 반영’으로 값을 채우거나 거절해 주세요.                                               |
| 값이 비어서 막힘(`missing`, 수량·단가)  | 봇이 보낸 요청에 수량이나 평균 단가가 빠져 있어요. ‘고쳐서 반영’으로 값을 채우거나 거절해 주세요. (Nit-2: 거절만 안내하지 않음)                         |
| 값이 비어서 막힘(`missing` + R-VAL-M01) | 봇이 보낸 요청에 통화가 빠져 있어요. ‘고쳐서 반영’으로 통화를 고르거나 거절해 주세요. (L-B: 포지션 없는 open_holding, 시트에서 통화를 고를 수 있음)     |
| R-VAL-P07 / R-PERM-13                   | 봇이 바꿀 수 없는 항목까지 보내서 이 요청은 반영할 수 없어요. 거절해 주세요.                                                                            |
| 보관된 보유 기록 (`ARCHIVED_POSITION`)  | 이 보유 기록은 보관돼 있어서 반영할 수 없어요. 거절하거나, 보관함에서 복원한 뒤 새 요청을 받아 주세요.                                                  |
| 보관된 종목 (`ARCHIVED_INSTRUMENT`)     | 이 종목은 보관돼 있어서 반영할 수 없어요. 거절하거나, 보관함에서 복원한 뒤 새 요청을 받아 주세요.                                                       |

사용자 입력 문구(source 없음/override)는 기존 그대로이고, 추가로 R-VAL-P04("수량과 평균 단가는 0보다 큰 값으로 입력해 주세요.")·R-VAL-M01("통화는 원 또는 달러만 고를 수 있어요.") 전용 문구를 넣었다(Nit-2).

## 5. M-1 — 반올림 표시와 '고쳐서 반영' 루프 수정

원인: 화면은 USD 평균 단가를 2자리로 보여 주고(`prefill`), 비교는 4자리 반올림(`normValue`)이라, 봇 값 `1.00005` 가 `$1.00` 으로 보이고 입력칸도 `1.00` → 그대로 두면 "봇 요청 값과 같아요 — 시트를 닫고 ‘반영’을 누르세요" → 반영은 새 재검증에 막힘(루프). 수정:

- 봇 값과의 비교는 **반올림 없는 정확 비교**(`sameAsBot`). 4자리 미만 차이도 변경이다.
- 봇 평균 단가가 4자리를 넘으면 `prefill` 이 4자리로 맞춘 값(`1.0001`)을 채우고 `readMine` 이 그 값을 '내가 고친 값'으로 읽어 `overrides` 로 보낸다(원래 값으로 되돌리지 않음). 직접 5자리 이상을 입력하면 입력 오류(클라이언트 4자리 검사 추가).
- 대기 카드: 봇 값이 그대로는 반영 불가인 요청은 `proposedProblem` 으로 미리 찾아 안내(`data-testid="proposed-problem"`)를 보이고 **‘반영’만 막는다**(`aria-disabled`·클릭 무시, 확인 시트도 `confirmApprove` 에서 한 번 더 막음). ‘고쳐서 반영’·보류·거절은 열려 있고, 시트에도 같은 안내가 뜬다.
- KRW(`100.00005` → `100.0001`)와 USD 모두 테스트.

## 6. 테스트·변이 검사·게이트

- 앱: `revalidate.spec.ts`(15), `overrides.spec.ts`(Nit-1), `proposalActions.spec.ts`(41: 만료·superseded·종결·on_hold 순서, L-3 객체 동일성, missing, MW001/MW002 코드), `queue/proposals.spec.ts`(M-1 루프 USD/KRW·proposedProblem 표·문구·보관 문구·L-B 통화 누락 문구), `QueueCard.svelte.spec.ts`(카드 안내·‘반영’만 막힘), `portfolio/+page.svelte.spec.ts`(Nit-B: confirmApprove 의 proposedProblem 가드), `portfolio.parity.spec.ts`(패리티 26 + L-B 안내).
- DB(로컬 격리 클러스터 127.0.0.1:55435 `mowa_local_g3` 에서만): `supabase/tests/approve_proposal_g3.psql` 55건 + `approve_proposal_g3_concurrency.sh`(두 세션: 종목 FOR SHARE·포지션 FOR UPDATE) + `run-approve-g3-local.sh` — 적용 → 테스트 → 두 세션 테스트 → 롤백(정의·ACL 이 기준선과 md5 동일) → 구 동작 테스트 13건 → 재적용(첫 적용과 정의 동일) → 테스트 → 두 세션 테스트. 직접 RPC 호출(소유자 세션)로 우회 불가, 만료·superseded·충돌이 값 오류보다 먼저, 보관 차단이 충돌보다 먼저, 권한(authenticated 만 EXECUTE)·SECURITY DEFINER·search_path 불변. `FOR SHARE`/`FOR UPDATE` 만 뺀 변이는 55건 단일 세션에서는 통과하지만 두 세션 테스트에 걸린다(L-A).
- 변이 검사: 앱 17종 전부 감지(`mutation-app.log`), SQL 15종 전부 감지(`mutation-sql.log`).
- 게이트: svelte-check 0/0, eslint 0, G-14 OK, 변경 파일 prettier 통과(전체 20개는 기준선 그대로), vitest 전체, `CF_PAGES=1 pnpm build` OK. 클라이언트 gzip 증가분은 리베이스 뒤 기준 main 22f8548 과 개편 전 4cd42d6 대비로 다시 잰다(상한은 개편 전 대비 +40 KiB). 2026-11-28부터는 절대값 한도 gzip 전체 250,000 B · CSS 45,056 B — `docs/stocks-screens.md` '클라이언트 크기 한도'.

## 7. G3 마이그레이션

`supabase/migrations/20261127010000_approve_proposal_block_archived.sql` — `approve_proposal` 하나만 `create or replace`(기존 정의와 같은 SECURITY DEFINER, `set search_path = public, pg_temp`, 소유자·세션 검사 유지, `revoke … from public, anon, service_role; grant execute … to authenticated` 재적용). 변경점:

1. 포지션 `FOR UPDATE` → 종목 `FOR SHARE` 순으로 잠근 뒤 보관 여부 확인(포지션 없는 open_holding 도 종목을 잠금). 보관 처리(UPDATE)는 같은 행 잠금을 기다리므로 '확인 직후 보관' 경쟁이 없다. SQLSTATE `MW001`(보유 보관)·`MW002`(종목 보관), 메시지 태그 `[R-VAL-P02]`(새 규칙 ID 를 만들지 않음 — R-VAL-P16 은 이미 거리% 규칙이라 쓰지 않음). 앱 `actionErrors.ts` 가 코드로 구분(`ARCHIVED_POSITION`/`ARCHIVED_INSTRUMENT`)하고 위 문구로 바꾼다.
2. 합친 값 재검사(§2 표 RPC 열). 초기 수량 단위 검사는 숫자일 때만(문자열이면 캐스팅 오류 대신 R-VAL-M03).
   Nit-A(기존 잔여, 이번에도 동작을 바꾸지 않음): `mowa_check_qty` 는 보관·충돌 검사보다 앞에 있다. 그래서 이미 만료·보관됐거나 버전이 어긋난 제안에 주식 소수 수량처럼 단위가 틀린 값이 있으면 MW001/MW002 나 충돌 전환이 아니라 R-VAL-M03 이 난다. 값을 고치면 그 다음 승인에서 보관·충돌 검사가 적용된다.
3. `positions_guard`·`approval_version` 은 건드리지 않는다. 처음엔 보관 시 `approval_version` 을 올리는 안을 봤지만 잠금 + 확인으로 원자성이 확보돼 불필요하고, 트리거 재정의 위험만 늘어 뺐다.

롤백: `supabase/rollbacks/20261127010000_approve_proposal_block_archived.down.sql`(0800 원본 정의를 그대로 복원 — 로컬 테스트에서 정의 md5 동일 확인). `supabase/migrations` 밖에 둬서 `db push` 가 자동 적용하지 않는다.

적용 순서(PM): ① 앱 변경을 먼저 또는 같이 배포해도 안전(앱이 없는 코드 MW001 을 기다리지 않음) ② 마이그레이션 적용 ③ 문제 시 롤백 SQL. 앱 재검증은 마이그레이션 없이도 단독으로 동작한다.

## 8. 운영 영향·잔여 위험

- PM 읽기 확인(18:2x KST): `position_proposals` 0행, pending `principle_proposals` 0건 → 이미 대기 중인 제안이 이 변경으로 막히는 일은 없다. 적용 직전에 PM 이 다시 센다. 만료 기본 7일이라 영향은 어차피 한정.
- 이미 승인된 과거 건은 영향 없음. 앞으로 규칙 위반 값이 든 대기 건은 승인이 막히고 거절/고쳐서 반영으로 푼다.
- G3 적용과 main 착지는 사용자 재확인 뒤 PM 이 지시한다. 이 브랜치는 운영 DB·wrangler·환경변수·Preview 를 건드리지 않았다.
- TOCTOU: proposed_values 는 INSERT 후 불변이라 재검증과 RPC 사이 값이 같다. 포지션 상태 변화는 RPC 잠금 + base_version.
- 규칙 이중 관리(§3) — 패리티 테스트로 감시.
- 앱과 RPC 의 남은 차이: 앱은 이미 만료·종결이거나 대기 상태가 아닌 제안은 재검증을 건너뛰고 RPC 로 보낸다. 버전이 어긋난 _동시에_ 값도 틀린 제안은 앱이 충돌로 미리 바꾸지 못해 RPC 값 검사에서 400 을 받을 수 있다(L-2, 허용한 Info). 값 검사가 통과하면 RPC 가 충돌로 바꾼다.
- `FOR SHARE` 는 승인 트랜잭션이 끝날 때까지 같은 종목의 비키 수정(이름·별칭 등)을 잠시 막는다. 포지션 `FOR UPDATE` 도 같은 동안 그 포지션 수정을 막는다.
- 예전 문자열 타입 qty/avg 값은 이제 RPC 가 거절한다(대기 제안 0건, 적용 직전 PM 이 다시 센다).
- MCP propose 는 여전히 포지션 없는 open_holding 에 통화가 없어도 받는다. 앱은 표시하고 RPC 는 M01 로 거절한다. 이후 MCP 변경에서 막을 것.
- avg_price·qty ≥ 1e14 는 앱·RPC 모두 상한이 없어 numeric(20,6) 오버플로가 일반 오류(22003)로 난다(기존과 같고 이번에도 손대지 않음).
- 앱 경로에는 종목→포지션 순 잠금이 없다. 인위적으로 그 순서를 만들면 40P01 교착이 날 수 있고, 앱은 `retryOnceOnDeadlock` 으로 한 번 재시도한다.
- 오류 본문의 ruleIds(화면에 안 그림)는 이전과 같이 R-\* 코드를 담는다.
