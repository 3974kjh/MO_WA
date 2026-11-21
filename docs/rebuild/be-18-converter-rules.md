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
| SGOV, QBTS | Set `currency=USD`. Leave `avg_price` and `base_price` **empty (on hold)**. Preserve Notion KRW avg/base **verbatim** (QBTS avg **`22775`** = source text 22,775; SGOV avg `138191`). **No FX conversion.** User later confirms USD avg via web correction (`proposed_by=user`, G-4 / `R-VAL-P11`). | Q-21, `R-MIG`, `R-VAL-P10` |
| `UST_30Y` | Import as `status=closed` history only (full exit 2026-10-16). `currency=USD`. Do **not** map yield indicator `UST30Y` → this position. | Q-21 |
| `KR_CORP_BOND` | `status=closed` **only** (matured and redeemed — **user answer relayed by develop_boot**). Do **not** fill qty, avg_price, or amount (no source text). | decision 6 |
| GOOGL currency | Importer basis: Notion memo evidence **「단위 USD」** — keep that evidence; set `currency=USD`. | Q-21 / importer map |
| NAVER trigger `180000` | **Candidate only** — do not decide `trigger_direction` in BE-18. | R-VAL-P15 |
| Journal rows tagged 「기타」 or empty instrument | Extract ticker codes from body → `journal_entries.tickers[]`. **Never** put those codes in `tags`. If `kind∈{buy,sell}` and no instrument can be resolved → **hold list**. Notion 29-row memo verify is SoT for that subset; journal **file** 42 ≠ Notion **54**. | Q-16, `R-VAL-J03`, `R-VAL-J08` |
| Aliases | Name→code map is **importer-only** and stays **unlocked** in BE-18 (12 candidates + 7 unmapped). Runtime bots must not alias-resolve (`R-VAL-C05`). Unmapped aliases → hold list. Codes / new instruments (`005930`, 9 name-only) only after source confirmation at I-7. **No guessing.** | Q-24, `R-VAL-C05` |
| `stock_report_context.json` | Map labels into alignment enum (Korean map below). D5 attach: **confirmed 5 / candidate 2 / deferred 5**. Do **not** split the 3 multi-ticker D5 reports — one report, multi `tickers[]`, attach contexts as candidates. `102110` plan = `equity_analysis` **`subtype=buy_plan` (draft)**. | Q-20, `R-VAL-R15` |
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
  QBTS: Notion avg 22775,  base 9759  (KRW-denominated; source text 22,775)
POST-I-7:
  User enters USD avg via CorrectionSheet → apply_user_correction (approved, no pending)
```

Positions dry-run classification (Notion 💼 **9** rows): **immediate convert 5 / partial hold 2 / closed 2**
(NAVER, KT, GOOGL, Robotis planned, Hyundai planned watch-only) / (SGOV, QBTS) / (UST_30Y, KR_CORP_BOND).
`KR_CORP_BOND` closed rule: matured/redeemed (**relayed by develop_boot**); qty·avg·amount left empty.

Do not invent USD averages from exchange rates at import time.

**GOOGL:** leave memo evidence 「단위 USD」 as the importer currency mapping basis (`currency=USD`).

**NAVER `trigger_price=180000`:** record as a **candidate** only — do not set `trigger_direction` in BE-18.

### 2-3. UST_30Y — closed history, USD

```
INPUT  title contains 청산 / code UST_30Y
OUTPUT positions:
  status   = "closed"               # override Notion "보유" label
  currency = "USD"
  # history row only; not active holding/planned
```

### 2-4. KR_CORP_BOND — closed only (matured / redeemed)

```
INPUT  Notion 💼 domestic corporate bond (만기·상환)
OUTPUT positions:
  status   = "closed"               # only
  qty      = null                   # do not fill — no source text
  avg_price = null
  # amount / proceeds: do not invent
SOURCE: user answer relayed by develop_boot (decision 6 update)
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

Measured baseline (rules §5-0): Notion journal **54** rows; 「기타」 **26**; empty instrument **3** → **29** memo-extract candidates. Script-verified Notion memo recount (SoT for that subset): **28/29** rows with a code; see dry-run §2a (row deltas #13/#25/#28).

**Separate stream:** `investor-journal.json` **42** entries — **no common IDs** with Notion 54; do **not** auto-merge. Optional `(date, type, ticker-set)` duplicate **candidates** only; file-only types (`user_intent`, `plan_draft`, `pending_decision`, `sell`) stay separate. User sets I-7 priority later.

Deferred tokens: `005930` (Notion memo #1) and **9 name-only** names — **not** added to `instruments` until I-7 + original source (e.g. KRX).

---

## 4. Alias map (importer-only, unlocked)

- Runtime MCP: alias input → ERROR + candidates (`R-VAL-C05`). No runtime rewrite.
- BE-18 keeps the importer map **unlocked**: **12** candidates + **7** unmapped. Do not lock; do not invent codes.
- Candidate list (confirm before any future lock):

| Alias (example) | Candidate code (confirm before fill) | Status for BE-18 |
|---|---|---|
| Robotis | 108490 | Unlocked candidate |
| Hyundai | 005380 | Unlocked candidate |
| SKH / SKhynix | 000660 | Unlocked candidate |
| LGE | 066570 | Unlocked candidate |
| SamsungBio / SBL | 207940 | Unlocked candidate |
| Celltrion / CEL | 068270 | Unlocked candidate |
| TIGER200 | 102110 | Unlocked candidate |
| NAVER, KT, GOOGL, QBTS, SGOV | Already appear as Notion codes / selects | Unlocked candidate |
| Yuhan, Shinsegae, POSCOIntl, KoreanAir, LG, Glovis, SKT | — | **Unmapped hold** (unlocked) |
| `Hyundai_52wL` and other derived keys | — | **Exclude** |
| `UST30Y` | — | Yield **indicator** — **not** `UST_30Y` position |

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

D5 attach classification (PM): **confirmed 5 / candidate 2 / deferred 5**.

- **Do not split** the 3 multi-ticker D5 items. Keep **one** report with multiple `tickers[]`; attach matching contexts as **candidates**.
- **`102110` plan document** = `kind=equity_analysis`, **`subtype=buy_plan`**, status **draft** — not a general equity_analysis.
- Deferred contexts (5): `QBTS`, `SGOV`, `066570`, `207940`, `068270`.

Gate:

```
IF equity_analysis (or buy_plan subtype) exists for ticker → apply mapped meta (migration mode)
ELSE IF only multi-ticker D5 covers ticker → candidate attach (do not split report)
ELSE → hold context (do not invent equity_analysis)
```

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
