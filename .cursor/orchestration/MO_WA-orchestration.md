# MO_WA Documentation Orchestration

## Purpose

이 문서는 `.cursor` 하위의 MO_WA 설계 문서들을 제어하고, 구현 순서와 참조 우선순위를 정의한다. 에이전트 또는 개발자는 구현 전 항상 이 문서와 `.cursor/Rules.md`를 함께 확인한다.

## Required First Reads

모든 구현 작업 전 다음 순서로 읽는다.

1. `.cursor/Rules.md`
2. `.cursor/design/DESIGN-apple.md`
3. `.cursor/orchestration/MO_WA-orchestration.md`
4. `.cursor/history/feature-history.md`
5. 작업 영역에 해당하는 세부 설계 문서

## Document Map

| Area | Document | Purpose |
|---|---|---|
| Brand | `.cursor/brand/icon-design.md` | MO_WA M/W 로고와 앱 아이콘 설계 |
| Dashboard | `.cursor/components/dashboard/chart-components.md` | 공통 chart shell과 chart 타입 설계 |
| DataGrid | `.cursor/components/datagrid/datagrid-component.md` | 자산 데이터 입력/조회 grid 설계 |
| Modal | `.cursor/components/modal/popup-modal-component.md` | 데이터 추가/수정/상세 공통 modal 설계 |
| Product | `.cursor/product/feature-implementation.md` | 전체 기능, 자산 카테고리, dashboard 요구사항 |
| History | `.cursor/history/feature-history.md` | 기능 구현 시작/수정 시 로직, 연동, 검증 이력 기록 |
| Architecture | `.cursor/architecture/system-architecture.md` | SvelteKit + Supabase 전체 아키텍처 |
| Auth | `.cursor/auth/login-page.md` | 회원가입 없는 Supabase 로그인 설계 |
| UX | `.cursor/ux/responsive-one-page-ux.md` | 모바일/패드/웹 one-page UX 설계 |

## Implementation Order

### Phase 1. Foundation

- `layout.css`에 DESIGN-apple 기반 Tailwind `@theme` 토큰 적용
- Supabase 패키지 설치와 SSR client 구성
- `hooks.server.ts`, `app.d.ts`, protected route 구성
- 로그인 페이지 구현

### Phase 2. Core UI Components

- `MoWaLogo`
- `Modal`
- `Button`, `Input`, `Select` 등 최소 UI primitives
- `DataGrid` 기본 구조
- `ChartShell`과 공통 chart theme

### Phase 3. Data Model and CRUD

- Supabase tables와 RLS 생성
- `assets`, `asset_valuations`, `liabilities` CRUD
- Asset Add/Edit Modal
- Asset DataGrid 연동

### Phase 4. Dashboard

- Summary cards
- 현재 자산 treemap
- 자산 상승 multi line chart
- cash flow combo chart
- 자산 상세 modal

### Phase 5. Advanced Features

- 목표 순자산
- 월말 snapshot
- CSV import/export
- 만기 알림
- privacy amount toggle
- radar/network chart

## Cross Document Rules

- 차트 구현은 dashboard 문서의 common data types를 우선한다.
- 자산 추가/수정은 modal 문서의 FormModal UX를 따른다.
- DataGrid의 row click은 product 문서의 Asset Detail Modal로 연결한다.
- 로그인과 protected route는 auth 문서와 architecture 문서를 함께 따른다.
- 반응형 레이아웃은 ux 문서를 우선하되 세부 토큰은 DESIGN-apple.md를 따른다.

## Definition of Done

각 구현 단위는 다음을 만족해야 한다.

- Svelte 5 Runes만 사용
- `.cursor/Rules.md` 준수
- `.cursor/history/feature-history.md`에 구현 히스토리 기록
- DESIGN-apple 토큰 사용
- 모바일/패드/데스크톱 동작 확인
- Supabase server/client 분리
- RLS 전제 유지
- `pnpm check` 통과
- 핵심 계산 함수 테스트 포함

## Agent Work Protocol

1. 현재 작업 범위를 이 문서의 Phase 중 하나로 분류한다.
2. 해당 세부 설계 문서를 읽는다.
3. `.cursor/history/feature-history.md`에서 관련 기존 구현 기록을 확인한다.
4. 구현 파일을 만들기 전에 필요한 타입과 데이터 흐름을 먼저 확정한다.
5. 구현 시작 시 또는 구현 완료 전 기능 히스토리 항목을 추가/갱신한다.
6. 컴포넌트는 작은 단위로 만들고, 상위 page에서 조합한다.
7. 여러 문서가 충돌하면 우선순위는 다음과 같다.
   - `.cursor/Rules.md`
   - `.cursor/design/DESIGN-apple.md`
   - 이 오케스트레이션 문서
   - `.cursor/history/feature-history.md`
   - 세부 설계 문서

## Suggested First Implementation Slice

가장 먼저 만들 기능 단위는 다음이다.

1. Supabase SSR 로그인
2. 보호된 `/` dashboard shell
3. `MoWaLogo`, `Modal`, `AssetForm`
4. Supabase `assets` 테이블 CRUD
5. DataGrid에서 자산 추가/조회
6. Summary cards와 Treemap placeholder

이 slice가 완성되면 사용자는 실제 자산을 추가하고 한 페이지에서 기본 순자산을 확인할 수 있다.
