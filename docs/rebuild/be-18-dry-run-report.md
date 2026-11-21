# BE-18 Dry-run report — Notion·JSON → MO_WA (no writes)

- Ticket: **BE-18**
- Generated: 2026-11-21 (agent run)
- Mode: **DRY-RUN ONLY** — zero DB inserts/updates; no migrations applied; no Production / operational DB access
- Rules doc: [`be-18-converter-rules.md`](./be-18-converter-rules.md)
- Design: §7-1 · Rules: §5-0 measured counts (2026-11-21 KST Notion read-only) · R-MIG-03 baselines
- Display IDs: N/A for this dry-run (no proposal rows created). Future IDs: owner-scoped `P-` / `R-` via `display_sequences` / `mowa_display_id()` only (**no `PP-`**).

---

## 0. Source availability on this machine

| Source | Present in `MO_WA` repo / VM? | Used for counts |
|---|---|---|
| Notion 📒 / 💼 live API | No | — |
| Notion export dump | No | — |
| `stock_report_context.json` | No | — |
| `investor-journal.json` / price snapshots | No | — |
| `finance-briefings` / `build_dashboard.py` | No | — |
| Attached / in-repo rules·design measured tables | Yes (uploads + this ticket SoT) | **Yes** — baseline counts only |

**Verdict:** Live re-count against Notion/JSON exports was **not possible** here. Counts below are **baselines from `rules.md` v0.5 §5-0 / §5-2** (read-only Notion fetch recorded 2026-11-21). Before I-7, re-count per `R-MIG-03`.

### Could not be counted on this machine

- Exact body-extracted `tickers[]` membership per 「기타」/empty journal row (needs memo bodies)
- Confirmed vs provisional alias map lock status after KRX/Notion code check
- Per-ticker presence of `equity_analysis` vs each of 12 `stock_report_context` keys (needs exports)
- Actual alignment label distribution inside `stock_report_context.json`
- Fresh Notion row totals if data changed after 2026-11-21 fetch cache

---

## 1. Portfolio / positions (§7-1 core)

### 1-1. Baseline inventory (R-MIG-03 / rules §5-0)

| Metric | Count | Notes |
|---|---:|---|
| Notion 💼 보유·매수계획 rows | 9 | 보유 7 · 매수계획 2 |
| Would import as active holding/planned (expected) | 8 | After UST_30Y → closed |
| Would import as closed history | 1 | UST_30Y |
| DB writes performed this run | **0** | Required |

### 1-2. Hyundai Motor `005380` (`watch_only=true`, `trigger_price=null`)

| Item | Count / value | Hold / preserve |
|---|---|---|
| Matching position rows (code `005380`) | **1** (baseline) | — |
| Planned output `watch_only=true` | 1 | — |
| Planned output `trigger_price=null` | 1 | — |
| Notion trigger discarded (not written to field) | `300000` | Preserve in prior report only |
| Memo watch-only prefix applied | **0** (forbidden) | — |
| Status override | none (keep Notion status) | — |

**Hold list:** none for Hyundai beyond the discarded-trigger preserve note.

### 1-3. SGOV · QBTS (`currency=USD`; avg & base on hold)

| Ticker | Rows | `currency` | `avg_price` / `base_price` | Preserved Notion KRW (verbatim, no FX) |
|---|---:|---|---|---|
| SGOV | **1** | USD | **null / null (hold)** | avg `138191`, base `134322` |
| QBTS | **1** | USD | **null / null (hold)** | avg `22795`, base `9759` |
| **Total hold (avg/base)** | **2** | | | |

**Hold list — avg/base pending user USD correction (post I-7):**

| id (logical) | ticker | reason | preserved_krw |
|---|---|---|---|
| hold-pos-sgov-avgbase | SGOV | Q-21 / R-MIG — no FX; user correction later | avg=138191, base=134322 |
| hold-pos-qbts-avgbase | QBTS | Q-21 / R-MIG — no FX; user correction later | avg=22795, base=9759 |

### 1-4. UST_30Y (closed, USD)

| Item | Count / value |
|---|---|
| Rows | **1** |
| Planned `status` | `closed` |
| Planned `currency` | `USD` |
| Active holding/planned after import | 0 for this ticker |

**Hold list:** none (closed history is an intentional import, not a hold).

### 1-5. Positions dry-run summary

| Bucket | Count |
|---|---:|
| Ready (rules applied; still no write) | 7 (incl. Hyundai watch_only; excl. UST closed + 2 avg holds as “partial”) |
| Closed history ready | 1 (UST_30Y) |
| Partial hold (USD currency OK, avg/base empty) | 2 (SGOV, QBTS) |
| Written to DB | **0** |

---

## 2. Journal — 「기타」 / empty instrument → `tickers[]`

### 2-1. Baseline inventory (rules §5-0)

| Metric | Count |
|---|---:|
| Journal rows total | 54 |
| 「기타」 | 26 |
| Empty instrument | 3 |
| Rows needing body → `tickers[]` extraction | **29** |
| Named instruments (not in this special path) | 25 |

### 2-2. Planned transform

| Outcome | Count | Notes |
|---|---:|---|
| Candidates for `tickers[]` fill (tags must stay free of codes) | 29 | Bodies not available on VM |
| Extracted codes counted this run | **unmeasured** | Blocker: no memo export |
| buy/sell with unresolved instrument → hold | **unmeasured** | Notion: 매수 2 · 매도 0; need body/instrument check |
| Tags that would receive ticker codes | **0** (policy forbids) | R-VAL-J08 |

**Hold list — journal (template; fill at I-7 prep):**

| id | source row key | reason | status |
|---|---|---|---|
| hold-jnl-extract-pending | 「기타」×26 + empty×3 | Body text not on machine — cannot list extracted codes | **OPEN** |
| hold-jnl-buy-sell-unresolved | TBD | If buy/sell lacks resolvable instrument after extract | template |

---

## 3. Aliases — importer-only map / unmapped hold

### 3-1. Policy check

| Check | Result |
|---|---|
| Runtime alias mapping allowed? | **No** (`R-VAL-C05`) |
| Importer-only map? | **Yes** |
| Codes guessed in this dry-run? | **No** |
| Codes filled without source confirmation? | **No** |

### 3-2. Alias inventory (from rules §5-5 notes — confirmation pending)

| Class | Examples | Count (approx.) | Dry-run disposition |
|---|---|---|---|
| Already code-like / Notion select codes | GOOGL, QBTS, SGOV, 108490, 005380, … | n/a (instruments side) | Confirm at I-7 |
| INSTR candidates (not locked here) | Robotis, Hyundai, SKH, LGE, SamsungBio, Celltrion, TIGER200, … | ≥7 candidates | Confirm from KRX/Notion **before** map lock |
| Unmapped (hold) | Yuhan, Shinsegae, POSCOIntl, KoreanAir, LG, Glovis, SKT, … | ≥7 named in rules | **Hold list** |
| Exclude | `Hyundai_52wL` and derived | ≥1 | Exclude |

**Hold list — unmapped aliases (from rules text; not invented codes):**

| alias | action |
|---|---|
| Yuhan | hold until source confirmation |
| Shinsegae | hold until source confirmation |
| POSCOIntl | hold until source confirmation |
| KoreanAir | hold until source confirmation |
| LG | hold until source confirmation |
| Glovis | hold until source confirmation |
| SKT | hold until source confirmation |
| *(any other snapshot key not in confirmed map)* | hold |

**Could not count:** full set of distinct alias keys across all `price_snapshot_*` files (exports absent).

---

## 4. `stock_report_context.json` → alignment enum

### 4-1. Alignment allowed values (`R-VAL-R15`)

`aligned` | `partial` | `conflict` | `unchecked`

### 4-2. Baseline expectations

| Metric | Count | Notes |
|---|---:|---|
| Context items expected (rules §5-4) | **12** | NAVER, KT, GOOGL, QBTS, SGOV, 로보티즈, 현대차, LG전자, SK하이닉스, 삼성바이오, 셀트리온, TIGER200 |
| Notion equity_analysis pages (incl. buy_plan) | **9** | rules §5-0 |
| Contexts that can attach only if D5 exists | ≤9 | Surplus contexts → hold |
| Alignment labels mapped this run | **unmeasured** | File absent |
| Contexts on hold (no equity_analysis) | **unmeasured** (≥ 12−9 if 1:1) | Must recompute with exports |

**Hold list — context (template):**

| ticker / context key | reason | status |
|---|---|---|
| *(each of 12 without matching equity_analysis)* | Q-20 / R-VAL-R15 — no D5 | **OPEN until export** |
| *(any alignment label outside the 4 values)* | invalid enum | hold / WARN |

Q-33 fields (`plan_status`, `fields`, `history`, `draft`) are **not** mapped in BE-18.

---

## 5. Acceptance checklist (BE-18)

| Requirement | Met? |
|---|---|
| Converter rules document exists | Yes — `docs/rebuild/be-18-converter-rules.md` |
| Dry-run has per-item counts | Yes — §1–§4 (baselines + unmeasured marked) |
| Dry-run has hold lists | Yes — SGOV/QBTS avg/base; journal extract; aliases; context |
| No database writes | **Yes — 0 writes** |
| No FX conversion applied | Yes |
| No guessed codes filled | Yes |
| Hyundai: watch_only + null trigger, no memo notation | Documented |
| I-7 execution | **Not started** (gated) |

---

## 6. Blockers for a complete numeric dry-run

1. **No Notion / JSON source exports** on the agent VM or in `MO_WA` tree.
2. **`stock_report_context.json` missing** — cannot tally alignment values or D5 join.
3. **Journal memo bodies missing** — cannot emit concrete `tickers[]` per 「기타」/empty row.
4. **Alias snapshot key universe missing** — hold list is rules-derived sample, not exhaustive.
5. **Re-count before I-7 required** (`R-MIG-03`): journal 54, positions 9, daily 34, equity 9, weekly 6, realestate 28 (27 migrate + 1 exclude), principles 1, strategy 1.

When exports are available, replace every `unmeasured` / `OPEN until export` cell and re-issue this report; still without writing to any database until I-7 sign-off.
