# MO_WA Feature Implementation Guide

## Product Goal

MO_WA는 부동산, 투자, 현금성 자산, 부채를 한 페이지에서 관리하는 개인 자산 관리 프로그램이다. 사용자는 현재 순자산, 자산 분포, 자산별 상승 추이, 부채 현황, 데이터 원천을 빠르게 파악하고 필요한 항목을 모달로 추가한다.

## One Page Principle

로그인 후 핵심 서비스는 단일 대시보드 페이지에서 동작한다.

- 모든 자산 요약을 같은 화면에서 확인
- 자산 추가/수정/삭제는 공통 Modal 사용
- 차트와 DataGrid는 같은 필터 상태를 공유
- 자산 항목 클릭 시 페이지 이동 대신 상세 Modal 표시

## Asset Categories

### Real Estate

- 아파트
- 오피스텔
- 토지
- 상가
- 전세보증금
- 기타 직접 추가 항목

### Investment

- 국내 주식
- 해외 주식
- ETF
- 비트코인
- 기타 가상자산
- 채권
- 어음
- 금
- 은
- 기타 직접 추가 항목

### Cash

- 입출금
- 예금
- 적금
- 파킹통장
- CMA
- MMF
- 현금
- 기타 직접 추가 항목

### Liability

부채는 전체 자산에 포함하되, 각 자산 항목을 눌렀을 때 자산과 구분되어 표시한다.

- 주택담보대출
- 전세대출
- 신용대출
- 카드대금
- 마이너스통장
- 투자 관련 대출
- 기타 직접 추가 항목

## Dashboard Sections

### 1. Global Summary

- 총자산
- 총부채
- 순자산
- 전월 대비 증감액
- 전월 대비 증감률
- 유동성 자산 비율

### 2. Current Asset Treemap

- 현재 자산 분포를 treemap으로 표현
- 대분류: 부동산 / 투자 / 현금성 / 부채
- 하위 분류: 사용자가 추가한 카테고리 포함
- 부채는 음수 또는 별도 패턴으로 시각적으로 구분

### 3. Asset Growth Multi Line Chart

- 각 자산의 상승 그래프를 다수 line 차트로 표현
- 기간 필터: 1M, 3M, 6M, YTD, 1Y, ALL
- legend에서 자산별 표시/숨김 가능

### 4. Cash Flow and Change

- 월별 자산 변화: bar chart
- 누적 순자산: line chart
- 필요 시 line + bar 혼합 차트 사용

### 5. Asset DataGrid

- 모든 자산 데이터를 추가/수정/삭제
- 카테고리, 하위 카테고리, 기관, 원금, 현재가치, 평가일, 메모 표시
- 행 클릭 시 상세 Modal
- 추가 버튼 클릭 시 Asset Add Modal

### 6. Liability Detail

- 특정 자산과 연결된 부채를 상세 Modal에서 표시
- 예: 부동산 상세 안에서 해당 담보대출 표시
- 총자산, 연결 부채, 순가치 계산

## Additional Features

개인 자산 관리 서비스에서 유용한 기능을 MO_WA 범위에 맞게 추가한다.

- 목표 순자산 설정과 달성률
- 월별 평가액 히스토리 기록
- 자산 리밸런싱 비율 확인
- 유동성 부족 경고
- 만기 알림: 예금, 적금, 채권, 대출
- 수익률 계산: 원금 대비 현재가치
- 통화별 평가: KRW 기본, USD와 crypto 단위 지원
- 메모와 태그
- CSV import/export
- 스냅샷 저장: 월말 자산 상태 고정
- 개인정보 보호 모드: 금액 숨김 토글

## Main Route

```
src/routes/
  +layout.svelte
  +layout.server.ts
  login/+page.svelte
  login/+page.server.ts
  +page.svelte              # one-page dashboard
  +page.server.ts
```

## Core Components

```
src/lib/components/
  brand/MoWaLogo.svelte
  dashboard/*
  datagrid/*
  modal/*
  asset/
    AssetSummaryCards.svelte
    AssetForm.svelte
    AssetDetail.svelte
    AssetCategorySelector.svelte
    PrivacyAmount.svelte
```

## Data Flow

1. `+page.server.ts`에서 Supabase로 사용자 자산과 평가 히스토리를 로드한다.
2. 서버 load 결과를 `+page.svelte`가 `$props()`로 받는다.
3. 대시보드 컴포넌트가 `$derived()`로 summary, treemap data, chart series를 계산한다.
4. 추가/수정은 Modal -> form action -> Supabase -> invalidate 순서로 처리한다.
5. 차트 클릭과 DataGrid 필터는 같은 `$state()` 기반 filter state를 공유한다.

## Supabase Tables

- `profiles`: 로그인 사용자 프로필
- `asset_categories`: 사용자 정의 카테고리
- `assets`: 자산 기본 정보
- `asset_valuations`: 날짜별 평가액
- `liabilities`: 부채 기본 정보
- `liability_payments`: 부채 상환 히스토리
- `snapshots`: 월말 자산 스냅샷
- `goals`: 목표 순자산

## Implementation Priority

1. 로그인과 보호 라우트
2. Supabase schema와 RLS
3. 디자인 토큰과 레이아웃
4. Modal과 AssetForm
5. DataGrid
6. Summary와 Treemap
7. Multi line chart
8. 나머지 차트와 고급 기능
