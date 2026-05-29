# Dashboard Chart Components Design

## Purpose

MO_WA의 대시보드는 한 페이지에서 자산 분포, 변화, 위험, 관계를 빠르게 이해하게 해야 한다. 모든 차트는 공통 컨테이너와 공통 데이터 인터페이스를 공유하고, 차트 타입만 바꿔 재사용한다.

## Component Structure

```
src/lib/components/dashboard/
  DashboardCard.svelte
  ChartShell.svelte
  ChartLegend.svelte
  ChartTooltip.svelte
  charts/
    PieChart.svelte
    LineChart.svelte
    BarChart.svelte
    ComboChart.svelte
    MultiLineChart.svelte
    MultiBarChart.svelte
    MultiComboChart.svelte
    TreemapChart.svelte
    RadarChart.svelte
    NetworkChart.svelte
  types.ts
  chartTheme.ts
```

## Common Shell

`ChartShell`은 모든 차트의 공통 프레임이다.

### Props

```typescript
type ChartShellProps = {
  title: string;
  description?: string;
  valueLabel?: string;
  periodLabel?: string;
  actions?: Snippet;
  children: Snippet;
};
```

### Style

- 배경: `canvas`
- 반경: `rounded-lg`
- 테두리: `hairline`
- 그림자 없음
- 제목: `body-strong`
- 설명: `caption`
- 액션 버튼: `button-pearl-capsule` 또는 `button-primary`

## Common Data Types

```typescript
export type ChartPoint = {
  x: string | number | Date;
  y: number;
  label?: string;
  category?: string;
};

export type ChartSeries = {
  id: string;
  name: string;
  type?: 'line' | 'bar' | 'area';
  colorToken?: string;
  points: ChartPoint[];
};

export type HierarchyNode = {
  id: string;
  name: string;
  value: number;
  kind: 'asset' | 'liability' | 'category' | 'account';
  children?: HierarchyNode[];
};

export type NetworkNode = {
  id: string;
  label: string;
  group: string;
  value?: number;
};

export type NetworkEdge = {
  source: string;
  target: string;
  value?: number;
  label?: string;
};
```

## Required Chart Types

### Pie Chart

- 용도: 자산 대분류 비중 표시
- 데이터: `ChartPoint[]`
- 사용 예: 부동산 / 투자 / 현금성 / 부채 비중
- 작은 화면에서는 도넛 중앙 라벨을 숨기고 legend 중심으로 전환

### Line Chart

- 용도: 단일 자산의 시간별 평가액 변화
- 데이터: `ChartSeries`
- 사용 예: 특정 아파트, 특정 주식, 특정 예금 잔액 추이

### Bar Chart

- 용도: 월별 입출금, 자산별 증감액 비교
- 데이터: `ChartSeries`
- 음수 값은 부채 또는 손실로 표시

### Line + Bar Combo Chart

- 용도: 누적 자산은 line, 월별 변화량은 bar로 표시
- 데이터: `ChartSeries[]`, 각 series에 `type` 지정
- y축은 좌측 금액, 우측 변화율을 지원할 수 있다.

### Multi Line Chart

- 용도: 여러 자산의 상승 그래프를 동시에 비교
- 데이터: `ChartSeries[]`
- 사용 예: 주식, 비트코인, 부동산 평가액의 기간별 변화
- legend에서 series on/off 토글 가능

### Multi Bar Chart

- 용도: 자산 카테고리별 월간 증감액 비교
- 그룹형과 스택형을 지원한다.

### Multi Line + Bar Combo Chart

- 용도: 전체 순자산 line + 카테고리별 월간 변화 bar
- 재무 추세를 가장 많이 설명하는 핵심 차트로 사용한다.

### Treemap Chart

- 용도: 현재 자산 분포를 면적으로 표현
- 데이터: `HierarchyNode`
- 필수 사용 위치: 메인 대시보드 상단
- 부채는 같은 트리 안에서 별도 색상 또는 패턴으로 구분한다.

### Radar Chart

- 용도: 자산 건전성 스코어
- 축 예시: 유동성, 성장성, 안정성, 분산도, 부채 부담, 현금흐름
- 점수는 0-100 기준

### Network Chart

- 용도: 계좌, 자산, 부채, 기관 간 관계 표현
- 예시: 은행 계좌 -> 대출 -> 부동산 / 증권 계좌 -> 주식 종목
- 복잡한 관계는 기본 접힘 상태로 시작한다.

## Responsive Behavior

- 모바일: 차트 카드 1열, legend는 하단, tooltip은 탭 기반 고정 패널
- 패드: 2열 카드, 핵심 treemap은 전체 폭
- 데스크톱: 12컬럼 그리드, treemap 8컬럼 + summary 4컬럼
- 터치 타겟은 최소 44 x 44px

## Interaction

- hover와 touch 모두 tooltip을 지원한다.
- legend 클릭으로 series 표시/숨김을 지원한다.
- 기간 필터: 1M, 3M, 6M, YTD, 1Y, ALL
- 차트 클릭 시 해당 자산 상세 또는 DataGrid 필터로 연결한다.

## Library Direction

초기 구현은 `LayerCake` 또는 `D3` 기반 중 하나를 선택한다. Svelte 통합성과 커스텀 렌더링이 중요하므로 chart wrapper를 얇게 유지하고, 도메인 데이터 변환은 `src/lib/components/dashboard/chartData.ts` 같은 순수 함수로 분리한다.

## Svelte 5 Rules

- props는 `$props()` 사용
- visible series, selected point는 `$state()` 사용
- scale, totals, formatted data는 `$derived()` 사용
- ResizeObserver, chart subscription은 `$effect()`에서 cleanup 반환
