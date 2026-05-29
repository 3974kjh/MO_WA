# Popup Modal Component Design

## Purpose

MO_WA는 한 페이지에서 모든 정보를 보여주고, 데이터 추가와 수정은 공통 팝업 모달 컴포넌트를 통해 처리한다. Modal은 자산 추가, 부채 추가, 자산 상세, 삭제 확인, 필터 설정, 로그인 오류 안내에 재사용된다.

## Component Structure

```
src/lib/components/modal/
  Modal.svelte
  ModalHeader.svelte
  ModalBody.svelte
  ModalFooter.svelte
  ConfirmModal.svelte
  FormModal.svelte
  useModal.ts
  types.ts
```

## Core Props

```typescript
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';

export type ModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  size?: ModalSize;
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  onClose: () => void;
  children: Snippet;
  footer?: Snippet;
};
```

## Modal Variants

### FormModal

- 자산 추가/수정에 사용
- header, body, footer 구조 고정
- footer에는 취소와 저장 버튼 배치
- 저장 버튼은 `button-primary`

### ConfirmModal

- 삭제, 초기화, 로그아웃 등 확인이 필요한 액션에 사용
- 위험 액션도 별도 빨간색을 만들지 않고 텍스트와 문구로 경고한다.
- 기본 버튼 체계는 DESIGN-apple의 primary/secondary pill을 따른다.

### DetailModal

- 자산 항목 클릭 시 부채, 히스토리, 메모, 연결 계좌를 표시
- 상세 안에서 DataGrid 또는 chart mini view를 포함할 수 있다.

## Asset Add Modal

자산 추가 모달은 다음 단계형 섹션을 한 화면 안에서 구성한다.

1. 자산 유형 선택: 부동산 / 투자 / 현금성 / 부채
2. 하위 카테고리 선택 또는 직접 추가
3. 기본 정보: 이름, 기관, 메모
4. 금액 정보: 원금, 현재가치, 통화, 평가일
5. 부채 연결: 특정 자산에 연결된 대출 또는 일반 부채 선택

## Visual Style

- backdrop: `surface-black` 28-36% opacity
- panel background: `canvas`
- radius: `rounded-lg`
- border: `hairline`
- shadow는 최소화한다. Apple 규칙상 카드 그림자는 피하고, modal depth는 backdrop과 위치로 표현한다.
- title: `display-md` 또는 작은 모달에서는 `tagline`
- body: `body`
- footer: 상단 hairline, 우측 버튼 정렬

## Responsive Behavior

### Mobile

- `fullscreen` 또는 bottom sheet 형태
- safe-area inset 지원
- footer는 하단 sticky
- 입력 필드는 1열

### Tablet

- `md` 또는 `lg` panel
- 입력 필드는 2열 가능

### Desktop

- 최대 폭: sm 420px, md 560px, lg 720px, xl 960px
- 화면 중앙 정렬

## Interaction

- focus trap 필수
- Escape 닫기 지원
- backdrop click은 `closeOnBackdrop`이 true일 때만
- 열릴 때 첫 입력 또는 닫기 버튼에 focus
- 닫힐 때 trigger element로 focus 복원
- 저장 중에는 버튼 disabled + loading label 표시

## Accessibility

- `role="dialog"`
- `aria-modal="true"`
- `aria-labelledby`, `aria-describedby` 연결
- 스크린리더에서 오류 메시지를 읽을 수 있도록 `aria-live` 사용

## Svelte 5 Rules

- `open`, `title`, `size`는 `$props()`
- 내부 focus target과 animation state는 `$state()`
- body scroll lock, keydown listener는 `$effect()`에서 cleanup
- submit, close, confirm은 callback props로 전달한다.
