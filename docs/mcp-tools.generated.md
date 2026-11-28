# MCP tools reference

> **Generated file — do not edit by hand.**
>
> Regenerate: `pnpm docs:mcp-tools`
>
> Source: live zod `inputSchema` shapes registered by `registerAllMcpTools`,
> converted with `z.toJSONSchema`. Drift is gated by
> `src/lib/server/mcp/generate-mcp-tools-docs.spec.ts`.

## Operator connection guide

Assembled from `src/routes/api/mcp/+server.ts`, `src/lib/server/mcp/auth.ts`,
`handler.ts`, `errors.ts`, `scopes.ts`, and `types.ts`. Do not treat this as a
separate contract — if code and this section disagree, code wins; regenerate.

### Endpoint

- Production: `POST https://mo-wa.pages.dev/api/mcp`
- Transport: MCP **Streamable HTTP**, **stateless** (new server + transport per request;
  `sessionIdGenerator: undefined`, `enableJsonResponse: true` in `handler.ts`)
- Allowed HTTP method: **POST only** (`GET` / `DELETE` → `405` with `Allow: POST`)
- Max body: `1500000` bytes (`content-length`); over → `413` `payload_too_large`
- Browser `Origin` (when present) must match `https://([a-z0-9-]+.)?mo-wa.pages.dev`; else `403` `origin_not_allowed`

### Bearer authentication

- Header: `Authorization: Bearer <key>`
- Key format (from `auth.ts`): `mowa_<prefix10 [a-z0-9]>_<secret43 base64url>`
  - prefix: 10 chars `[a-z0-9]`
  - secret: 43 chars base64url (`[A-Za-z0-9_-]`)
- Client header `x-mowa-bot-id` is **never** read; identity comes only from the authenticated key

### HTTP auth / gate responses

| Status | When | Headers / body |
| --- | --- | --- |
| `401` | POST without an `Authorization` header (`hooks.server.ts`, before the handler) | `WWW-Authenticate: Bearer realm="mo-wa-mcp"`; JSON `{ "error": "Unauthorized" }` |
| `401` | malformed key (`missing_or_malformed_key`), or invalid key (`invalid_key`) | `WWW-Authenticate: Bearer realm="mo-wa-mcp"`; JSON `{ "error": "<reason>" }` |
| `429` | DB auth `allowed=false` (rate limited) | `Retry-After: <seconds>` (from `retry_after_s`, default 60); JSON `{ "error": "rate_limited" }` |
| `500` | misconfigured pepper/mode or auth backend error | JSON `{ "error": "server_misconfigured" }` or `auth_backend_error` |
| `413` | body too large | `{ "error": "payload_too_large" }` |
| `403` | disallowed Origin | `{ "error": "origin_not_allowed" }` |

### Tool result envelopes

Success (`errors.ts` `mcpSuccess`): `content` text JSON + `structuredContent` (optional `warnings: McpRuleIssue[]`).

Error (`mcpError` / `isError: true`):

```json
{
  "isError": true,
  "structuredContent": {
    "code": "VALIDATION",
    "errors": [
      {
        "rule": "R-…",
        "field": "optional",
        "message": "…"
      }
    ]
  }
}
```

Tool error `code` values (`McpErrorCode`): `VALIDATION`, `FORBIDDEN_SCOPE`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL`.

Notable gate rule IDs from `errors.ts` / `tool-gate.ts` / `scopes.ts`:

- `R-PERM-04` — tool out of scope or unknown (`forbiddenScopeError` / `assertToolScope`). This is the second gate inside the audited call; a normal client never reaches it: tools outside the key's scopes are not registered for that key, so calling one returns the SDK JSON-RPC error `-32602 Tool <name> not found` with no `structuredContent` (no `FORBIDDEN_SCOPE` / R-PERM-04 envelope)
- `R-PERM-03` — identity mismatch (audit / tool-gate)
- `R-SYS-05` — internal error envelope (`internalError`)

### Scopes (summary)

- Tool → required scope: `TOOL_REQUIRED_SCOPE` in `scopes.ts` (sentinels `reports:*` / `events:*` mean any-of write scopes).
- `import:all` unlocks non-proposal tools (`importAllUnlocksTool`); proposal tools stay finance-manager propose scopes only:
  `cancel_principle_proposal`, `cancel_proposal`, `list_principle_proposals`, `propose_position_change`, `propose_principle_change`
- `import:all` also does not unlock the daily feed (`FEED_TOOLS`, scope `market:feed` only): `submit_daily_market_feed`
- Report kind → write scope (`REPORT_KIND_TO_SCOPE`):

  - `daily_brief` → `reports:daily_brief`
  - `weekly_report` → `reports:weekly_report`
  - `strategy` → `reports:strategy`
  - `equity_analysis` → `reports:equity_analysis`
  - `buy_plan` → `reports:buy_plan_draft`
  - `realestate_brief` → `reports:realestate_brief`
  - `realestate_analysis` → `reports:realestate_analysis`

- Report write scope list: `reports:daily_brief`, `reports:weekly_report`, `reports:strategy`, `reports:equity_analysis`, `reports:buy_plan_draft`, `reports:realestate_brief`, `reports:realestate_analysis`

## Tools

Registered tools: **32** (must match `ALL_MCP_TOOL_NAMES`).

### `add_journal_entry`

- **Title:** Add journal entry
- **Source:** `src/lib/server/mcp/tools/journal.ts`
- **Required scope:** `journal:write`
- **Annotations:** destructiveHint=false, idempotentHint=true

매매일지/메모를 추가한다. kind=buy|sell은 instrument(또는 ticker), price, qty, currency 필수. client_ref가 같으면 재시도로 간주해 created:false로 기존 행을 돌려준다(내용이 다르면 CONFLICT). buy/sell 기록은 포지션을 바꾸지 않는다 — 수량/평단 변경은 propose_position_change로 제안해야 한다(R-PERM-02 WARN).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "entry_date": {
      "type": "string",
      "description": "YYYY-MM-DD"
    },
    "kind": {
      "type": "string",
      "enum": [
        "buy",
        "sell",
        "thought",
        "plan",
        "review"
      ]
    },
    "state": {
      "type": "string",
      "enum": [
        "pending",
        "done",
        "hold",
        "closed"
      ]
    },
    "title": {
      "type": "string",
      "description": "1–200자"
    },
    "client_ref": {
      "description": "멱등 키 (1–120자, 소유자 내 유일)",
      "type": "string"
    },
    "instrument_id": {
      "description": "instrument uuid (buy/sell 필수)",
      "type": [
        "string",
        "null"
      ]
    },
    "ticker": {
      "description": "instrument_id 대신 종목 코드로 지정 (instruments에 존재해야 함)",
      "type": "string"
    },
    "tickers": {
      "description": "다종목 연결 코드 목록 — 모두 instruments에 존재해야 함 (최대 30)",
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "tags": {
      "description": "저장되지 않음. 종목 코드가 섞여 있으면 R-VAL-J08 WARN만 반환",
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "price": {
      "description": "체결가/관측 종가 (>0, currency 필요)",
      "type": [
        "number",
        "null"
      ]
    },
    "qty": {
      "description": "수량 (>0)",
      "type": [
        "number",
        "null"
      ]
    },
    "avg_price": {
      "type": [
        "number",
        "null"
      ]
    },
    "breakeven": {
      "type": [
        "number",
        "null"
      ]
    },
    "currency": {
      "anyOf": [
        {
          "type": "string",
          "enum": [
            "KRW",
            "USD"
          ]
        },
        {
          "type": "null"
        }
      ]
    },
    "source_url": {
      "type": [
        "string",
        "null"
      ]
    },
    "memo_md": {
      "type": [
        "string",
        "null"
      ]
    },
    "report_id": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "entry_date",
    "kind",
    "state",
    "title"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-01`, `R-PERM-02`, `R-PERM-11`, `R-SYS-01`

### `archive_decision`

- **Title:** Archive decision
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `decisions:write`

결정 대기 항목을 보관한다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `archive_event`

- **Title:** Archive event
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `events:*`
- **Any-of scopes:** `events:stock` | `events:macro` | `events:realestate`

일정을 보관한다(domain 스코프 필요).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `archive_journal_entry`

- **Title:** Archive journal entry
- **Source:** `src/lib/server/mcp/tools/journal.ts`
- **Required scope:** `journal:write`
- **Annotations:** destructiveHint=true, idempotentHint=true

자신(봇)이 작성한 일지를 보관 처리한다. 다른 봇/사용자 소유는 R-PERM-01로 거부.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "journal entry uuid"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-01`, `R-PERM-02`, `R-PERM-11`, `R-SYS-01`

### `archive_report`

- **Title:** Archive report
- **Source:** `src/lib/server/mcp/tools/reports.ts`
- **Required scope:** `reports:*`
- **Any-of scopes:** `reports:daily_brief` | `reports:weekly_report` | `reports:strategy` | `reports:equity_analysis` | `reports:buy_plan_draft` | `reports:realestate_brief` | `reports:realestate_analysis`
- **Annotations:** destructiveHint=true, idempotentHint=true

자신(봇)이 작성한 리포트를 보관 처리한다. 다른 봇/사용자 소유는 CONFLICT.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "report uuid"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-16`, `R-SYS-01`

### `cancel_principle_proposal`

- **Title:** Cancel own principle proposal
- **Source:** `src/lib/server/mcp/tools/principles.ts`
- **Required scope:** `principles:propose`
- **Annotations:** destructiveHint=false, idempotentHint=true

내가 올린 pending/on_hold 원칙 제안을 취소한다(proposal_id 또는 display_id R-xxxx). 타 봇·사용자 제안은 취소 불가(R-VAL-P14).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "proposal_id": {
      "type": "string"
    },
    "display_id": {
      "description": "서버 표시 ID (예: R-0001)",
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-04`, `R-PERM-05`, `R-PERM-13`, `R-PERM-15`

### `cancel_proposal`

- **Title:** Cancel own position proposal
- **Source:** `src/lib/server/mcp/tools/portfolio.ts`
- **Required scope:** `positions:propose`
- **Annotations:** destructiveHint=false, idempotentHint=true

내가 올린 pending/on_hold 보유 제안을 취소한다(proposal_id 또는 display_id P-xxxx).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "proposal_id": {
      "type": "string"
    },
    "display_id": {
      "description": "서버 표시 ID (예: P-0412)",
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-FMT-13`, `R-PERM-05`, `R-PERM-13`, `R-PERM-17`

### `create_planned_position`

- **Title:** Create planned position
- **Source:** `src/lib/server/mcp/tools/portfolio.ts`
- **Required scope:** `positions:annotate`
- **Annotations:** destructiveHint=false, idempotentHint=false

관심/계획 포지션(status=planned, qty=0, avg_price=null)을 만든다. 수량·평단은 쓸 수 없다(R-VAL-P01).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "ticker": {
      "type": "string"
    },
    "instrument_id": {
      "type": "string"
    },
    "currency": {
      "type": "string",
      "description": "'KRW' | 'USD'"
    },
    "base_price": {
      "description": "기준가 (>0, null=삭제)",
      "type": [
        "number",
        "null"
      ]
    },
    "base_at": {
      "description": "기준 시각 ISO8601",
      "type": [
        "string",
        "null"
      ]
    },
    "memo": {
      "type": [
        "string",
        "null"
      ]
    },
    "trigger_price": {
      "description": "트리거 가격 (finance-manager만, watch_only=true면 null)",
      "type": [
        "number",
        "null"
      ]
    },
    "trigger_direction": {
      "description": "'below' | 'above' — 생략하면 기존 값 유지(신규는 below)",
      "type": "string"
    },
    "breakeven": {
      "type": [
        "number",
        "null"
      ]
    },
    "watch_only": {
      "description": "관찰 전용 (finance-manager만)",
      "type": "boolean"
    },
    "qty": {
      "description": "금지 — 보내면 R-VAL-P01 ERROR (propose_position_change 사용)"
    },
    "avg_price": {
      "description": "금지 — 보내면 R-VAL-P01 ERROR (propose_position_change 사용)"
    }
  },
  "required": [
    "currency"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-FMT-13`, `R-PERM-05`, `R-PERM-13`, `R-PERM-17`

### `get_dashboard_context`

- **Title:** Dashboard context
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

대시보드 요약: 최신 리포트, 승인된 보유 종목, 대기 중 제안(pending/on_hold), 열린 의사결정, 향후 14일 이벤트.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `get_report`

- **Title:** Get report
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

id로 리포트 1건을 조회한다. include_body=false면 본문을 제외한다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
      "description": "report id (uuid)"
    },
    "include_body": {
      "default": true,
      "description": "본문(body_md) 포함 여부 (기본 true)",
      "type": "boolean"
    }
  },
  "required": [
    "id",
    "include_body"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_decisions`

- **Title:** List decisions
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

의사결정 목록(마감일순).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "open",
        "decided",
        "dropped"
      ]
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_events`

- **Title:** List events
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

일정/이벤트 목록(날짜 오름차순). from/to 모두 없으면 오늘(KST)부터.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "from": {
      "description": "event_date >= from (from/to 모두 없으면 오늘(KST)부터)",
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "to": {
      "description": "event_date <= to",
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "domain": {
      "type": "string",
      "enum": [
        "stock",
        "realestate",
        "macro"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "scheduled",
        "tentative",
        "done",
        "cancelled"
      ]
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_instruments`

- **Title:** List instruments
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

종목 마스터 목록. 보관된 종목은 기본 제외.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "asset_type": {
      "type": "string",
      "enum": [
        "stock",
        "etf",
        "bond",
        "cash"
      ]
    },
    "market": {
      "type": "string",
      "minLength": 1
    },
    "watchlist_only": {
      "default": false,
      "type": "boolean"
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "watchlist_only",
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_journal_entries`

- **Title:** List journal entries
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

매매일지 목록(최신순). 메모 본문은 include_body=true일 때만.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "buy",
        "sell",
        "thought",
        "plan",
        "review"
      ]
    },
    "state": {
      "type": "string",
      "enum": [
        "pending",
        "done",
        "hold",
        "closed"
      ]
    },
    "ticker": {
      "description": "tickers[] 포함 필터",
      "type": "string",
      "minLength": 1
    },
    "from": {
      "description": "entry_date >= from",
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "to": {
      "description": "entry_date <= to",
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "include_body": {
      "default": false,
      "description": "메모(memo_md) 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "include_body",
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_positions`

- **Title:** List positions
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

포지션 목록(승인된 수량·평단 등). 대기 중 제안은 pending_proposals[]로만 첨부되며 포지션 값에 합쳐지지 않는다(R-PERM-13).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "holding",
        "planned",
        "closed"
      ]
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_principle_proposals`

- **Title:** List principle proposals
- **Source:** `src/lib/server/mcp/tools/principles.ts`
- **Required scope:** `principles:propose`
- **Annotations:** readOnlyHint=true, idempotentHint=true

원칙 변경 제안 목록(finance-manager + principles:propose). 기본은 pending+on_hold.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "default": "active",
      "description": "상태 필터. 'active'=pending+on_hold (기본), 'all'=전체",
      "type": "string",
      "enum": [
        "pending",
        "on_hold",
        "approved",
        "rejected",
        "superseded",
        "cancelled",
        "expired",
        "conflict",
        "active",
        "all"
      ]
    },
    "limit": {
      "default": 50,
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "status",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-04`, `R-PERM-05`, `R-PERM-13`, `R-PERM-15`

### `list_proposals`

- **Title:** List position proposals
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

포지션 변경 제안 목록. 기본은 pending+on_hold.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "default": "active",
      "description": "상태 필터. 'active'=pending+on_hold (기본), 'all'=전체",
      "type": "string",
      "enum": [
        "pending",
        "on_hold",
        "approved",
        "rejected",
        "superseded",
        "cancelled",
        "expired",
        "conflict",
        "active",
        "all"
      ]
    },
    "position_id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "status",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `list_reports`

- **Title:** List reports
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

리포트 목록(headline·summary 포함, 본문 제외가 기본). 보관된 리포트는 기본 제외. 최신순.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "kind": {
      "description": "report kind 필터",
      "type": "string",
      "enum": [
        "daily_brief",
        "weekly_report",
        "equity_analysis",
        "realestate_brief",
        "realestate_analysis",
        "strategy",
        "principles"
      ]
    },
    "domain": {
      "type": "string",
      "enum": [
        "macro",
        "stock",
        "realestate"
      ]
    },
    "ticker": {
      "description": "tickers[] 포함 필터",
      "type": "string",
      "minLength": 1
    },
    "from": {
      "description": "report_date >= from",
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "to": {
      "description": "report_date <= to",
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "include_body": {
      "default": false,
      "description": "본문(body_md) 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "include_body",
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `propose_position_change`

- **Title:** Propose position change
- **Source:** `src/lib/server/mcp/tools/portfolio.ts`
- **Required scope:** `positions:propose`
- **Annotations:** destructiveHint=false, idempotentHint=false

보유 변경(open_holding | set_qty_avg | close)을 승인 큐에 올린다. 트리거·손익분기·관찰전용은 제안 불가(update_position_reference). evidence 1건 이상 필수.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "change_type": {
      "type": "string",
      "description": "'open_holding' | 'set_qty_avg' | 'close'"
    },
    "position_id": {
      "type": "string"
    },
    "ticker": {
      "type": "string"
    },
    "instrument_id": {
      "type": "string"
    },
    "proposed_values": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {},
      "description": "open_holding: {qty, avg_price, currency?}; set_qty_avg: {qty?, avg_price?}; close: {}"
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      },
      "description": "[{report_id?, journal_entry_id?, note?}] 최소 1건"
    },
    "reason_md": {
      "type": "string"
    },
    "calc_note": {
      "description": "한 줄 ≤200자 계산 근거 (open_holding/set_qty_avg 권장)",
      "type": "string"
    },
    "client_ref": {
      "type": "string"
    }
  },
  "required": [
    "change_type",
    "proposed_values",
    "evidence"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-FMT-13`, `R-PERM-05`, `R-PERM-13`, `R-PERM-17`

### `propose_principle_change`

- **Title:** Propose principle change
- **Source:** `src/lib/server/mcp/tools/principles.ts`
- **Required scope:** `principles:propose`
- **Annotations:** destructiveHint=false, idempotentHint=false

원칙 개정 제안을 큐에 올린다(finance-manager + principles:propose). 승인 전 principles 직접 쓰기 금지. 제안 주체는 서버가 채운다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "principle_id": {
      "type": "string",
      "description": "대상 principles 리포트 id (현재 유효본)"
    },
    "proposed_body_md": {
      "type": "string",
      "description": "제안 본문 전체 (새 원칙 문구)"
    },
    "reason_md": {
      "type": "string",
      "description": "변경 사유"
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      },
      "description": "근거 1건 이상 [{report_id?, journal_entry_id?, user_statement?, url?, …}]"
    },
    "clause_ref": {
      "description": "선택: 주로 바뀌는 조항 (예: '3-2 손절')",
      "type": "string"
    },
    "client_ref": {
      "type": "string"
    },
    "proposed_by_type": {
      "type": "string"
    },
    "proposed_by": {
      "type": "string"
    },
    "proposed_by_user": {
      "type": "string"
    },
    "proposed_by_bot_id": {
      "type": "string"
    },
    "proposed_by_user_id": {
      "type": "string"
    }
  },
  "required": [
    "principle_id",
    "proposed_body_md",
    "reason_md",
    "evidence"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-04`, `R-PERM-05`, `R-PERM-13`, `R-PERM-15`

### `record_market_indicators`

- **Title:** Record market indicators
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `indicators:write`

시장 지표 배치(≤500). 등록 키만, 필드 허용 목록(key·as_of ISO·value·change·change_pct·source)과 키별 기본 범위(R-VAL-I03). source 'fm:daily-feed'는 피드 전용.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "rows": {
      "type": "array",
      "items": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "rows"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `record_portfolio_snapshot`

- **Title:** Record portfolio snapshot
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `portfolio:snapshot`

포트폴리오 스냅샷(weights/plan_distances = G-9 zod).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "as_of": {
      "type": "string"
    },
    "total_value": {
      "type": [
        "number",
        "null"
      ]
    },
    "currency": {
      "type": "string",
      "enum": [
        "KRW",
        "USD"
      ]
    },
    "weights": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "plan_distances": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    }
  },
  "required": [
    "as_of"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `record_price_snapshots`

- **Title:** Record price snapshots
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `prices:write`

시세 스냅샷 배치(≤500). 행 필드 허용 목록만(instrument_id UUID·as_of ISO 실제 날짜·close>0·currency KRW|USD·change_pct·volume·foreign_net_buy·inst_net_buy·source·extra ≤4KB). id·owner_id·source_bot_id·created_at·모르는 키는 거부, source 'fm:daily-feed'는 피드 전용(R-VAL-I02).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "rows": {
      "type": "array",
      "items": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "rows"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `search`

- **Title:** Search reports
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

리포트 title/headline/summary 대소문자 무시 검색(모든 검색어 포함). 본문은 반환하지 않는다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "q": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "검색어 (공백 구분, 모두 포함, 대소문자 무시)"
    },
    "kind": {
      "type": "string",
      "enum": [
        "daily_brief",
        "weekly_report",
        "equity_analysis",
        "realestate_brief",
        "realestate_analysis",
        "strategy",
        "principles"
      ]
    },
    "include_archived": {
      "default": false,
      "description": "보관(archived)된 행 포함 여부 (기본 false)",
      "type": "boolean"
    },
    "limit": {
      "default": 50,
      "description": "최대 반환 개수 (기본 50, 최대 200)",
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "q",
    "include_archived",
    "limit"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

### `submit_daily_market_feed`

- **Title:** Submit daily market feed
- **Source:** `src/lib/server/mcp/tools/feed.ts`
- **Required scope:** `market:feed`
- **Annotations:** idempotentHint=true, destructiveHint=false

일일 시세 피드 1건(scope market:feed 전용). 한 번에 하나만 호출하고, 재시도는 이전 응답을 받은 뒤 같은 feed_id로 순차 진행한다(병렬 금지). dry_run 필수: true면 검증과 바뀔 내용만 돌려주고 쓰지 않는다. 서버 게이트(R-FEED-01~14): strict 입력·ISO 날짜, feed_date=오늘/어제(KST)·주말 거부, 시장별 기대 as_of와 휴장 달력(KRX·NYSE·SIFMA), 허용 8종목·기대 종목 중 최대 1개 결측, 급변(KRX ±30%·미국 ±50%)·등락률 교차 확인 0.3%p, 지표 범위·usdkrw 서울 15:30·전일 ±25원, 수급 5종목(주 단위, 기존 가격 행의 수급 칸만), 정정은 직전 거래일·feed_date당 1회, source=fm:daily-feed 고정, 삭제 없음. 직전 종가가 없는 종목·지난 feed_date 재전송(다른 feed_id)은 거부(정정은 corrections로 1회). 같은 feed_id는 지표 포함 값 변경 불가. 감사 기록(쓰기 전 이전 값 포함)을 못 남기면 쓰지 않고 오류. 거부가 하나라도 있으면 아무것도 쓰지 않는다(live는 VALIDATION). 소유자는 키에서만 정한다(R-PERM-03). 키마다 첫 5거래일(KRX·NYSE·SIFMA 모두 개장일, 키 생성일 KST부터)은 dry_run만 허용하고 live는 R-FEED-40으로 거부한다(키 나이를 못 읽으면 R-FEED-41).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "feed_date": {
      "type": "string",
      "maxLength": 10
    },
    "feed_id": {
      "type": "string",
      "maxLength": 16,
      "pattern": "^fm-\\d{8}-[1-9]$"
    },
    "dry_run": {
      "type": "boolean"
    },
    "prices": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "ticker": {
            "type": "string",
            "minLength": 1,
            "maxLength": 12,
            "pattern": "^[A-Z0-9]{1,12}$"
          },
          "as_of": {
            "type": "string",
            "maxLength": 10
          },
          "close": {
            "type": "number",
            "exclusiveMinimum": 0,
            "maximum": 1000000000
          },
          "change_pct": {
            "type": "number",
            "minimum": -35,
            "maximum": 35
          }
        },
        "required": [
          "ticker",
          "as_of",
          "close",
          "change_pct"
        ],
        "additionalProperties": false
      }
    },
    "indicators": {
      "maxItems": 10,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string",
            "enum": [
              "kospi",
              "kosdaq",
              "usdkrw",
              "ust10y",
              "vix"
            ]
          },
          "as_of": {
            "type": "string",
            "maxLength": 10
          },
          "value": {
            "type": "number",
            "minimum": -1000000,
            "maximum": 1000000
          },
          "change_pct": {
            "type": "number",
            "minimum": -35,
            "maximum": 35
          },
          "basis": {
            "type": "string",
            "const": "seoul_1530"
          }
        },
        "required": [
          "key",
          "as_of",
          "value"
        ],
        "additionalProperties": false
      }
    },
    "flows": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "ticker": {
            "type": "string",
            "minLength": 1,
            "maxLength": 12,
            "pattern": "^[A-Z0-9]{1,12}$"
          },
          "base_date": {
            "type": "string",
            "maxLength": 10
          },
          "foreign_shares": {
            "type": "integer",
            "minimum": -1000000000,
            "maximum": 1000000000
          },
          "inst_shares": {
            "type": "integer",
            "minimum": -1000000000,
            "maximum": 1000000000
          },
          "status": {
            "type": "string",
            "enum": [
              "confirmed",
              "provisional"
            ]
          },
          "src": {
            "type": "string",
            "minLength": 1,
            "maxLength": 32,
            "pattern": "^[A-Za-z0-9_.:-]+$"
          }
        },
        "required": [
          "ticker",
          "base_date",
          "foreign_shares",
          "inst_shares",
          "status",
          "src"
        ],
        "additionalProperties": false
      }
    },
    "corrections": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "ticker": {
                "type": "string",
                "minLength": 1,
                "maxLength": 12,
                "pattern": "^[A-Z0-9]{1,12}$"
              },
              "as_of": {
                "type": "string",
                "maxLength": 10
              },
              "close": {
                "type": "number",
                "exclusiveMinimum": 0,
                "maximum": 1000000000
              },
              "change_pct": {
                "type": "number",
                "minimum": -35,
                "maximum": 35
              }
            },
            "required": [
              "ticker",
              "as_of",
              "close",
              "change_pct"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "enum": [
                  "kospi",
                  "kosdaq",
                  "usdkrw",
                  "ust10y",
                  "vix"
                ]
              },
              "as_of": {
                "type": "string",
                "maxLength": 10
              },
              "value": {
                "type": "number",
                "minimum": -1000000,
                "maximum": 1000000
              },
              "change_pct": {
                "type": "number",
                "minimum": -35,
                "maximum": 35
              },
              "basis": {
                "type": "string",
                "const": "seoul_1530"
              }
            },
            "required": [
              "key",
              "as_of",
              "value"
            ],
            "additionalProperties": false
          }
        ]
      }
    }
  },
  "required": [
    "feed_date",
    "feed_id",
    "dry_run"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-FEED-01`, `R-FEED-02`, `R-FEED-03`, `R-FEED-04`, `R-FEED-05`, `R-FEED-06`, `R-FEED-07`, `R-FEED-08`, `R-FEED-09`, `R-FEED-10`, `R-FEED-11`, `R-FEED-12`, `R-FEED-13`, `R-FEED-14`, `R-FEED-20`, `R-FEED-21`, `R-FEED-22`, `R-FEED-23`, `R-FEED-24`, `R-FEED-25`, `R-FEED-26`, `R-FEED-27`, `R-FEED-30`, `R-FEED-31`, `R-FEED-32`, `R-FEED-33`, `R-FEED-34`, `R-FEED-40`, `R-FEED-41`, `R-PERM-03`

### `update_journal_entry`

- **Title:** Update journal entry
- **Source:** `src/lib/server/mcp/tools/journal.ts`
- **Required scope:** `journal:write`
- **Annotations:** destructiveHint=false, idempotentHint=true

자신(봇)이 작성한 일지를 수정한다. patch에 바꿀 필드만 담는다. 다른 봇/사용자 소유는 R-PERM-01로 거부. client_ref는 변경할 수 없다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "journal entry uuid"
    },
    "patch": {
      "type": "object",
      "properties": {
        "entry_date": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "enum": [
            "buy",
            "sell",
            "thought",
            "plan",
            "review"
          ]
        },
        "state": {
          "type": "string",
          "enum": [
            "pending",
            "done",
            "hold",
            "closed"
          ]
        },
        "title": {
          "type": "string"
        },
        "instrument_id": {
          "description": "instrument uuid (buy/sell 필수)",
          "type": [
            "string",
            "null"
          ]
        },
        "ticker": {
          "description": "instrument_id 대신 종목 코드로 지정 (instruments에 존재해야 함)",
          "type": "string"
        },
        "tickers": {
          "description": "다종목 연결 코드 목록 — 모두 instruments에 존재해야 함 (최대 30)",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "tags": {
          "description": "저장되지 않음. 종목 코드가 섞여 있으면 R-VAL-J08 WARN만 반환",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "price": {
          "description": "체결가/관측 종가 (>0, currency 필요)",
          "type": [
            "number",
            "null"
          ]
        },
        "qty": {
          "description": "수량 (>0)",
          "type": [
            "number",
            "null"
          ]
        },
        "avg_price": {
          "type": [
            "number",
            "null"
          ]
        },
        "breakeven": {
          "type": [
            "number",
            "null"
          ]
        },
        "currency": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "KRW",
                "USD"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "source_url": {
          "type": [
            "string",
            "null"
          ]
        },
        "memo_md": {
          "type": [
            "string",
            "null"
          ]
        },
        "report_id": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "additionalProperties": false
    }
  },
  "required": [
    "id",
    "patch"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-01`, `R-PERM-02`, `R-PERM-11`, `R-SYS-01`

### `update_position_reference`

- **Title:** Update position reference fields
- **Source:** `src/lib/server/mcp/tools/portfolio.ts`
- **Required scope:** `positions:annotate`
- **Annotations:** destructiveHint=false, idempotentHint=true

포지션의 기준가·기준시각·메모·트리거·손익분기·관찰전용을 직접 갱신한다. qty/avg_price는 쓸 수 없다(R-VAL-P01).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "position_id": {
      "type": "string"
    },
    "base_price": {
      "description": "기준가 (>0, null=삭제)",
      "type": [
        "number",
        "null"
      ]
    },
    "base_at": {
      "description": "기준 시각 ISO8601",
      "type": [
        "string",
        "null"
      ]
    },
    "memo": {
      "type": [
        "string",
        "null"
      ]
    },
    "trigger_price": {
      "description": "트리거 가격 (finance-manager만, watch_only=true면 null)",
      "type": [
        "number",
        "null"
      ]
    },
    "trigger_direction": {
      "description": "'below' | 'above' — 생략하면 기존 값 유지(신규는 below)",
      "type": "string"
    },
    "breakeven": {
      "type": [
        "number",
        "null"
      ]
    },
    "watch_only": {
      "description": "관찰 전용 (finance-manager만)",
      "type": "boolean"
    },
    "qty": {
      "description": "금지 — 보내면 R-VAL-P01 ERROR (propose_position_change 사용)"
    },
    "avg_price": {
      "description": "금지 — 보내면 R-VAL-P01 ERROR (propose_position_change 사용)"
    }
  },
  "required": [
    "position_id"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-FMT-13`, `R-PERM-05`, `R-PERM-13`, `R-PERM-17`

### `upsert_decision`

- **Title:** Upsert decision
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `decisions:write`

결정 대기 항목을 추가한다(client_ref 멱등).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string"
    },
    "context_md": {
      "type": "string"
    },
    "options": {},
    "status": {
      "type": "string",
      "enum": [
        "open",
        "decided",
        "dropped"
      ]
    },
    "due_date": {
      "type": "string"
    },
    "instrument_id": {
      "type": "string"
    },
    "report_id": {
      "type": "string"
    },
    "client_ref": {
      "type": "string"
    }
  },
  "required": [
    "title"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `upsert_event`

- **Title:** Upsert event
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `events:*`
- **Any-of scopes:** `events:stock` | `events:macro` | `events:realestate`

일정을 추가한다. domain은 events:* 스코프와 일치해야 한다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "event_date": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "domain": {
      "type": "string",
      "enum": [
        "stock",
        "macro",
        "realestate"
      ]
    },
    "kind": {
      "type": "string"
    },
    "event_time": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "scheduled",
        "tentative",
        "done",
        "cancelled"
      ]
    },
    "link": {
      "type": "string"
    },
    "instrument_id": {
      "type": "string"
    },
    "client_ref": {
      "type": "string"
    },
    "meta": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    }
  },
  "required": [
    "event_date",
    "title",
    "domain",
    "kind"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `upsert_instrument`

- **Title:** Upsert instrument
- **Source:** `src/lib/server/mcp/tools/market.ts`
- **Required scope:** `instruments:write`
- **Any-of scopes:** `instruments:write` | `instruments:enrich`
- **Annotations:** idempotentHint=true

종목을 추가·갱신한다. instruments:write는 전체 필드, enrich는 name/sector·신규 추가만. KRX는 6자리 숫자. 별칭 입력은 거부하고 후보를 돌려준다(R-VAL-C05).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "ticker": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "market": {
      "type": "string"
    },
    "asset_type": {
      "type": "string",
      "enum": [
        "stock",
        "etf",
        "bond",
        "cash"
      ]
    },
    "sector": {
      "type": [
        "string",
        "null"
      ]
    },
    "is_watchlist": {
      "type": "boolean"
    },
    "aliases": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "ticker"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-03`, `R-PERM-04`, `R-SYS-01`

### `upsert_report`

- **Title:** Upsert report
- **Source:** `src/lib/server/mcp/tools/reports.ts`
- **Required scope:** `reports:*`
- **Any-of scopes:** `reports:daily_brief` | `reports:weekly_report` | `reports:strategy` | `reports:equity_analysis` | `reports:buy_plan_draft` | `reports:realestate_brief` | `reports:realestate_analysis`
- **Annotations:** destructiveHint=false, idempotentHint=true

리포트를 (kind, report_date, slug) 키로 작성/갱신한다. 같은 봇이 같은 키로 다시 쓰면 version+1, 다른 봇/사용자 소유 키는 CONFLICT. body_blocks/toc는 서버가 생성하므로 보내도 무시된다. 본문에 면책 문구(투자 권유 아님 등) 필수, sources 1건 이상 필수. source_ref는 최초 생성 시에만 반영된다.

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {
    "kind": {
      "type": "string",
      "description": "daily_brief | weekly_report | equity_analysis | strategy | realestate_*"
    },
    "report_date": {
      "type": "string",
      "description": "YYYY-MM-DD (weekly_report는 일요일)"
    },
    "slug": {
      "type": "string",
      "description": "소문자·숫자·하이픈 1–80자"
    },
    "title": {
      "type": "string"
    },
    "summary": {
      "type": "string",
      "description": "1–3줄"
    },
    "body_md": {
      "type": "string"
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string"
          },
          "publisher": {
            "type": "string"
          },
          "accessed_at": {
            "description": "ISO8601 (생략 시 현재 시각)",
            "type": "string"
          },
          "url": {
            "type": [
              "string",
              "null"
            ]
          },
          "is_primary": {
            "type": "boolean"
          }
        },
        "required": [
          "label",
          "publisher"
        ],
        "additionalProperties": false
      },
      "description": "근거 출처 1건 이상 (upsert 시 전체 교체)"
    },
    "subtype": {
      "description": "equity_analysis의 'buy_plan' (draft만)",
      "type": [
        "string",
        "null"
      ]
    },
    "domain": {
      "description": "macro | stock | realestate (kind별 기본값 있음)",
      "type": "string"
    },
    "headline": {
      "description": "목록용 한 줄 (≤120자, 80자 초과 시 WARN)",
      "type": [
        "string",
        "null"
      ]
    },
    "period_start": {
      "type": [
        "string",
        "null"
      ]
    },
    "period_end": {
      "type": [
        "string",
        "null"
      ]
    },
    "generated_at": {
      "type": [
        "string",
        "null"
      ]
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "tickers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "status": {
      "description": "'draft' | 'published'",
      "type": "string"
    },
    "meta": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "source_ref": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "body_blocks": {
      "description": "무시됨 — 서버가 렌더 캐시를 생성"
    },
    "bodyBlocks": {
      "description": "무시됨 — 서버가 렌더 캐시를 생성"
    },
    "toc": {
      "description": "무시됨 — 서버가 렌더 캐시를 생성"
    }
  },
  "required": [
    "kind",
    "report_date",
    "slug",
    "title",
    "summary",
    "body_md",
    "sources"
  ],
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-16`, `R-SYS-01`

### `whoami`

- **Title:** Who am I
- **Source:** `src/lib/server/mcp/tools/read.ts`
- **Required scope:** `read`
- **Annotations:** readOnlyHint=true, idempotentHint=true

인증된 봇 이름·스코프·서버 시각을 돌려준다(연결 확인용).

#### Input JSON Schema

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

#### Notable rule IDs (from description + implementing module)

`R-PERM-13`, `R-SYS-01`

---

_Generated for BE-14 from schemas at build/docs time._
