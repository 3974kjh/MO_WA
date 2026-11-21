# BE-18 Dry-run report — Notion·JSON → MO_WA (no writes)

- Ticket: **BE-18**
- Generated: 2026-11-21 (agent run) · **Follow-up recount:** 2026-11-21 (exports attached)
- Mode: **DRY-RUN ONLY** — zero DB inserts/updates; no migrations applied; no Production / operational DB access
- Rules doc: [`be-18-converter-rules.md`](./be-18-converter-rules.md)
- Design: §7-1 · Rules: §5-0 Notion baselines · R-MIG-03
- Display IDs: N/A for this dry-run (no proposal rows created). Future IDs: owner-scoped `P-` / `R-` via `display_sequences` / `mowa_display_id()` only (**no `PP-`**).

---

## 0. Source availability

| Source | Present? | Used for |
|---|---|---|
| Notion 📒 / 💼 live API | No | — |
| Notion export dump | No | — |
| `stock_report_context.json` (upload) | **Yes** | Alignment recount · §4 (`as_of` **2026-11-08**, 12 items — **not** latest prices) |
| `investor-journal.json` (upload) | **Yes** | Body ticker extract §2 · alias keys in `price_snapshot_*` §3 (`updated_at` **2026-11-20T17:58:00+09:00**, **v39**, **42** entries) |
| Equity-analysis report export / Notion D5 list | No | D5 attach still deferred |
| rules·design measured tables | Yes | Notion baselines (§1, §2a) |

**Important:** `investor-journal.json` is **not** treated as the Notion 📒 original. Counts below distinguish:

| Stream | Source | Counts |
|---|---|---|
| **(a) Journal file** | `investor-journal.json` v39 | **42** entries |
| **(b) Notion baseline** | rules §5-0 (2026-11-21 read-only) | journal **54**, 「기타」 **26**, empty instrument **3** |

DB writes this run: **0**.

---

## 1. Portfolio / positions (§7-1 core)

Unchanged by this follow-up (still rules §5-0 / §5-2 baselines; no Notion 💼 export attached).

### 1-1. Baseline inventory

| Metric | Count | Notes |
|---|---:|---|
| Notion 💼 보유·매수계획 rows | 9 | 보유 7 · 매수계획 2 |
| Would import as active holding/planned (expected) | 8 | After UST_30Y → closed |
| Would import as closed history | 1 | UST_30Y |
| DB writes performed this run | **0** | Required |

### 1-2. Hyundai Motor `005380`

| Item | Count / value |
|---|---|
| Matching position rows | **1** (baseline) |
| Planned `watch_only=true`, `trigger_price=null` | 1 |
| Notion trigger discarded | `300000` (prior report only; no memo prefix) |

### 1-3. SGOV · QBTS

| Ticker | `currency` | avg/base | Preserved Notion KRW (no FX) |
|---|---|---|---|
| SGOV | USD | **hold (null)** | avg `138191`, base `134322` |
| QBTS | USD | **hold (null)** | avg `22795`, base `9759` |

### 1-4. UST_30Y

| Item | Value |
|---|---|
| Rows | 1 · `status=closed` · `currency=USD` |

### 1-5. Positions dry-run summary

| Bucket | Count |
|---|---:|
| Ready (rules applied; still no write) | 7 |
| Closed history ready | 1 (UST_30Y) |
| Partial hold (USD OK, avg/base empty) | 2 (SGOV, QBTS) |
| Written to DB | **0** |

---

## 2. Journal body → `tickers[]`

### 2a. Notion baseline (rules §5-0) — still no Notion memo dump

| Metric | Count | Status |
|---|---:|---|
| Journal rows total | 54 | baseline only |
| 「기타」 | 26 | **still unmeasured** for body extract (Notion bodies absent) |
| Empty instrument | 3 | **still unmeasured** for body extract |
| Rows needing Notion body → `tickers[]` | 29 | deferred until Notion export |

### 2b. `investor-journal.json` recount (this follow-up)

| Meta | Value |
|---|---|
| `updated_at` | `2026-11-20T17:58:00+09:00` (KST) |
| `version` | v39 |
| `entries` | **42** |
| Candidate body fields only | `text`, `note`, `summary`, `summary_ko`, `title`, `mindset_summary_ko` |

**Extraction method (dry-run):** collect confirmed instrument codes only —

- literal codes already known from Notion 💼 / context keys: `035420`, `030200`, `GOOGL`, `QBTS`, `SGOV`, `108490`, `005380`, `066570`, `000660`, `207940`, `068270`, `102110`, `UST_30Y`, `KR_CORP_BOND`
- Korean/English display names that resolve via that **same confirmed set** (e.g. 네이버→`035420`, 로보티즈→`108490`)
- **No estimated codes.** Unknown 6-digit tokens → hold. Tags never receive codes (`R-VAL-J08`).

| Outcome | Count | Notes |
|---|---:|---|
| Entries with ≥1 candidate body field non-empty | **41** | |
| Entries with no candidate body text | **1** | `2026-11-10` `user_decision` (id null) |
| Entries with ≥1 confirmed code → planned `tickers[]` | **39** | |
| Body present but **no** confirmed code | **2** | see hold list |
| Unique confirmed codes seen | **11** | `000660`, `005380`, `030200`, `035420`, `102110`, `108490`, `GOOGL`, `KR_CORP_BOND`, `QBTS`, `SGOV`, `UST_30Y` |
| Context tickers **never** hit in these bodies | **3** | `066570`, `207940`, `068270` |
| Unconfirmed 6-digit token | `912810` on **2** entries | CUSIP fragment from UST sell notes — **hold token**, not filled as ticker |
| `type=sell` with no resolvable MO_WA ticker in body | **1** | `entry-2026-10-16-ust30y-full-sell-executed` (mentions CUSIP / T 1.625; extracted `SGOV` only as nearby text — UST_30Y not literal; instrument object is not a ticker code) |
| Tags that would receive ticker codes | **0** | policy forbids |

**Code frequency (entries containing code):**

| Code | Entries |
|---|---:|
| 035420 | 35 |
| 030200 | 25 |
| GOOGL | 24 |
| 005380 | 11 |
| 108490 | 10 |
| QBTS | 10 |
| 102110 | 10 |
| SGOV | 7 |
| KR_CORP_BOND | 5 |
| 000660 | 2 |
| UST_30Y | 2 |

**Hold list — journal file (a):**

| id | date / key | reason | status |
|---|---|---|---|
| hold-ij-nobody | 2026-11-10 `user_decision` | No candidate body fields | deferred |
| hold-ij-profile | 2026-10-08 `profile_analysis` (“매매 원칙 MD 분석…”) | Body has no confirmed instrument code | deferred |
| hold-ij-plan-draft | 2026-10-14 `plan_draft` (“코스피200 ETF 계획서…”) | Name-only; **no code guessed** for 102110 | deferred |
| hold-ij-cusip-912810 | `entry-2026-10-16-ust30y-full-sell-intent` + `-executed` | Token `912810` is not an instruments ticker | deferred |
| hold-ij-sell-ust | `entry-2026-10-16-ust30y-full-sell-executed` (`type=sell`) | Sell row without confirmed `UST_30Y` / instrument_id from allowed fields alone | deferred |

**Hold list — Notion (b) still open:**

| id | reason | status |
|---|---|---|
| hold-jnl-notion-기타-empty | 「기타」×26 + empty×3 bodies not in these exports | **OPEN** |

---

## 3. Aliases — `price_snapshot_*` inside `investor-journal.json`

### 3-1. Policy

| Check | Result |
|---|---|
| Runtime alias mapping | **No** (`R-VAL-C05`) |
| Importer-only map | **Yes** |
| Codes guessed / filled this dry-run | **No** |

### 3-2. Snapshot key inventory (recounted)

| Metric | Count / value |
|---|---|
| Top-level `price_snapshot_*` keys | **32** = 31 date keys + `price_snapshot_batch` |
| Latest **date** key (not name-sort with batch) | `price_snapshot_2026_11_20` |
| Keys inside latest (excl. `source`) | **25** |

**Latest (`price_snapshot_2026_11_20`) classification:**

| Class | Count | Keys |
|---|---:|---|
| Indicator / FX / yield (not instrument aliases) | 5 | `USDKRW`, `USDKRW_close_1530`, `UST30Y`, `KOSPI`, `KOSDAQ` |
| Exclude (derived) | 1 | `Hyundai_52wL` |
| Importer **candidate** aliases (codes known from Notion/context — **map not locked**; I-7 source confirm still required) | **12** | `NAVER`→035420, `KT`→030200, `GOOGL`, `QBTS`, `SGOV`, `Robotis`→108490, `Hyundai`→005380, `LGE`→066570, `SKH`→000660, `SamsungBio`→207940, `Celltrion`→068270, `TIGER200`→102110 |
| **Unmapped hold** | **7** | `Yuhan`, `Shinsegae`, `POSCOIntl`, `KoreanAir`, `LG`, `Glovis`, `SKT` |

**Hold list — unmapped aliases (latest snapshot):**

| alias | action |
|---|---|
| Yuhan | deferred — no confirmed code |
| Shinsegae | deferred — no confirmed code |
| POSCOIntl | deferred — no confirmed code |
| KoreanAir | deferred — no confirmed code |
| LG | deferred — no confirmed code |
| Glovis | deferred — no confirmed code |
| SKT | deferred — no confirmed code |

Historical extras appear under older `price_snapshot_*` keys (e.g. `SKhynix`, `SBL`, `CEL`, `*_fdr`, `*_usd`, `TLT`, `Samsung`, `SEC`). Those remain **non-locked / deferred or exclude** until source confirmation; this dry-run does **not** invent codes for them.

---

## 4. `stock_report_context.json` → alignment

### 4-1. File meta

| Field | Value |
|---|---|
| `as_of` | **2026-11-08** (disclose: **not** latest market prices) |
| `items` | **12** (keys already ticker codes) |
| Q-33 fields | `plan_status`, `fields`, `history`, `draft` — **not mapped** |

### 4-2. Korean label → enum (design interpretation)

| Korean label | → `alignment` | Count in this file |
|---|---|---:|
| 일치 | `aligned` | **0** |
| 부분일치 | `partial` | **5** |
| 불일치 | `conflict` | **0** |
| 판단보류 | `unchecked` | **7** |
| *(any other)* | deferred | **0** in file |

**Per-ticker mapped values:**

| Ticker | Source label | Mapped enum |
|---|---|---|
| 035420 | 부분일치 | `partial` |
| 030200 | 부분일치 | `partial` |
| GOOGL | 부분일치 | `partial` |
| 108490 | 부분일치 | `partial` |
| 000660 | 부분일치 | `partial` |
| QBTS | 판단보류 | `unchecked` |
| SGOV | 판단보류 | `unchecked` |
| 005380 | 판단보류 | `unchecked` |
| 066570 | 판단보류 | `unchecked` |
| 207940 | 판단보류 | `unchecked` |
| 068270 | 판단보류 | `unchecked` |
| 102110 | 판단보류 | `unchecked` |

### 4-3. D5 (`equity_analysis`) attach gate

These two uploads **do not** contain equity-analysis reports or a D5 inventory. rules §5-0 Notion baseline still lists **9** equity_analysis pages vs **12** context items, but **join cannot be confirmed from these files alone**.

| Outcome | Count | Disposition |
|---|---:|---|
| Alignment labels mappable to enum | **12 / 12** | counted above |
| Context attach to `reports.meta` on existing D5 | **0 confirmed** | **all 12 deferred** |

**Hold list — context / D5:**

| ticker | reason | status |
|---|---|---|
| 035420, 030200, GOOGL, QBTS, SGOV, 108490, 005380, 066570, 000660, 207940, 068270, 102110 | No equity_analysis export in the two attached files; cannot prove D5 exists per ticker (Q-20 / `R-VAL-R15`) | **deferred** |

---

## 5. Acceptance checklist (BE-18)

| Requirement | Met? |
|---|---|
| Converter rules document exists | Yes |
| Dry-run has per-item counts + hold lists | Yes (positions baselines + journal/alias/alignment recounts) |
| No database writes | **Yes — 0 writes** |
| No FX conversion / no guessed codes | Yes |
| I-7 execution | **Not started** |
| PR merge | **Not merged** |

---

## 6. Still unmeasurable / deferred (why)

1. **Notion 「기타」×26 + empty×3 body → `tickers[]`** — Notion memo dump still absent; journal file (a) ≠ Notion (b).
2. **Fresh Notion row re-count for R-MIG-03 full table** (daily 34, equity 9, weekly 6, realestate 28, …) — needs live Notion or full export; not in these two files.
3. **D5 existence per context ticker** — no equity_analysis bodies/list in the two files → all 12 context attaches deferred.
4. **Importer alias map lock** — 12 candidates still require I-7 source confirmation; 7 latest unmapped aliases stay deferred; historical derived keys not auto-mapped.
5. **Positions Notion 💼 re-count** — no 💼 export in this follow-up (baselines retained).

No database was written. Execution remains gated on **I-7** sign-off.
