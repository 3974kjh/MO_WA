# MCP 툴 목록·사용법 (BE-14 골격)

상태: 초안 (골격만). 도구별 입력·출력 스키마는 TBD(BE-07 이후 채움 — 구현은 main에 있으나 이 골격 문서에서는 스키마를 기입하지 않는다).  
기준: GitHub `3974kjh/MO_WA` main `faaecc5df9bd1cf665333275c6e140b83a2b0e71` (2026-11-24 검증).  
자동 생성 영문 참조(도구별 입력 스키마 전체): [`docs/mcp-tools.generated.md`](./mcp-tools.generated.md) — `pnpm docs:mcp-tools`로 갱신하며, 이 한국어 문서는 생성기가 덮어쓰지 않는다.

이 문서는 Grok Bot(및 다른 MCP 클라이언트)이 `POST /api/mcp`로 무엇을 호출할 수 있는지, 어떻게 인증하고, 오류와 규칙 ID를 어떻게 읽는지 설명한다.

## 1. 엔드포인트

| 항목 | 값 |
|---|---|
| 경로 | `POST /api/mcp` |
| 프로토콜 | MCP Streamable HTTP (`@modelcontextprotocol/sdk`, JSON 응답) |
| 서버 이름·버전 | `mo-wa` / `0.1.0-spike` (`MCP_SERVER_VERSION`) |
| 세션 | 없음. 요청마다 서버·transport를 새로 만든다 (`sessionIdGenerator: undefined`). |
| 본문 상한 | `Content-Length` 기준 1,500,000바이트. 초과 시 HTTP 413, `{ "error": "payload_too_large" }` |
| Origin | `Origin` 헤더가 있으면 `https://mo-wa.pages.dev` 또는 `https://<subdomain>.mo-wa.pages.dev`만 허용. 그 외는 HTTP 403, `{ "error": "origin_not_allowed" }`. 헤더가 없으면 Origin 검사를 건너뛴다. |

허용 메서드: **POST만**. 라우트 핸들러(`src/routes/api/mcp/+server.ts`)는 GET·DELETE에 HTTP 405, `Allow: POST`를 반환한다.

`hooks.server.ts` MCP 경로 동작:

- `OPTIONS`와 **non-POST**(GET/DELETE)는 인증을 건너뛰고 라우트로 넘긴다 → GET/DELETE는 405.
- **POST**에 `Authorization` 헤더가 없으면 핸들러보다 먼저 HTTP 401 `{ "error": "Unauthorized" }`와 `WWW-Authenticate: Bearer realm="mo-wa-mcp"`를 반환한다.

## 2. Bearer 인증

`Authorization: Bearer <key>`가 필요하다. 쿠키 세션은 쓰지 않는다.

키 형식: `mowa_<prefix>_<secret>`

- `prefix`: `[a-z0-9]` 10자
- `secret`: base64url 43자 (32바이트, `[A-Za-z0-9_-]{43}`)
- 형식이 아니거나 헤더가 없으면 인증 실패 (`missing_or_malformed_key` 또는 훅의 `Unauthorized`)

서버는 `MCP_KEY_PEPPER`로 secret의 HMAC-SHA256을 계산해 비교한다. 원문 키를 로그에 남기지 않는다. 클라이언트 헤더 `x-mowa-bot-id`는 **읽지 않는다**(신원은 인증된 키·DB 행에서만).

### 인증 모드 (`MCP_AUTH_MODE`)

| 모드 | 기본 | 동작 (main 기준) |
|---|---|---|
| `env` | 예 (미설정 시) | 스파이크 키. `MCP_SPIKE_KEY_PREFIX`·`MCP_SPIKE_KEY_HASH`와 비교. 성공 시 `botName=spike`, `profile=custom`, `scopes=['read']`, `ownerId=null`, `botClientId=env:<prefix>`, `repo=null` |
| `db` | 아니오 | `mcp_authenticate` RPC 후 `mintBotRepoIdentity` → `forBot`. `allowed=false`면 429. |
| (그 외) | — | `'env'`/`'db'`가 아니면 500 `server_misconfigured` (fail-closed) |

### HTTP 인증·게이트 오류

성공하지 못하면 본문은 `{ "error": "<reason>" }` 형태다. `WWW-Authenticate: Bearer realm="mo-wa-mcp"`는 401에 붙는다. 429에는 `Retry-After`가 붙는다.

| HTTP | reason | 의미 |
|---|---|---|
| 401 | `Unauthorized` | 훅: POST에 `Authorization` 헤더 없음 |
| 401 | `missing_or_malformed_key` | Bearer 파싱 실패 또는 키 형식 불일치 |
| 401 | `invalid_key` | prefix/hash 불일치, 또는 DB 모드에서 행 없음 |
| 403 | `origin_not_allowed` | Origin 헤더가 허용 목록 밖 |
| 413 | `payload_too_large` | 본문 상한 초과 |
| 429 | `rate_limited` | DB 모드에서 `allowed=false`. `Retry-After` 초(`retry_after_s`, 없거나 0이면 60) |
| 500 | `server_misconfigured` | `MCP_KEY_PEPPER` 없음, 또는 `MCP_AUTH_MODE`가 `env`/`db`가 아님 |
| 500 | `auth_backend_error` | DB 모드 RPC 오류 |
| 405 | (본문 없음) | 핸들러에 도달한 GET/DELETE |

운영 환경 변수·키 발급은 이 문서 범위가 아니다. 시크릿을 커밋하거나 문서에 적지 않는다.

## 3. 툴 결과 봉투 (오류 코드)

인증을 통과한 `tools/call` 결과는 MCP 툴 결과로 온다. 실패 시 `isError: true`이고, `content[0].text`와 `structuredContent`에 같은 JSON이 담긴다.

성공 (`src/lib/server/mcp/errors.ts`, design §5-3):

```json
{
  "...": "툴별 필드 (TBD)",
  "warnings": [{ "rule": "R-VAL-R12", "field": "headline", "message": "..." }]
}
```

`warnings`는 있을 때만 포함한다.

실패:

```json
{
  "code": "VALIDATION",
  "errors": [{ "rule": "R-PERM-04", "field": "tool", "message": "..." }]
}
```

### `structuredContent.code` (`McpErrorCode`)

| 코드 | 쓰임 (main 코드 기준) |
|---|---|
| `VALIDATION` | 도메인·입력 검증 실패 |
| `FORBIDDEN_SCOPE` | 스코프 부족 또는 미등록 툴 (R-PERM-04). 툴 실행 직전 2차 게이트(`assertToolScope`)에서만 나온다 — 키 스코프 밖 툴은 그 키에 등록되지 않으므로 일반 클라이언트는 SDK의 JSON-RPC 오류 `-32602 Tool <이름> not found`(`structuredContent` 없음)를 받는다 |
| `NOT_FOUND` | 대상 없음 |
| `CONFLICT` | 충돌 |
| `RATE_LIMITED` | 툴 레벨 한도 (감사 결과는 `rate_limited`) |
| `PAYLOAD_TOO_LARGE` | 툴 레벨 페이로드 한도 (HTTP 413 `payload_too_large`와 별개 계층) |
| `INTERNAL` | 내부 오류. 기본 규칙 ID `R-SYS-05` |

감사 매핑: `FORBIDDEN_SCOPE` → `denied`, `RATE_LIMITED` → `rate_limited`, 그 외 → `error`.

## 4. 규칙 ID 표기

오류·경고 항목은 항상 다음 모양이다.

| 필드 | 필수 | 설명 |
|---|---|---|
| `rule` | 예 | 규칙 ID 문자열 |
| `field` | 아니오 | 관련 입력 필드 |
| `message` | 예 | 사람이 읽는 설명 |

ID 형식: `R-<영역>-<번호>` (예: `R-VAL-R12`, `R-PERM-04`, `R-SYS-05`).

| 접두 | 영역 |
|---|---|
| `R-VAL-*` | 도메인 검증 (`domain/validation/rules.ts`) |
| `R-PERM-*` | 권한·스코프·소유권 (예: `R-PERM-04` 스코프 게이트, `R-PERM-03` 신원 불일치) |
| `R-SYS-*` | 시스템 (감사, 내부 오류 등) |

검증 규칙의 기본 레벨은 WARN일 수 있지만, 같은 ID가 강한 위반에서 ERROR를 낼 수 있다. 일반 API 키는 `strict` 모드, `import:all`은 `migration` 모드다.

문서·PR·티켓에서 규칙을 언급할 때는 이 ID를 그대로 쓰고, 의미만 풀어 쓰지 않는다. 예: `R-PERM-04`(툴 `whoami`는 스코프 `read` 필요).

## 5. 툴 목록

### 5.1 main에 등록된 연결 확인 툴

`registerAllMcpTools` → `registerReadTools` 등으로 등록한다. 예전 스파이크 전용 `echo` / `db_ping`은 제거되었다. `SPIKE_TOOL_NAMES`는 deprecated이며 `['whoami']`만 남는다.

| 툴 | 스코프 | 설명 | 입력 | 비고 |
|---|---|---|---|---|
| `whoami` | `read` | 인증된 봇 이름·스코프·서버 시각 | 없음 | `TOOL_REQUIRED_SCOPE`에 포함 |

`TOOL_REQUIRED_SCOPE`에 없는 툴 이름은 `assertToolScope` 기준 `FORBIDDEN_SCOPE`(미등록, required=`(unregistered)`)가 된다. 다만 HTTP로 호출할 때 키 스코프 밖·없는 툴 이름은 등록 단계에서 이미 빠지므로 SDK가 `-32602 Tool <이름> not found`로 먼저 거절한다(§3 표 참고).

### 5.2 툴–스코프 표 (스키마 TBD)

아래 이름·필요 스코프는 `src/lib/server/mcp/scopes.ts`의 `TOOL_REQUIRED_SCOPE`를 옮긴 것이다. 입력·출력 스키마 칸은 TBD.

센티널: `reports:*` / `events:*`는 키가 쥐는 실제 스코프 문자열이 아니라, `TOOL_ANY_OF_SCOPES`의 해당 목록 중 하나(또는 `import:all`)면 통과한다는 뜻이다.

| 툴 | 필요 스코프 | 티켓 (참고) | 스키마 |
|---|---|---|---|
| `whoami` | `read` | — | TBD |
| `get_dashboard_context` | `read` | BE-06 | TBD |
| `get_report` | `read` | BE-07 | TBD |
| `list_reports` | `read` | BE-07 | TBD |
| `search` | `read` | BE-06 | TBD |
| `list_instruments` | `read` | BE-06 | TBD |
| `list_positions` | `read` | BE-06 | TBD |
| `list_proposals` | `read` | BE-06 | TBD |
| `list_journal_entries` | `read` | BE-09 | TBD |
| `list_decisions` | `read` | BE-10 | TBD |
| `list_events` | `read` | BE-10 | TBD |
| `list_principle_proposals` | `principles:propose` | BE-17 | TBD |
| `upsert_report` | `reports:*` (any of report write scopes) | BE-07 | TBD |
| `archive_report` | `reports:*` (any of report write scopes) | BE-07 | TBD |
| `upsert_instrument` | `instruments:write` (또는 `instruments:enrich`) | — | TBD |
| `propose_position_change` | `positions:propose` | BE-08 | TBD |
| `cancel_proposal` | `positions:propose` | BE-08 | TBD |
| `create_planned_position` | `positions:annotate` | BE-08 | TBD |
| `update_position_reference` | `positions:annotate` | BE-08 | TBD |
| `propose_principle_change` | `principles:propose` | BE-17 | TBD |
| `cancel_principle_proposal` | `principles:propose` | BE-17 | TBD |
| `add_journal_entry` | `journal:write` | BE-09 | TBD |
| `update_journal_entry` | `journal:write` | BE-09 | TBD |
| `archive_journal_entry` | `journal:write` | BE-09 | TBD |
| `record_price_snapshots` | `prices:write` | — | TBD |
| `record_portfolio_snapshot` | `portfolio:snapshot` | — | TBD |
| `record_market_indicators` | `indicators:write` | — | TBD |
| `submit_daily_market_feed` | `market:feed` (전용, `import:all`로 안 열림) | 일일 시세 피드 | `docs/mcp-tools.generated.md` |
| `upsert_decision` | `decisions:write` | — | TBD |
| `archive_decision` | `decisions:write` | — | TBD |
| `upsert_event` | `events:*` (any of `events:stock`/`macro`/`realestate`) | — | TBD |
| `archive_event` | `events:*` (any of `events:stock`/`macro`/`realestate`) | — | TBD |

`import:all`로 열리지 **않는** 제안 큐 툴(`PROPOSAL_TOOLS`): `propose_position_change`, `cancel_proposal`, `propose_principle_change`, `cancel_principle_proposal`, `list_principle_proposals`. 일일 시세 피드 `submit_daily_market_feed`(`FEED_TOOLS`)도 `import:all`로 열리지 않는다. 그 외 등록 툴은 `import:all`이 필요 스코프를 대신할 수 있다.

### `submit_daily_market_feed`

- 스코프: `market:feed`만. 기본 프로필 어디에도 없다 — 피드 키는 scopes `["market:feed"]` 하나로 발급한다.
- 설명: finance-manager-boot가 평일 브리핑 직후 하루치 종가·지표·수급을 보낸다. `dry_run`(필수)이 `true`면 검증과 바뀔 내용(`would_insert`/`would_update`/`unchanged`/`rejected`/`warnings`)만 돌려주고 아무것도 쓰지 않는다. `false`면 거부가 0건일 때만 쓰고, 하나라도 있으면 `VALIDATION`으로 거절하며 아무것도 쓰지 않는다.
- 서버 게이트(`R-FEED-01`~`R-FEED-14`): strict 입력(모르는 키 거부)·ISO 실제 날짜, `feed_date`=오늘/어제(KST)·주말 거부, 시장별 기대 `as_of`(KR=feed_date, 미국·vix=직전 NYSE 거래일, ust10y=직전 SIFMA 거래일)와 휴장 달력(`marketCalendar.ts`, 2026–2027, 범위 밖은 dry_run만), 허용 8종목·기대 종목 중 최대 1개 결측, 직전 종가 대비 KRX ±30%·미국 ±50%, 직전 거래일 행이 있으면 등락률 0.3%p 교차 확인, 지표 범위(usdkrw는 `basis:"seoul_1530"` 필수·전일 ±25원), 수급 5종목(단위 주, 기존 가격 행의 수급 칸만, 확정→잠정 덮어쓰기 거부), 기존 행 source가 `notion:daily-brief`/`fm:daily-feed`일 때만 덮어씀, 정정은 직전 거래일 행만·feed_date당 1회(이전 값은 `extra.prev`), 같은 `feed_id`+다른 값 거부.
- 서버가 정하는 값: owner(키), `instrument_id`, `currency`, `source='fm:daily-feed'`, `extra`, `source_bot_id`(트리거). 삭제 기능 없음.
- 잠금(사전리뷰 M1·M2): 지난 `feed_date`(어제)를 다른 `feed_id`로 일반 행으로 다시 보내 값을 바꾸면 `R-FEED-13`으로 거부 — 지난 날짜는 `corrections`(날짜당 1회)로만 바꾼다(백필 행을 처음 덮는 첫 피드는 허용). 지표는 `market_indicators`에 컬럼이 없어 **가격 행 `extra.feed_inds`**(`{feed_id, k:"key|as_of", v}`, 최대 12개, 재작성 때 이어받음)에 이번 호출이 쓴 지표 값을 찍어 잠근다: 같은 `feed_id`로 다른 값 → `R-FEED-14`, 지난 날짜 재작성 → `R-FEED-13`. 한계: 스탬프는 가격 행당 최근 12개만 이어받고, 45일 조회 창 밖이거나 해당 가격 행이 없으면 잠금 기록도 없다(그때는 범위·전일 대비 게이트만 적용). 지표를 쓰는 호출은 가격 행이 변경 없음이어도 그 행에 스탬프를 다시 쓴다.
- 기준값(M3): 정정은 먼저 평가해 오늘 행의 급변·등락률 검사가 **정정 후 값**을 기준으로 한다(같은 호출 포함).
- 기준 종가 없음(L3): 45일 안에 직전 종가가 없는 종목의 **일반 가격 행**은 그 종목만 건너뛴다(`R-FEED-26` 경고 + `skipped`에 `prices[i]`, dry_run도 동일, 같은 호출의 나머지는 정상 진행). 건너뛴 종목은 coverage(`R-FEED-06`, 최대 1종목 누락)에서 누락으로 센다. 정정(`corrections`)은 기준이 없으면 조용히 건너뛰지 않고 `R-FEED-07`로 호출 전체를 거부한다. 신규 종목의 첫 행은 **수동 시드**(피드로 만들지 않는다). 수치는 종가 ≤1e9, 소수 자릿수는 문자열 기준으로 정확히 검사.
- change_pct(L2): 가격 항목은 필수. 지표는 생략하면 직전 세션 값이 있을 때 서버가 계산해 기록하고(`change_pct_computed`), 계산할 수 없으면 명시적 NULL + `R-FEED-25` 경고. 배치에서 조용히 NULL이 되지 않도록 항상 `change_pct`를 보낸다.
- 감사(L6): `R-FEED-31` **쓰기 전** 감사 행(도구명 `submit_daily_market_feed:intent`, 짧은 의도 표시만)을 먼저 저장한다. 바뀔 행의 이전 값(source·source_bot_id·flows·extra, 최대 40건 + 초과 시 "truncated")은 쓰기 전에 저장된 `:intent` 행에만 두고, 결과·오류 행에는 `:intent` 행을 가리키는 한 줄만 둔다(이중 저장 없음). 성공 호출에서는 `R-FEED-30`·`R-FEED-31`을 `rule_ids`에 넣지 않아 규칙 통계와 "경고 있음" 필터에 잡히지 않는다. 저장에 실패하면 데이터를 쓰지 않고 `INTERNAL` + `R-FEED-32`(알림 로그 `mcp_audit_alert`). 쓰기 도중 실패하면 `R-FEED-33`(진행 상황, 같은 `feed_id` 재전송으로 완결)과 `:intent` 행을 가리키는 오류 감사 행. 쓴 뒤 최종 감사 행이 실패하면 성공이 아니라 `R-FEED-32` 오류를 돌려주고(데이터는 이미 기록됨, 같은 `feed_id` 재전송은 변경 없음) 알림을 남긴다. 응답에는 감사 항목이 나오지 않는다.
- 동시성(L1·L-a): 가격 행 갱신은 읽은 값(close·source·수급·`extra`)이 그대로일 때만 적용(compare-and-set; `extra`는 PostgREST `eq`로 **엄격한 jsonb 동치** — 배열 순서·중복이 달라도 다른 값)하고, 바뀌었거나 중복 키(23505)면 `CONFLICT` + `R-FEED-34`로 돌려준다. 쓰기 순서는 ① 오늘 행(마커·지표 stamp 포함, 갱신→삽입) → ② 정정 갱신 → ③ 지표 upsert 라서, 동시에 들어온 다른 `feed_id`/다른 값의 호출은 오늘 행 삽입(중복 키) 또는 CAS에서 먼저 실패해 정정·지표를 건드리지 못한다(CONFLICT 난 호출의 정정은 적용되지 않음). **계약: 피드 호출은 한 번에 하나만, 재시도는 이전 응답을 받은 뒤 순차로(병렬 금지).** 이 문장은 봇이 보는 도구 설명에도 있다. 남는 한계: 한 호출 전체가 하나의 트랜잭션이 아니고, 지표 upsert 자체에는 CAS가 없으며(오늘 행 stamp가 CAS로 보호), 순서 보장은 같은 오늘 행을 건드릴 때만 성립한다. 근본 해결은 `market_indicators.feed_id` 컬럼 + 트랜잭션 RPC(마이그레이션)이며 **보류** 중이다(신규 종목 첫 행 시드도 수동 유지).
- 빠진 날짜 메우기(L5): `feed_date`는 오늘/어제만이라 놓친 날은 피드로 채울 수 없다(범위 밖; 결정: 허용하지 않음, 별도 수동 적재 또는 PM 결정). 빈 날짜 때문에 거부되면(오래된 `feed_date`·정정/수급 대상 행 없음·기준 종가 없음) 오류에 `R-FEED-27`(`missing_dates`)로 **빠진 거래일 목록**을 명시하고, 통과한 응답과 dry_run에도 `missing_dates` 배열(기준 종가가 갭이면 `R-FEED-22` 경고 문구에도 날짜)이 나온다.
- 키 발급: 설정 화면 '직접 켜야 하는 권한'에서 체크해야만 켜진다(기본·사전 선택 없음, 재무 관리 봇만). `market:feed`는 **단독 scope**로만 발급된다 — `read`를 포함한 다른 scope와 함께 보내면 서버가 거부하고(`R-PERM-10`), 화면도 켜면 나머지를 끈다. 서버는 알 수 없는 scope·다른 프로필의 `market:feed`·중복 scope(합쳐서 한 번만 저장)를 처리한다.
- `record_price_snapshots`·`record_market_indicators`는 다른 `owner_id`를 조용히 버리지 않고 `R-PERM-03`으로 거부한다(L4).
- 입력·출력 스키마: `docs/mcp-tools.generated.md`.

각 툴 절은 스키마를 채울 때 다음 형식으로 적는다.

```markdown
### `tool_name`

- 스코프:
- 설명:
- 이렇게 말하면 → 이 툴 호출: (예시 질의)
- 입력 스키마:
- 출력 스키마:
- 관련 규칙 ID:
```

## 6. 관련 코드

- `src/routes/api/mcp/+server.ts` — HTTP 게이트
- `src/hooks.server.ts` — MCP 경로 Auth 헤더 선검사(POST만)
- `src/lib/server/mcp/auth.ts` — Bearer 파싱·env/db 인증
- `src/lib/server/mcp/handler.ts` — MCP 서버
- `src/lib/server/mcp/errors.ts`, `types.ts` — 오류 봉투·코드
- `src/lib/server/mcp/scopes.ts` — 툴–스코프 표
- `src/lib/server/mcp/tools/index.ts` — `registerAllMcpTools`
- `src/lib/server/domain/validation/rules.ts` — `R-VAL-*`
