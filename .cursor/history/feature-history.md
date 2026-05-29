# Feature Implementation History

## Purpose

기능 구현을 시작하면 해당 기능의 요구사항, 설계 판단, 구현 로직, 연동 지점, 검증 결과를 히스토리 형식으로 남긴다. 이 문서는 `.cursor/Rules.md`와 `.cursor/orchestration/MO_WA-orchestration.md`를 보완하는 구현 기록 원본이다.

## When to Write

- 새 기능, 주요 UI, API, DB, Supabase 연동을 시작할 때 새 항목을 추가한다.
- 기존 기능을 수정할 때는 같은 기능 항목 아래에 변경 이력을 날짜순으로 추가한다.
- 단순 문구 수정이나 포맷팅처럼 기능 동작이 바뀌지 않는 작업은 생략할 수 있다.

## Entry Format

각 기록은 최신 항목이 위로 오도록 역순으로 작성한다.

```markdown
## YYYY-MM-DD — 기능명

### Context

- 구현 배경:
- 관련 문서:
- 관련 Phase:

### Scope

- 포함:
- 제외:

### Logic and Flow

- 주요 데이터 흐름:
- 핵심 상태/계산 로직:
- UI 상호작용:
- 서버/Supabase 연동:

### Files

- 생성:
- 수정:

### Decisions

- 결정:
- 이유:
- 대안:

### Verification

- 실행한 검증:
- 결과:
- 남은 리스크:
```

## Required Detail Level

- 기능의 사용자가 어떤 흐름으로 동작을 수행하는지 적는다.
- Svelte 컴포넌트, route, server action, Supabase table/RLS, chart/data model 등 연결 지점을 구체적으로 적는다.
- 계산식, 필터링, 권한, 에러 처리처럼 나중에 유지보수자가 재구성하기 어려운 로직은 반드시 남긴다.
- `.env`, service role key, 실제 사용자/환자/개인 식별정보 등 민감 정보는 기록하지 않는다.

## Current History

## 2026-05-29 — Scenario Lab Dashboard Projection

### Context

- 구현 배경: 대시보드를 Scenario Lab 중심 UX로 재배치하고, 고정 수입/지출과 자산별 수익률 기반 미래 자산 흐름 예측을 추가한다.
- 관련 문서: `.cursor/Rules.md`, `.cursor/design/DESIGN-apple.md`, `.cursor/components/dashboard/chart-components.md`, `.cursor/product/feature-implementation.md`
- 관련 Phase: Phase 4 Dashboard, Phase 5 Advanced Features

### Scope

- 포함: `cashflow_items` 저장 모델, 자산 월 납입/납입 종료일, 복리 예측 계산, Scenario Lab 상단 UX, 연 단위 ProjectionChart, 고정 수입/지출 CRUD UI
- 제외: 다중 통화 환율 환산, 명명된 시나리오 저장, 실제 투자 조언/추천 로직

### Logic and Flow

- 주요 데이터 흐름: `+page.server.ts`가 assets/liabilities/cashflow_items를 로드하고, `+page.svelte`가 `buildFutureAssetProjection`으로 5년 예측 series와 KPI를 파생한다.
- 핵심 상태/계산 로직: `normalizeMonthlyCashflow`는 월/년 반복 항목을 월 순현금흐름으로 정규화한다. `buildFutureAssetProjection`은 자산별 `annualRate`를 월 복리율로 환산하고 `monthlyContribution`을 월말 납입으로 반영한 뒤 연 단위 포인트를 생성한다.
- UI 상호작용: Scenario Lab의 CTA는 고정 수입/지출 추가, 자산 추가/수익률 조정, 목표 설정 모달로 연결된다. CashflowList 항목은 수정/삭제 form action으로 저장된다.
- 서버/Supabase 연동: `cashflow_items`는 사용자 소유 RLS 정책을 사용한다. `assets`에는 `monthly_contribution`, `contribution_end_date` 컬럼을 추가했다.

### Files

- 생성: `supabase/migrations/20260529203000_cashflow_projection_inputs.sql`, `src/lib/types/cashflow.ts`, `src/lib/server/cashflows.ts`, `src/lib/components/ui/Icon.svelte`, `src/lib/components/dashboard/ScenarioLab.svelte`, `src/lib/components/dashboard/ProjectionChart.svelte`, `src/lib/components/cashflow/CashflowForm.svelte`, `src/lib/components/cashflow/CashflowList.svelte`
- 수정: `src/routes/+page.svelte`, `src/routes/+page.server.ts`, `src/lib/utils/assetCalculations.ts`, `src/lib/utils/assetCalculations.spec.ts`, `src/lib/types/database.types.ts`, `src/lib/types/asset.ts`, `src/lib/components/datagrid/types.ts`, `src/lib/server/assets.ts`, `src/lib/components/asset/AssetForm.svelte`

### Decisions

- 결정: 고정 수입/지출과 자산별 예측 입력은 Supabase에 저장하고, 예측 기간은 우선 5년 화면 파생값으로 둔다.
- 이유: 사용자가 로그인/기기 변경 후에도 기본 재무 가정을 유지해야 하며, 계산 결과는 입력 변경 때마다 재생성하는 편이 단순하다.
- 대안: local-only 시뮬레이션은 구현이 빠르지만 저장형 자산관리 앱의 기존 데이터 흐름과 맞지 않아 제외했다.

### Verification

- 실행한 검증: `pnpm test:unit --project server -- src/lib/utils/assetCalculations.spec.ts --run`, `pnpm check`, `pnpm lint`
- 결과: server unit tests 13 passed, svelte-check 0 errors / 0 warnings, lint 통과
- 남은 리스크: Supabase migration 적용 후 실제 계정에서 cashflow CRUD와 예측 차트 E2E 확인 필요

## 2026-05-29 — Implementation Backlog Completion

### Context

- 구현 배경: MO_WA 구현 백로그(A~G) 전 항목을 코드·테스트·문서 수준에서 완료한다.
- 관련 문서: `.cursor/orchestration/MO_WA-orchestration.md`, `.cursor/product/feature-implementation.md`
- 관련 Phase: Phase 3~5, 운영 검증, 품질

### Scope

- 포함: Supabase config/migration(profiles trigger, tags, maturity_date), profile upsert on login, liabilities CRUD, asset_categories presets, monthlyChange 실계산, chart-DataGrid filter, maturity alerts, rebalancing/liquidity warning, Radar/Network charts, tags/maturityDate on assets, E2E/README/feature-history
- 제외: 실제 Supabase 프로젝트 연결, 운영 Auth 계정 생성, live E2E with credentials

### Logic and Flow

- Summary: `buildDashboardSummary`가 valuations/snapshots/liabilities를 받아 monthlyChange·monthlyChangeRate 계산
- Liabilities: `liabilities` 테이블 CRUD + AssetDetail 연결 부채 + NetworkChart edges
- Chart filter: Treemap category click / MultiLine legend → `chartFilter` state → `filterRowsByChartSelection`
- Alerts: `buildMaturityAlerts`가 asset.maturityDate + liability.dueAt 60일 이내 항목 표시

### Files

- 생성: `supabase/config.toml`, `supabase/migrations/20260529200000_profiles_trigger_tags_maturity.sql`, `src/lib/server/auth.ts`, `src/lib/server/liabilities.ts`, `src/lib/types/liability.ts`, `src/lib/components/asset/LiabilityForm.svelte`, `src/lib/components/dashboard/charts/RadarChart.svelte`, `src/lib/components/dashboard/charts/NetworkChart.svelte`, `e2e/mo-wa.e2e.ts`
- 수정: `assetCalculations.ts`, `+page.svelte`, `+page.server.ts`, `AssetForm`, `AssetDetail`, `AssetCategorySelector`, `SummaryCards`, `TreemapChart`, `MultiLineChart`, `README.md`, tests

### Verification

- 실행한 검증: `pnpm check`, `pnpm test:unit` (assetCalculations 10 tests + existing 1)
- 결과: svelte-check 0 errors; unit tests 11 passed
- 남은 리스크: Supabase env + migration 적용 후 credential 기반 Playwright E2E

## 2026-05-29 — Supabase MVP Roadmap Implementation

### Context

- 구현 배경: 단계별 구현 계획에 따라 UI-first 대시보드를 Supabase Auth/DB/RLS와 실제 CRUD 기반 MVP로 확장한다.
- 관련 문서: `.cursor/Rules.md`, `.cursor/design/DESIGN-apple.md`, `.cursor/orchestration/MO_WA-orchestration.md`, `.cursor/product/feature-implementation.md`, `.cursor/auth/login-page.md`, `.cursor/components/datagrid/datagrid-component.md`, `.cursor/components/dashboard/chart-components.md`
- 관련 Phase: Phase 1 Foundation, Phase 3 Data Model and CRUD, Phase 4 Dashboard, Phase 5 Advanced Features

### Scope

- 포함: Supabase SSR client, 보호 라우트, 로그인, initial schema/RLS migration, generated-style DB types, asset CRUD form actions, AssetForm/AssetDetail, valuation history insert/load, chart data 변환, D3 기반 SVG chart, goal/snapshot/CSV import/export, privacy amount toggle 유지
- 제외: 실제 Supabase 프로젝트 연결값, 운영 계정 생성, Supabase CLI type generation 실행, browser E2E 로그인 실검증

### Logic and Flow

- 주요 데이터 흐름: `hooks.server.ts`가 Supabase SSR client와 session을 `locals`에 주입하고, `+layout.server.ts`가 `/login` 외 route를 보호한다. `+page.server.ts`는 assets/goals/snapshots/valuations를 로드해 dashboard에 전달한다.
- 핵심 상태/계산 로직: `assetCalculations.ts`가 summary, treemap root, period filter, valuation/cash-flow series, CSV serialization을 계산한다. `+page.svelte`는 `$state()`로 modal/filter/privacy 상태를 관리하고 `$derived()`로 필터링된 rows, summary, chart data를 만든다.
- UI 상호작용: Add/Edit/Delete/Goal/CSV Import는 FormModal 또는 ConfirmModal의 form action으로 저장한다. DataGrid row click은 AssetDetail modal을 열고, 삭제는 확인 modal을 거친다.
- 서버/Supabase 연동: create/update 시 `assets`에 저장하고 `asset_valuations`에 manual valuation을 추가한다. snapshot은 현재 rows와 summary payload를 `snapshots`에 upsert한다. 모든 사용자 데이터 테이블은 `user_id = auth.uid()` RLS 정책을 전제로 한다.

### Files

- 생성: `src/lib/supabase/config.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/admin.ts`, `src/hooks.server.ts`, `src/routes/+layout.server.ts`, `src/routes/login/+page.svelte`, `src/routes/login/+page.server.ts`, `src/routes/+page.server.ts`, `src/lib/types/database.types.ts`, `src/lib/types/asset.ts`, `src/lib/server/assets.ts`, `src/lib/utils/assetCalculations.ts`, `src/lib/utils/assetCalculations.spec.ts`, `src/lib/components/asset/AssetForm.svelte`, `src/lib/components/asset/AssetDetail.svelte`, `src/lib/components/asset/AssetCategorySelector.svelte`, `src/lib/components/dashboard/charts/TreemapChart.svelte`, `src/lib/components/dashboard/charts/MultiLineChart.svelte`, `src/lib/components/dashboard/charts/ComboChart.svelte`, `supabase/migrations/20260529190000_initial_mo_wa_schema.sql`, `.env.example`
- 수정: `package.json`, `pnpm-lock.yaml`, `src/app.d.ts`, `src/routes/+page.svelte`, `src/lib/components/ui/Button.svelte`, `src/lib/components/modal/FormModal.svelte`, `src/lib/components/modal/ConfirmModal.svelte`, `src/lib/components/datagrid/DataGrid.svelte`, `.cursor/history/feature-history.md`

### Decisions

- 결정: Supabase 환경 변수가 없을 때도 `pnpm check`가 가능하도록 public config에 placeholder fallback을 둔다.
- 이유: 로컬 개발자가 실제 Supabase project를 연결하기 전에도 타입/컴포넌트 검증을 실행할 수 있어야 한다.
- 대안: 환경 변수가 없으면 즉시 throw하는 방식은 운영에는 엄격하지만 초기 스캐폴드 검증을 막아 이번 MVP 단계에는 맞지 않는다.

### Verification

- 실행한 검증: `pnpm test:unit --project server -- src/lib/utils/assetCalculations.spec.ts --run`, `pnpm check`
- 결과: 순수 계산 테스트와 Svelte/TypeScript check 통과
- 남은 리스크: 실제 Supabase 인스턴스에서 migration 적용, Auth 계정 생성, 브라우저 기반 로그인/CRUD E2E 검증이 필요하다.

## 2026-05-29 — UI First Dashboard Foundation

### Context

- 구현 배경: Supabase/Auth 연동 전, `.cursor/design/DESIGN-apple.md` 기반의 정적 MO_WA 대시보드 UI 기준 화면을 먼저 구축한다.
- 관련 문서: `.cursor/Rules.md`, `.cursor/design/DESIGN-apple.md`, `.cursor/orchestration/MO_WA-orchestration.md`, `.cursor/ux/responsive-one-page-ux.md`, `.cursor/components/modal/popup-modal-component.md`, `.cursor/components/datagrid/datagrid-component.md`, `.cursor/components/dashboard/chart-components.md`, `.cursor/brand/icon-design.md`
- 관련 Phase: Phase 2 Core UI Components, UI-first preliminary dashboard shell

### Scope

- 포함: DESIGN-apple 토큰 매핑, MO_WA 로고, UI primitive, Modal/FormModal/ConfirmModal, static DataGrid, summary cards, ChartShell, treemap placeholder, one-page dashboard shell
- 제외: Supabase SSR, 로그인, protected route, RLS, 실제 CRUD form action, chart library 도입

### Logic and Flow

- 주요 데이터 흐름: `src/routes/+page.svelte`의 mock `AssetGridRow[]`가 summary cards, treemap placeholder, DataGrid에 전달된다.
- 핵심 상태/계산 로직: `$state()`로 add/detail modal과 privacy toggle을 관리하고, `$derived()`로 총자산, 총부채, 순자산, 유동성 비율을 계산한다.
- UI 상호작용: `자산 추가` 버튼은 FormModal을 열고, DataGrid row click은 자산 상세 FormModal을 연다. 금액 숨김 토글은 화면의 금액 표시를 `••••••`로 전환한다.
- 서버/Supabase 연동: 이번 범위에서는 없음. 이후 Supabase 단계에서 mock rows를 `+page.server.ts` load 결과와 form action으로 교체한다.

### Files

- 생성: `src/lib/assets/mo-wa-logo.svg`, `src/lib/components/brand/MoWaLogo.svelte`, `src/lib/components/ui/Button.svelte`, `src/lib/components/ui/Input.svelte`, `src/lib/components/ui/Select.svelte`, `src/lib/components/ui/PrivacyAmount.svelte`, `src/lib/components/modal/types.ts`, `src/lib/components/modal/Modal.svelte`, `src/lib/components/modal/FormModal.svelte`, `src/lib/components/modal/ConfirmModal.svelte`, `src/lib/components/datagrid/types.ts`, `src/lib/components/datagrid/formatters.ts`, `src/lib/components/datagrid/DataGridToolbar.svelte`, `src/lib/components/datagrid/DataGridEmptyState.svelte`, `src/lib/components/datagrid/DataGrid.svelte`, `src/lib/components/dashboard/DashboardCard.svelte`, `src/lib/components/dashboard/ChartShell.svelte`, `src/lib/components/dashboard/SummaryCards.svelte`, `src/lib/components/dashboard/TreemapPlaceholder.svelte`
- 수정: `src/routes/layout.css`, `src/routes/+page.svelte`, `.cursor/history/feature-history.md`

### Decisions

- 결정: 전체 style은 `DESIGN-apple.md`를 단일 원본으로 삼고, 추가 브랜드 컬러나 장식 그림자 없이 토큰 기반으로 구현한다.
- 이유: `.cursor/Rules.md`가 DESIGN-apple 토큰 준수와 Apple 스타일 일관성을 필수로 요구한다.
- 대안: Supabase foundation을 먼저 구현하는 방식도 가능하지만, 이번 사용자 선택은 UI-first이므로 정적 dashboard shell을 우선했다.

### Verification

- 실행한 검증: `pnpm check`, `pnpm lint`
- 결과: `pnpm check` 0 errors / 0 warnings, `pnpm lint` 통과
- 남은 리스크: 실제 Supabase 데이터, RLS, form action, chart library는 다음 단계에서 연결해야 한다.
