# MO_WA Icon Design Guide

## Purpose

MO_WA는 Money + Wallet의 약자이며, 아이콘은 개인 자산을 한곳에 모아 보는 안정감과 세련된 금융 도구의 인상을 전달한다.

## Core Concept

- 알파벳 `M`과 `W`를 로고 영역에 크게 채운다.
- `M`과 `W`는 서로 겹치되, 복잡한 장식 없이 하나의 추상 심볼처럼 보이게 한다.
- Apple 스타일에 맞춰 불필요한 장식, 그라데이션, 그림자를 사용하지 않는다.
- 작은 크기에서도 `M/W` 실루엣이 읽히도록 획 대비를 단순하게 유지한다.

## Shape Direction

### Primary Mark

- 정사각형 앱 아이콘 캔버스 안에 `M`과 `W`가 거의 꽉 차게 배치된다.
- `M`은 상단 안정감을, `W`는 하단 수납감을 상징한다.
- 두 글자는 중앙 축을 공유하며 일부 획이 겹쳐 하나의 지갑 접힘선처럼 보이게 한다.
- 외곽은 둥근 사각형 앱 아이콘 형태를 사용하되 내부 심볼은 날렵하고 균형 잡힌 직선 기반으로 설계한다.

### Geometry

- 캔버스: 1024 x 1024 기준
- 안전 여백: 전체 폭의 12% 이상
- 심볼 점유율: 전체 폭의 76-82%
- 획 두께: 전체 폭의 8-10%
- 내부 교차부는 너무 얇아지지 않도록 최소 44px 이상 유지

## Color

DESIGN-apple 토큰을 기준으로 한다.

- 기본 배경: `canvas` 또는 `canvas-parchment`
- 기본 심볼: `ink`
- 강조형 심볼: `primary`
- 다크 모드 배경: `surface-black` 또는 `surface-tile-1`
- 다크 모드 심볼: `on-dark`

## Variants

### App Icon

- 배경: `canvas-parchment`
- 심볼: `ink`
- 보조 액센트: 교차부 일부에만 `primary` 적용 가능
- 그림자 금지. OS 앱 아이콘 렌더링이 제공하는 외부 효과만 허용

### Header Logo

- 배경 없이 투명
- 심볼: 현재 표면에 맞춰 `ink`, `on-dark`, `primary` 중 선택
- 텍스트 `MO_WA`가 붙는 경우 심볼 왼쪽, 워드마크 오른쪽 배치

### Favicon

- `M/W` 전체를 모두 표현하기보다 중앙 교차 실루엣을 단순화한다.
- 16px에서도 뭉개지지 않도록 획 수를 줄인다.

## Do

- Apple 스타일처럼 단순하고 고급스럽게 만든다.
- 로고가 금융 앱처럼 신뢰감 있게 보이도록 대칭성과 균형을 우선한다.
- `M`과 `W`가 글자이면서 하나의 추상 지갑 심볼처럼 보이게 한다.

## Don't

- 동전, 지폐, 차트, 지갑 아이콘을 직접적으로 덧붙이지 않는다.
- 장식 그라데이션, 과한 3D, 글로우, 카드 그림자를 넣지 않는다.
- 너무 얇은 획이나 복잡한 겹침으로 작은 크기 가독성을 해치지 않는다.

## Implementation Notes

- 실제 구현 파일 위치: `src/lib/assets/mo-wa-logo.svg`
- SVG는 `currentColor` 기반으로 만들어 컴포넌트에서 색상을 제어한다.
- 아이콘 컴포넌트 위치: `src/lib/components/brand/MoWaLogo.svelte`
- Svelte 컴포넌트는 `$props()`로 `size`, `label`, `variant`를 받는다.
