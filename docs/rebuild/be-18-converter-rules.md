# BE-18 이전 데이터 변환기 규칙 (converter rules)

- Ticket: **BE-18** — 문서·dry-run만. **실행(쓰기)은 I-7 서명 뒤**
- Source of truth: `design.md` v0.6 §7-1, `work-breakdown.md` v0.6 BE-18, `rules.md` v0.5 (§5 매핑·R-MIG·R-VAL)
- Mode: **documentation / dry-run only**. No database writes, no migrations, no Production touch.
- Display IDs (if any appear in later import output): owner-scoped `P-` / `R-` via `display_sequences` + `mowa_display_id()` only. **No `PP-`, no global identity.**

---

## 0. Scope and hard constraints

| Allowed in BE-18 | Forbidden until I-7 |
|---|---|
| Converter rules document | `INSERT` / `UPDATE` / MCP `import:all` writes |
| Dry-run report (counts + hold lists) | Applying Supabase migrations |
| Read-only use of source exports (if present) | FX conversion of Notion KRW → USD for avg/base |
| Importer-only alias map (confirmed codes only) | Guessing instrument codes for unmapped aliases |
| | Touching `main` data, Production, `mcp-spike`, PR #3 |

Related rule IDs: `R-MIG-01`…`R-MIG-05`, `R-VAL-P13`, `R-VAL-C05`, `R-VAL-J03`, `R-VAL-J08`, `R-VAL-R14`, `R-VAL-R15`, `R-VAL-P10` (evidence / prior-report refs).

Validation mode for a future importer run: **`migration`** (not `strict`). ERROR stops load; WARN goes to the migration verification report (`R-MIG-02`).

---

## 1. Design §7-1 rule table (canonical)

| Target | Converter rule | Rule / Q refs |
|---|---|---|
| Hyundai Motor `005380` | Set `watch_only=true`, `trigger_price=null`. Do **not** import Notion trigger `300000`. Keep Notion `status` as-is (`holding` / `planned`). Do **not** prefix `memo` with watch-only text (UI reads `watch_only`). Preserve Notion trigger value only in the prior/migration report (`source_ref` / hold note). | Q-17, Q-32, `R-VAL-P13` |
| SGOV, QBTS | Set `currency=USD`. Leave `avg_price` and `base_price` **empty (on hold)**. Preserve Notion KRW avg/base **verbatim** in the prior report / hold list. **No FX conversion.** User later confirms USD avg via web correction (`proposed_by=user`, G-4 / `R-VAL-P11`). | Q-21, `R-MIG`, `R-VAL-P10` |
| `UST_30Y` | Import as `status=closed` history only (full exit 2026-10-16). `currency=USD`. | Q-21 |
| Journal rows tagged 「기타」 or empty instrument | Extract ticker codes from body → `journal_entries.tickers[]`. **Never** put those codes in `tags`. If `kind∈{buy,sell}` and no instrument can be resolved → **hold list**. | Q-16, `R-VAL-J03`, `R-VAL-J08` |
| Aliases | Name→code map is **importer-only**. Runtime bots must not alias-resolve (`R-VAL-C05`). Unmapped aliases → hold list. Codes filled only after source confirmation (KRX / Notion code). **No guessing.** | Q-24, `R-VAL-C05` |
| `stock_report_context.json` | Map labels into `reports.meta` alignment enum: `aligned` \| `partial` \| `conflict` \| `unchecked` (+ `selection_reason`, `reason_source`, `align_reason`, `lenses{social,corporate,policy}`). If no `equity_analysis` report exists for that ticker → **hold context**. | Q-20, `R-VAL-R15` |
| Daily candidates (adjacent) | Move past daily candidate tables into `meta.candidates[]` only when shape matches; else WARN + hold (`R-VAL-R14`). Out of BE-18 acceptance core but listed in §7-1. | Q-19, `R-VAL-R14` |

---

## 2. Positions converter detail

### 2-1. Hyundai Motor (`005380`) — watch-only

```
INPUT  (Notion 💼 row, code=005380)
OUTPUT positions:
  instrument.ticker = "005380"
  watch_only        = true
  trigger_price     = null          # Notion 300000 discarded from live field
  status            = <Notion 구분 mapped: 보유→holding, 매수계획→planned>
  memo              = <Notion 메모 as-is; NO "watch-only" / "관찰만" prefix>
PRESERVE (report / dry-run hold note only):
  notion_trigger_price_discarded = 300000
```

`R-VAL-P13`: `watch_only=true` ⇒ `trigger_price` must be null in the same write.

### 2-2. SGOV and QBTS — USD currency, avg/base on hold

```
INPUT  (Notion 💼 rows: SGOV, QBTS / 디웨이브퀀텀)
OUTPUT positions:
  currency   = "USD"
  avg_price  = null                 # hold — do not load Notion KRW
  base_price = null                 # hold — do not load Notion KRW
  # qty / status / other fields: follow general Notion→positions map (rules §5-2)
PRESERVE (prior report / hold list, verbatim — no FX):
  SGOV: Notion avg 138191, base 134322 (KRW-denominated source values)
  QBTS: Notion avg 22795,  base 9759  (KRW-denominated source values)
POST-I-7:
  User enters USD avg via CorrectionSheet → apply_user_correction (approved, no pending)
```

Do not invent USD averages from exchange rates at import time.

### 2-3. UST_30Y — closed history, USD

```
INPUT  title contains 청산 / code UST_30Y
OUTPUT positions:
  status   = "closed"               # override Notion "보유" label
  currency = "USD"
  # history row only; not active holding/planned
```

---

## 3. Journal converter detail (「기타」 / empty instrument)

| Notion 「종목」 | `instrument_id` | `tickers[]` | `tags` |
|---|---|---|---|
| Named select with known code (NAVER, KT, …) | Resolve via importer map | Optional: same code if mentioned | Must **not** contain ticker codes (`R-VAL-J08` WARN if present) |
| 「기타」 | `null` | Codes extracted from `memo_md` / body | Never codes |
| Empty | `null` | Codes extracted from body | Never codes |

Extraction policy (dry-run / future importer):

1. Scan body for known instrument tickers (confirmed map only) and KRX `^\d{6}$` / US ticker tokens already in `instruments`.
2. Deduplicate → `tickers[]`.
3. Codes not in `instruments` → hold that entry (or that token).
4. `kind∈{buy,sell}` with unresolved instrument → **entire row on hold** (`R-VAL-J02` / `R-VAL-J03`).

Measured baseline (rules §5-0, Notion read-only 2026-11-21): journal **54** rows; 「기타」 **26**; empty instrument **3**.

---

## 4. Alias map (importer-only)

- Runtime MCP: alias input → ERROR + candidates (`R-VAL-C05`). No runtime rewrite.
- Importer may use a **confirmed** alias→code table only.
- Candidate list from rules §5-5 (for confirmation workflow — **not** auto-applied until source-checked):

| Alias (example) | Candidate code (confirm before fill) | Status for BE-18 |
|---|---|---|
| Robotis | 108490 | Confirm from Notion/KRX before map lock |
| Hyundai | 005380 | Confirm |
| SKH / SKhynix | 000660 | Confirm |
| LGE | 066570 | Confirm |
| SamsungBio / SBL | 207940 | Confirm |
| Celltrion / CEL | 068270 | Confirm |
| TIGER200 | 102110 | Confirm |
| NAVER, KT, GOOGL, QBTS, SGOV | Already appear as Notion codes / selects | Confirm |
| Yuhan, Shinsegae, POSCOIntl, KoreanAir, LG, Glovis, SKT, … | — | **Hold — unmapped** until source confirmation |
| `Hyundai_52wL` and other derived keys | — | **Exclude** from import |

**BE-18 rule:** this document must not invent codes. Dry-run lists unmapped aliases under holds. Codes are filled only after I-7 prep confirmation.

---

## 5. `stock_report_context.json` → alignment (`R-VAL-R15`)

Target fields on latest `equity_analysis` `reports.meta`:

| Source key | Target | Notes |
|---|---|---|
| `reason` | `selection_reason` | |
| `reason_source` | `reason_source` | |
| `alignment` | `alignment` | Must be one of `aligned` \| `partial` \| `conflict` \| `unchecked`. Map **only** the Korean labels below; any other label → hold |
| `align_reason` | `align_reason` | |
| `lenses` | `lenses{social, corporate, policy}` | |
| `plan_status`, `fields`, `history`, `draft` | — | Q-33 / buy_plan meta — **out of BE-18 write path** |

Korean `alignment` labels (design interpretation; map only these):

| Source label | → enum |
|---|---|
| 일치 | `aligned` |
| 부분일치 | `partial` |
| 불일치 | `conflict` |
| 판단보류 | `unchecked` |

Measured export (`stock_report_context.json`, `as_of` **2026-11-08**, 12 items — not latest prices): keys are already tickers `035420`, `030200`, `GOOGL`, `QBTS`, `SGOV`, `108490`, `005380`, `066570`, `000660`, `207940`, `068270`, `102110`. File labels observed: 부분일치×5, 판단보류×7 (일치/불일치×0). See dry-run §4.

Gate:

```
IF equity_analysis exists for ticker → apply mapped meta (migration mode)
ELSE → hold context for that ticker (do not invent equity_analysis)
```

D5 attach cannot be confirmed from `stock_report_context.json` + `investor-journal.json` alone — dry-run defers all 12 context attaches until an equity_analysis inventory is available (rules §5-0 Notion baseline still lists 9 equity_analysis pages).

---

## 6. Dry-run report requirements (acceptance)

A BE-18 dry-run report **must** include per-item counts and hold lists for:

1. Hyundai `005380` watch_only / null trigger
2. SGOV · QBTS USD + avg/base hold (+ preserved KRW values)
3. UST_30Y closed · USD
4. Journal 「기타」 / empty → `tickers[]` extract (and buy/sell unresolved holds)
5. Alias map confirmed vs unmapped hold list
6. `stock_report_context` alignment map vs no-D5 hold list

It **must not** write to any database.

See companion file: [`be-18-dry-run-report.md`](./be-18-dry-run-report.md).

---

## 7. Out of scope (explicit)

- BE-17 (principle proposal queue)
- BE-19 (ack / user correction RPC wiring) — correction path is documented as post-import UX only
- I-7 actual import execution
- Daily `meta.candidates[]` full converter implementation (rule noted; execution later)
- Secrets, API keys, Notion tokens, or live DB credentials in this document
