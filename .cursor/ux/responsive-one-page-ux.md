# Responsive One Page UI/UX Design

## Purpose

MO_WA는 모바일, 패드, 웹브라우저에서 모두 같은 정보를 제공하되, 화면 크기에 따라 밀도와 조작 방식을 바꾼다. 핵심 원칙은 "한 페이지에서 전체 자산을 이해하고, 추가/수정은 모달에서 처리"이다.

## Layout Principle

- 로그인 후 기본 화면은 `/` 단일 대시보드다.
- 페이지 이동 없이 필터, 차트, DataGrid, 상세 Modal로 탐색한다.
- 작은 화면에서는 정보 우선순위를 유지하고 카드/시트 구조로 접는다.
- 모든 터치 타겟은 최소 44 x 44px이다.

## Responsive Breakpoints

DESIGN-apple 기준을 따른다.

- Small phone: 419px 이하
- Phone: 420-640px
- Large phone: 641-735px
- Tablet portrait: 736-833px
- Tablet landscape: 834-1023px
- Small desktop: 1024-1068px
- Desktop: 1069-1440px
- Wide desktop: 1441px 이상

## Page Sections

### 1. Top App Bar

- 왼쪽: MO_WA 로고
- 중앙 또는 왼쪽: 현재 페이지 제목
- 오른쪽: 금액 숨김, 기간 필터, 로그아웃
- 모바일에서는 actions를 overflow menu로 접는다.

### 2. Summary Strip

- 총자산
- 총부채
- 순자산
- 월간 변화
- 목표 달성률

### 3. Main Visualization Area

- 현재 자산 treemap
- 자산 상승 multi line chart
- 현금흐름 combo chart
- 건전성 radar chart

### 4. Data Area

- Asset DataGrid
- 모바일에서는 card list
- row click은 상세 Modal
- add button은 floating action 또는 top action

## Desktop Layout

12컬럼 그리드를 사용한다.

- Summary cards: 12컬럼 전체
- Treemap: 8컬럼
- Quick summary / 목표 / 알림: 4컬럼
- Multi line chart: 12컬럼
- DataGrid: 12컬럼
- 보조 차트는 6컬럼씩 배치

## Tablet Layout

- Summary cards: 2열 또는 horizontal scroll
- Treemap: 전체 폭
- 주요 차트: 1-2열 혼합
- DataGrid: 주요 컬럼만 표시
- Modal: 중앙 panel 또는 넓은 sheet

## Mobile Layout

- Summary cards: 가로 스크롤 카드
- Treemap: 전체 폭, legend 단순화
- 차트는 하나씩 세로 스택
- DataGrid는 card list로 전환
- Add action은 하단 고정 `button-primary`
- Modal은 fullscreen 또는 bottom sheet

## Navigation Model

MO_WA는 한 페이지 앱처럼 보이지만 SvelteKit SSR을 유지한다.

- `/login`: 로그인
- `/`: dashboard
- dashboard 내부 상태는 URL query로 일부 보존 가능
  - `period=1y`
  - `category=investment`
  - `privacy=hidden`

## Data Add UX

1. 사용자가 `자산 추가` 버튼을 누른다.
2. 공통 Modal이 열린다.
3. 자산 유형을 선택한다.
4. 유형에 맞는 필드가 표시된다.
5. 저장하면 Supabase에 반영하고 dashboard 데이터를 갱신한다.
6. 실패하면 Modal 안에 오류를 표시하고 입력값은 유지한다.

## Asset Detail UX

- Treemap 영역 클릭 또는 DataGrid row 클릭
- 상세 Modal에서 다음을 표시
  - 기본 정보
  - 현재가치와 원금
  - 연결 부채
  - 평가 히스토리 mini line chart
  - 메모
  - 수정/삭제 버튼

## Privacy UX

개인 자산 정보 보호를 위해 금액 숨김 토글을 제공한다.

- 금액 숨김 상태: `₩123,456,789` 대신 `••••••`
- 차트 tooltip 금액도 숨김
- 비율과 추세는 표시 가능
- 설정은 localStorage 또는 사용자 프로필에 저장

## Empty State

초기 사용자에게 다음 순서로 행동을 안내한다.

1. 첫 자산 추가
2. 부채가 있다면 연결
3. 월말 스냅샷 저장
4. 목표 순자산 설정

## Accessibility

- 모든 chart는 표 또는 요약 텍스트 fallback 제공
- 키보드로 필터와 DataGrid 조작 가능
- Modal focus trap
- 색상만으로 상승/하락/부채를 구분하지 않는다.

## Visual Tone

- Apple 스타일의 여백과 명료한 타이포그래피 사용
- 금융 앱 특성상 과한 시각 효과보다 신뢰감 우선
- 데이터가 복잡할수록 UI chrome은 줄이고 hierarchy를 명확히 한다.
