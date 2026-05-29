# DataGrid Component Design

## Purpose

DataGrid는 MO_WA에서 모든 자산 데이터를 추가, 수정, 조회하는 공통 입력 표면이다. 부동산, 투자, 현금성 자산, 부채 항목이 모두 같은 컴포넌트를 재사용하되 컬럼 정의와 편집 타입만 바뀌게 한다.

## Component Structure

```
src/lib/components/datagrid/
  DataGrid.svelte
  DataGridToolbar.svelte
  DataGridHeader.svelte
  DataGridRow.svelte
  DataGridCell.svelte
  DataGridPagination.svelte
  DataGridEmptyState.svelte
  editors/
    TextEditor.svelte
    NumberEditor.svelte
    CurrencyEditor.svelte
    DateEditor.svelte
    SelectEditor.svelte
    BooleanEditor.svelte
  types.ts
  formatters.ts
```

## Core Types

```typescript
export type DataGridColumn<T> = {
  id: keyof T & string;
  header: string;
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  editable?: boolean;
  editor?: 'text' | 'number' | 'currency' | 'date' | 'select' | 'boolean';
  options?: Array<{ label: string; value: string }>;
  format?: (value: T[keyof T], row: T) => string;
  validate?: (value: T[keyof T], row: T) => string | null;
};

export type DataGridProps<T> = {
  rows: T[];
  columns: DataGridColumn<T>[];
  rowKey: keyof T & string;
  selectable?: boolean;
  editable?: boolean;
  loading?: boolean;
  pageSize?: number;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onSave?: (row: T) => Promise<void>;
};
```

## Asset Row Model

```typescript
export type AssetGridRow = {
  id: string;
  category: 'real_estate' | 'investment' | 'cash' | 'liability';
  subcategory: string;
  name: string;
  institution?: string;
  principalAmount: number;
  currentValue: number;
  currency: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
  valuationDate: string;
  annualRate?: number;
  memo?: string;
};
```

## Required Features

- 컬럼 기반 렌더링
- 정렬, 필터, 검색
- 페이지네이션 또는 가상 스크롤
- 행 선택과 일괄 삭제
- 인라인 편집 또는 모달 편집 연동
- 통화, 퍼센트, 날짜 포맷
- 모바일 카드 모드
- 로딩, 빈 상태, 오류 상태
- Supabase 저장 실패 시 행 단위 오류 표시

## Editing Strategy

MO_WA의 기본 데이터 추가는 공통 팝업 모달에서 처리한다. DataGrid는 다음 두 가지 편집 모드를 지원한다.

1. `modal`: 행 추가/수정 버튼 클릭 시 공통 Modal을 열어 AssetForm을 표시
2. `inline`: 빠른 금액 수정처럼 작은 변경만 셀 내부에서 처리

초기 구현은 `modal`을 기본으로 한다.

## Visual Style

- 컨테이너: `store-utility-card`와 동일한 표면
- 헤더: `caption-strong`
- 셀 텍스트: `caption` 또는 좁은 화면에서는 `body`
- 행 높이: 데스크톱 48px 이상, 터치 환경 56px 이상
- 선택 상태: `primary-focus` 2px outline 또는 왼쪽 accent bar
- 그림자 금지, hairline border 사용

## Responsive Behavior

### Mobile

- 표 형태 대신 카드 리스트로 표시
- 핵심 필드: 이름, 현재가치, 카테고리, 평가일
- 보조 필드는 펼침 패널로 표시
- 행 액션은 `button-icon-circular` 또는 하단 action sheet

### Tablet

- 주요 컬럼 5-7개 표시
- 덜 중요한 컬럼은 column visibility 메뉴에서 숨김

### Desktop

- 전체 컬럼 표시
- sticky header
- toolbar에 검색, 필터, 내보내기, 추가 버튼 배치

## Supabase Integration

- 읽기: `+page.server.ts`에서 사용자별 자산 목록 로드
- 쓰기: form action 또는 `+server.ts` endpoint 사용
- RLS: `user_id = auth.uid()` 정책 필수
- optimistic update는 저장 성공 후 반영하는 방식으로 시작한다.

## Accessibility

- `role="grid"` 또는 semantic `table` 사용
- 키보드 이동: Arrow keys, Enter edit, Escape cancel
- 정렬 버튼에 `aria-sort` 제공
- 삭제 액션은 확인 모달을 사용한다.

## Svelte 5 Rules

- `rows`, `columns`는 `$props()`
- sort state, filters, selected rows는 `$state()`
- visible rows, paged rows, totals는 `$derived()`
- 외부 저장 이벤트는 callback props로 전달한다.
