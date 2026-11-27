# 승인 시점 재검증 (approve-time re-validation) — 설계

상태: **설계 + 구현(별도 브랜치 `cursor/approve-revalidate`, 0e335b4 기준). 번들에 포함하지 않음, 랜딩하지 않음.**
위험도: 높음 — `proposalActions.ts`(승인 경로) 수정. 공식 pre-review PASS 전에는 main 에 올리지 않는다.

## 1. 문제

`approve_proposal` RPC 는 `proposed_values || overrides` 를 그대로 `positions` 에 쓴다.

| 입력                                                    | 어디서 검사하나                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| overrides (사용자가 고쳐 쓴 값)                         | 앱 `validateOverrides` + RPC 내부 키 허용목록·`mowa_check_qty`                                                                                       |
| proposed_values (봇이 보낸 값), 고치지 않고 그대로 승인 | propose 시점 MCP `validateProposedValues` + DB INSERT 트리거(키 허용목록·필수값·수량 M03) + `positions` CHECK. **승인 때는 앱에서 다시 보지 않는다** |

빈틈(코드로 확인):

- **G1 (이 브랜치가 막음)** 소수 자릿수 R-FMT-13(평균 단가 ≤ 4자리): MCP propose 에서만 본다. 다른 경로(직접 INSERT·MCP 이전 데이터·서비스 롤)로 들어온 `1.00005` 는 승인 시 `numeric(20,6)` 이 조용히 반올림/통과한다.
- **G2 (이 브랜치가 문구 개선)** 승인 때 DB CHECK 에서 실패하면 사용자는 일반 오류만 본다. 어떤 값이 문제인지, 어떻게 풀지(고쳐서 반영/거절) 안내가 없다.
- **G3 (이 브랜치가 막지 못함 — 마이그레이션 필요, §7)** 보관(archived)된 포지션/종목 위에 올라온 제안은 RPC 가 보지 않는다. `approval_version` 은 qty/avg/status/currency 변경에만 올라 보관 처리는 base_version 충돌로도 잡히지 않는다.

## 2. 무엇을 다시 검사하나

합친 값 `merged = proposed_values ∪ overrides` (override 우선)에 대해, propose 시점과 같은 규칙을 한 번 더:

| 검사                                              | 규칙 ID                                                | 비고                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| proposed_values 가 객체                           | R-VAL-P07                                              | null·배열·문자열 거부                                                                             |
| 키 허용목록(변경 종류·제안자 종류별)              | 직접 쓰기 키(breakeven 등) R-VAL-P07 / 그 밖 R-PERM-13 | `allowedOverrideKeys` 재사용(DB 트리거와 동일) — 봇의 set_qty_avg 에 currency 불가, 사용자는 가능 |
| open_holding: qty·avg_price 모두 있음             | R-VAL-P04                                              |                                                                                                   |
| set_qty_avg: 둘 중 하나 이상                      | R-VAL-P07                                              |                                                                                                   |
| qty: 유한 숫자, > 0, 자산 종류별 단위(`parseQty`) | R-VAL-M03 / R-VAL-P04                                  | 주식·ETF 정수, 현금 소수 허용 등                                                                  |
| avg_price: 숫자, > 0                              | R-VAL-M02                                              |                                                                                                   |
| avg_price 소수 ≤ 4자리                            | **R-FMT-13**                                           | G1                                                                                                |
| currency ∈ {KRW, USD}                             | R-VAL-M01                                              |                                                                                                   |
| close: 값 없음                                    | R-PERM-13                                              |                                                                                                   |

검사하지 **않는** 것(RPC 가 원자적으로 권위): 소유권, 상태/만료, base_version 충돌, 중복 보유, 포지션 존재·잠금. 이 함수는 포지션 현재 상태를 읽지 않으므로 새 경쟁 조건을 만들지 않는다. proposed_values 는 INSERT 후 DB 트리거로 불변이라 읽은 값과 RPC 가 쓸 값이 같다.

## 3. 어디서

- 순수 함수 `src/lib/server/domain/proposals/revalidate.ts` → `revalidateMergedForApprove(...)` (`index.ts` 에서 export). DB·네트워크 없음.
- 호출 지점: `src/lib/server/web/proposalActions.ts` `handleApprove` — `validateOverrides` 통과 직후, `approveProposalRpc` **직전**. `loadProposalMeta` 가 `proposed_values` 를 함께 읽는다(같은 SELECT, 쿼리 수 증가 없음).
- 실패 시 `failValidation(400, ruleId, message, { key, source })`, **RPC 호출 없음**(승인 상태·감사 로그 변화 없음).
- 거절(`handleReject`)·고쳐쓰기(`handleCorrect`)·ack 는 건드리지 않는다. MCP 쪽(`tools/portfolio.ts`)도 건드리지 않는다.

의도적으로 하지 않은 것: MCP propose 검증과 공유 검증기로 합치는 리팩터링(고위험 파일 수정 확대). 따라서 규칙이 두 곳에 있다 — 중복은 `revalidate.spec.ts` 의 경계 테스트로 감시하고, 합치는 일은 별도 작업으로 제안한다.

## 4. 오류 문구

서버 응답: `{ ruleIds: [ruleId], message(영문 [R-…]), key, source }`. 화면은 `src/lib/queue/proposals.ts` `classifyActionResult` 에서 `source === 'proposed'` 일 때 **봇이 보낸 값 문제**용 문구를 쓴다(규칙 코드는 화면에 노출하지 않음). 사용자 입력(`override`/없음)은 기존 문구 그대로.

| 규칙                  | 문구 (source=proposed)                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R-FMT-13              | 봇이 보낸 평균 단가가 소수 넷째 자리를 넘어서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요. |
| R-VAL-M02             | 봇이 보낸 평균 단가가 올바르지 않아 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 …                                      |
| R-VAL-M01             | 봇이 보낸 통화가 원화·달러가 아니라서 …                                                                                 |
| R-VAL-M03             | 봇이 보낸 수량이 규칙에 맞지 않아 …                                                                                     |
| R-VAL-P04             | 봇이 보낸 요청에 수량이나 평균 단가가 빠졌거나 0 이하예요. ‘고쳐서 반영’으로 값을 채우거나 거절해 주세요.               |
| R-VAL-P07 / R-PERM-13 | 봇이 보낸 값에 고칠 수 없는 항목이 있어요. 이 요청은 거절해 주세요.                                                     |

포트폴리오 화면의 반영은 5초 유예 후 요청이므로(G-2), 실패 시 기존 롤백·오류 안내 경로를 그대로 탄다(UI 코드 변경 없음, 문구만 추가). 문구는 디자이너 카피 리뷰 대상.

## 5. 테스트

- `revalidate.spec.ts` (13): 정상·소수 5자리·override 가 proposed 문제를 덮음·source 구분·avg 0/음수/문자열/NaN·통화·open_holding 필수값·qty 경계(자산 종류별)·set_qty_avg 빈 값·close·직접 쓰기/허용 밖 키·객체 아님·가격 경계.
- `proposalActions.spec.ts` (+6): 5자리 → 400 R-FMT-13 + RPC 미호출, 고쳐서 승인 → RPC 호출(overrides 전달), 정상 통과, 키/값 오류 4종 RPC 미호출, open_holding 필수값, close 통과. `fakeSupabase` 가 `proposed_values` 를 돌려주도록 확장(기본 `{ qty: 2 }`).
- `queue/proposals.spec.ts` (+1): source=proposed 문구, 사용자 입력 문구 불변, 매핑 없는 규칙은 일반 안내.
- 변이 검사: (M1) 소수 자릿수 검사 제거 → 4 실패, (M2) 호출 삭제 → 3 실패, (M3) 병합 순서 뒤집기 → 2 실패, (M4) source 무시 → 1 실패. 전부 감지.
- 게이트: check 0/0, eslint 0, prettier, vitest 전체 113 files / 1384 tests 통과.

## 6. 잔여 위험

- TOCTOU: 재검증과 RPC 사이에 proposed_values 는 불변이라 값은 같다. 포지션 상태 변화는 RPC 의 base_version 이 담당(변경 없음).
- 이미 승인된 과거 건은 영향 없음. 이미 PENDING 인 제안 중 규칙 위반 건은 승인이 막히고 거절/고쳐서 반영으로 풀어야 한다 — 운영 데이터에 해당 건이 있는지는 PM 이 읽기 쿼리로 확인(이 작업은 DB 접근 안 함).
- 규칙 이중 관리(§3).
- 새 규칙 추가 시 MCP·재검증 양쪽 갱신 필요.

## 7. 마이그레이션이 필요한 항목 (구현하지 않음 — PM 에게 먼저 보고)

G3 보관 포지션/종목 위 제안 승인 방지는 원자성이 필요해 `approve_proposal` 에서 `FOR UPDATE` 로 잠근 뒤 `archived_at IS NULL`(포지션·종목)을 확인해야 한다. 앱 레벨 선검사는 읽기와 RPC 사이 경쟁이 남아 효과가 불완전하다. → 새 마이그레이션(+ RPC 재정의)이 필요하므로 **이번 범위에서 중단**. 대안(선택): `approval_version` 을 보관 처리에도 올리면 기존 base_version 충돌로 해결되나 역시 마이그레이션.
