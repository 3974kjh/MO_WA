# BE-18 Dry-run report — Notion·JSON → MO_WA (no writes)

- Ticket: **BE-18**
- Generated: 2026-11-21 · Follow-ups through Notion **29-row memo verification** (script-compared SoT for §2a)
- Mode: **DRY-RUN ONLY** — zero DB inserts/updates; no migrations; no I-7; no Production / operational DB access
- Rules doc: [`be-18-converter-rules.md`](./be-18-converter-rules.md)
- Design: §7-1 · Rules: §5-0 Notion baselines · R-MIG-03
- Display IDs: N/A this dry-run. Future: owner-scoped `P-` / `R-` via `display_sequences` / `mowa_display_id()` only (**no `PP-`**).

---

## 0. Source streams (do not conflate)

| Stream | Source | Counts |
|---|---|---|
| **(a) Journal file** | `investor-journal.json` v39 · `updated_at` 2026-11-20T17:58:00+09:00 | **42** entries |
| **(b) Notion journal baseline** | rules §5-0 | **54** rows (「기타」26 + empty instrument 3 → **29** memo-extract candidates) |
| **(b′) Notion 29-row memo verify** | Script-compared Notion memos (SoT for this recount) | **29** rows · see §2a |

**(a) and (b) have no common IDs** — do **not** auto-merge. At most build `(date, type, ticker-set)` **duplicate candidates** for I-7 prep; user decides priority later. File-only types (`user_intent`, `plan_draft`, `pending_decision`, `sell`) stay as **separate** rows.

DB writes this run: **0**. Alias map: **not locked** (12 candidates + 7 unmapped remain unlocked). Do **not** map yield `UST30Y` → position `UST_30Y`.

---

## 1. Portfolio / positions (§7-1)

### 1-1. Baseline inventory (Notion 💼 · 9 rows)

| Metric | Count |
|---|---:|
| Notion 💼 rows | **9** |
| Immediate convert | **5** |
| Partial hold (USD currency; avg/base empty) | **2** (SGOV, QBTS) |
| Closed history | **2** (UST_30Y, KR_CORP_BOND) |
| **Total** | **9** = 5 + 2 + 2 |
| DB writes | **0** |

### 1-2. Hyundai Motor `005380`

| Item | Value |
|---|---|
| Planned | `watch_only=true`, `trigger_price=null` |
| Notion trigger discarded | `300000` (prior report only; **no** memo watch-only prefix) |

### 1-3. SGOV · QBTS

| Ticker | `currency` | avg/base | Preserved Notion KRW (verbatim, **no FX**) |
|---|---|---|---|
| SGOV | USD | **hold (null)** | avg `138191`, base `134322` |
| QBTS | USD | **hold (null)** | avg **`22775`** (Notion source text 22,775 — corrected from 22795), base `9759` |

### 1-4. Closed history — `UST_30Y` · `KR_CORP_BOND`

| Ticker | Rule |
|---|---|
| `UST_30Y` | `status=closed` · `currency=USD` · history only |
| `KR_CORP_BOND` | `status=closed` **only** — matured and redeemed (**user answer relayed by develop_boot**). Do **not** fill quantity, average price, or amount (no source text). Replaces earlier “deferred until user answers” wording. |

### 1-5. Positions dry-run classification (**5 / 2 / 2**, total 9)

| Bucket | Count | Members |
|---|---:|---|
| Immediate convert | **5** | NAVER (`035420`), KT (`030200`), GOOGL, Robotis planned (`108490`), Hyundai Motor planned watch-only (`005380`) |
| Partial hold | **2** | SGOV, QBTS |
| Closed | **2** | UST_30Y, KR_CORP_BOND |
| **Total** | **9** | |
| Written to DB | **0** | |

Changed from prior **6 / 1 / 2** because `KR_CORP_BOND` moved from immediate-convert → **closed** (decision 6 update). **§4-3 is unchanged** (still confirmed 5 / candidate 2 / deferred 5): that table is D5/`stock_report_context` attach classification; `KR_CORP_BOND` is not one of the 12 context keys, so this position-status change does not alter §4-3 counts.

### 1-6. Importer evidence / open candidates (PM)

| Item | Disposition |
|---|---|
| **GOOGL currency** | Importer mapping basis from memo evidence **「단위 USD」** — document and **leave that evidence**; currency=`USD` |
| **NAVER trigger `180000`** | **Candidate only** — do **not** decide trigger direction (`below`/`above`) in BE-18 |
| **`KR_CORP_BOND`** | **Closed** (matured/redeemed; relayed by develop_boot) — no qty / avg / amount |
| **`005930` + 9 name-only names** | **Deferred** — enter `instruments` only at I-7 after original source (e.g. KRX) confirmation |

---

## 2. Journal body → `tickers[]`

### 2a. Notion 29-row memo recount (SoT for 「기타」/empty extract)

Covers the **29** Notion rows that need memo → `tickers[]` (from baseline 54 = 「기타」26 + empty 3). **Not** the file’s 42 entries.

**Row deltas only (verification):**

| # | Date | Change |
|---|---|---|
| 13 | 2026-10-18 | **Add** `000660` — memo contains «하이닉스 5.36조» |
| 25 | 2026-11-15 | **Remove** `KR_CORP_BOND` — memo only «IRP 만기(11/16)» (no «회사채»); remaining ticker **`035420` only** |
| 28 | 2026-11-19 | **Add** `000660` — memo contains «SK하이닉스 +3.41%» |

**Updated frequency (29-row Notion memo):**

| Code | Entries |
|---|---:|
| 035420 | 27 |
| 108490 | 24 |
| 005380 | 24 |
| GOOGL | 22 |
| 030200 | 22 |
| KR_CORP_BOND | 21 |
| QBTS | 12 |
| 000660 | 9 |
| 102110* | 7 |
| UST_30Y* | 6 |
| SGOV | 3 |

| Metric | Value |
|---|---|
| Rows with ≥1 confirmed code | **28 / 29** |
| Unique code types | **11** |
| Not present in these 29 rows | `066570`, `207940`, `068270` |
| Deferred token on row #1 | `005930` (do not fill / do not add instrument now) |
| `UST30Y` (yield) → `UST_30Y` | **Not mapped** |
| Tags receive codes | **0** (`R-VAL-J08`) |

\* Marked in verify table as noted by PM; still confirmed-set codes when present as position/instrument tokens — not the yield key `UST30Y`.

### 2b. Journal file (a) — 42 entries (separate; unchanged headlines)

| Outcome | Count |
|---|---:|
| Entries total | **42** |
| Confirmed `tickers[]` | **39** |
| No body | **1** |
| Body without confirmed code | **2** |
| Unconfirmed token `912810` (CUSIP fragment) | held |
| Sell hold | **1** |

Do not auto-merge with Notion 54/29. Optional later: `(date, type, ticker-set)` **duplicate candidates** only.

**File-only types (remain separate rows):** `user_intent`, `plan_draft`, `pending_decision`, `sell`.

---

## 3. Aliases — unlocked

| Check | Result |
|---|---|
| Runtime alias mapping | **No** (`R-VAL-C05`) |
| Map locked this dry-run? | **No** |
| Codes guessed / instruments added? | **No** |

| Class | Count | Keys / notes |
|---|---:|---|
| `price_snapshot_*` top-level keys | **32** | 31 date keys + `price_snapshot_batch` |
| Latest **date** key | `price_snapshot_2026_11_20` | (do not treat `price_snapshot_batch` as latest by name sort) |
| Importer **candidates** (unlocked) | **12** | NAVER, KT, GOOGL, QBTS, SGOV, Robotis, Hyundai, LGE, SKH, SamsungBio, Celltrion, TIGER200 |
| **Unmapped** (deferred, unlocked) | **7** | Yuhan, Shinsegae, POSCOIntl, KoreanAir, LG, Glovis, SKT |
| Exclude | 1 | `Hyundai_52wL` |
| Indicators (not instrument aliases) | 5 | USDKRW, USDKRW_close_1530, **UST30Y**, KOSPI, KOSDAQ |

Name-only / `005930`: deferred until I-7 + source confirmation (same as §1-6).

---

## 4. `stock_report_context.json` → alignment + D5

### 4-1. File meta

| Field | Value |
|---|---|
| `as_of` | **2026-11-08** (**not** latest prices) |
| `items` | **12** (keys already tickers) |
| Q-33 fields | `plan_status`, `fields`, `history`, `draft` — **not mapped** |

### 4-2. Label → enum

| Korean | → enum | Count |
|---|---|---:|
| 일치 | `aligned` | 0 |
| 부분일치 | `partial` | **5** |
| 불일치 | `conflict` | 0 |
| 판단보류 | `unchecked` | **7** |

### 4-3. D5 attach classification (PM)

| Class | Count | Rule |
|---|---:|---|
| **Confirmed** | **5** | Context may attach to an existing equity_analysis |
| **Candidate** | **2** | Attach only via **multi-ticker** D5 reports kept **whole** (`tickers[]` multi); contexts as candidates — **do not split** the 3 multi-ticker D5 items into separate reports |
| **Deferred** | **5** | No confirmed equity_analysis for attach |

**102110 plan document:** `equity_analysis` with **`subtype=buy_plan` (draft)** — not a general equity_analysis. Count it under the buy_plan path when classifying confirmed attaches.

**Deferred context tickers (5):** `QBTS`, `SGOV`, `066570`, `207940`, `068270`.

**Independence from decision 6:** §4-3 counts stay **5 / 2 / 5**. Moving `KR_CORP_BOND` to closed affects §1-5 only (positions), not context/D5 attach buckets.

---

## 5. Acceptance checklist

| Requirement | Met? |
|---|---|
| Converter rules + dry-run with counts/holds | Yes |
| No database writes / no SQL / no I-7 | **Yes** |
| Alias map unlocked; no guessed codes; no `UST30Y`→`UST_30Y` | Yes |
| File 42 ≠ Notion 54/29 (no auto-merge) | Yes |
| PR not merged | Yes |

---

## 6. Still deferred

1. Notion rows beyond the verified 29-memo set / full R-MIG-03 live re-count  
2. D5 deferred contexts (5) + multi-ticker candidate attaches (2) pending I-7 inventory  
3. Alias lock; 7 unmapped names; `005930` + 9 name-only → instruments only after KRX/source confirm at I-7  
4. NAVER trigger `180000` direction (candidate only)  
5. File↔Notion duplicate resolution priority (user at I-7 prep)

No database was written. Execution remains gated on **I-7** sign-off.
