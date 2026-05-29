# MO_WA 프로젝트 구현 가이드

> **모든 구현 작업 전에 이 문서를 먼저 읽고 따른다.**
> 디자인 토큰·컴포넌트 스펙의 원본은 [`.cursor/design/DESIGN-apple.md`](./design/DESIGN-apple.md) 이다.

---

## 1. 작업 순서 (필수)

기능·UI·API·DB 작업을 시작하기 **전에** 다음 순서를 따른다.

1. **이 문서** (`.cursor/Rules.md`) — 아키텍처·컨벤션 확인
2. **디자인 스펙** (`.cursor/design/DESIGN-apple.md`) — 색·타이포·컴포넌트 토큰 확인
3. **MO_WA 오케스트레이션** (`.cursor/orchestration/MO_WA-orchestration.md`) — 기능별 설계 문서와 구현 순서 확인
4. **기능 구현 히스토리** (`.cursor/history/feature-history.md`) — 기존 구현 기록과 기록 방식 확인
5. **기존 코드** — `$lib/`, `src/routes/` 패턴 재사용
6. **구현** — 아래 규칙에 맞게 작성

토큰 값은 DESIGN 문서의 YAML을 기준으로 하며, hex·px를 컴포넌트에 하드코딩하지 않는다.

### MO_WA 세부 설계 문서

| 영역 | 문서 |
|---|---|
| 로고/아이콘 | `.cursor/brand/icon-design.md` |
| 대시보드 차트 | `.cursor/components/dashboard/chart-components.md` |
| DataGrid | `.cursor/components/datagrid/datagrid-component.md` |
| 공통 Modal | `.cursor/components/modal/popup-modal-component.md` |
| 기능 구현 | `.cursor/product/feature-implementation.md` |
| 기능 구현 히스토리 | `.cursor/history/feature-history.md` |
| 시스템 아키텍처 | `.cursor/architecture/system-architecture.md` |
| 로그인 | `.cursor/auth/login-page.md` |
| 반응형 One Page UX | `.cursor/ux/responsive-one-page-ux.md` |

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| FE 프레임워크 | **SvelteKit 2** + **Svelte 5 (Runes)** | `svelte.config.js`에서 runes 강제 |
| 스타일 | **Tailwind CSS v4** | `src/routes/layout.css`에서 `@theme` 토큰 정의 |
| 언어 | **TypeScript** | strict |
| 패키지 매니저 | **pnpm** | npm/yarn 사용 금지 |
| BE / BaaS | **Supabase** | Auth, Postgres, Storage, Realtime |
| 테스트 | Vitest + Playwright | 기존 스크립트 유지 |

---

## 3. 디자인 시스템 (Apple)

디자인 철학: **제품(콘텐츠)이 주인공, UI는 최소**. 단일 액센트 컬러 Action Blue, 장식 그라데이션·카드 그림자 금지.

### 3.1 CSS 토큰 (`src/routes/layout.css`)

Tailwind v4 `@theme` 블록에 DESIGN-apple 토큰을 매핑한다. 예시:

```css
@import 'tailwindcss';

@theme {
  /* Brand */
  --color-primary: #0066cc;
  --color-primary-focus: #0071e3;
  --color-primary-on-dark: #2997ff;

  /* Surface */
  --color-canvas: #ffffff;
  --color-canvas-parchment: #f5f5f7;
  --color-surface-pearl: #fafafc;
  --color-surface-tile-1: #272729;
  --color-surface-tile-2: #2a2a2c;
  --color-surface-tile-3: #252527;
  --color-surface-black: #000000;

  /* Text */
  --color-ink: #1d1d1f;
  --color-ink-muted-80: #333333;
  --color-ink-muted-48: #7a7a7a;
  --color-body-muted: #cccccc;

  /* Border */
  --color-hairline: #e0e0e0;
  --color-divider-soft: #f0f0f0;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 11px;
  --radius-lg: 18px;
  --radius-pill: 9999px;

  /* Spacing */
  --spacing-section: 80px;

  /* Shadow — product imagery only */
  --shadow-product: 3px 5px 30px 0 rgba(0, 0, 0, 0.22);

  /* Font */
  --font-display: 'SF Pro Display', system-ui, -apple-system, sans-serif;
  --font-text: 'SF Pro Text', system-ui, -apple-system, sans-serif;
}
```

유틸 클래스 예: `bg-primary`, `text-ink`, `rounded-pill`, `font-display`.

### 3.2 타이포그래피 규칙

- 본문: **17px / 400 / line-height 1.47** — 16px 사용 금지
- 헤드라인: **weight 600**, display 크기에서 **negative letter-spacing**
- weight **500 사용 금지** — 300 / 400 / 600 / 700 만 사용
- 폰트: macOS/iOS는 system-ui, 그 외는 Inter 대체 (DESIGN 문서 참고)

### 3.3 컴포넌트 스타일 원칙

| 규칙 | 내용 |
|---|---|
| 액센트 | 모든 인터랙션은 `--color-primary` (#0066cc) 하나만 |
| 그림자 | **제품 이미지에만** `--shadow-product` 적용 |
| 버튼 active | `transform: scale(0.95)` |
| 버튼 focus | `outline: 2px solid var(--color-primary-focus)` |
| 섹션 구분 | light ↔ dark tile 색 교차, border/shadow로 구분하지 않음 |
| pill CTA | `rounded-pill` — primary action 전용 문법 |

컴포넌트별 스펙(`button-primary`, `product-tile-dark`, `global-nav` 등)은 DESIGN-apple.md `components:` 섹션을 따른다.

### 3.4 UI 컴포넌트 위치

```
src/lib/components/
  ui/           # Button, Link, Input 등 원자 컴포넌트
  layout/       # GlobalNav, SubNav, Footer
  sections/     # ProductTile, StoreUtilityCard 등
```

- 스타일: Tailwind 유틸 + 필요 시 `<style>` (컴포넌트 스코프)
- variant는 prop으로 (`variant="primary" | "secondary-pill" | "dark-utility"`)
- DESIGN 문서의 컴포넌트 키 이름과 1:1 매핑 권장

---

## 4. Svelte 5 + Runes 규칙

프로젝트는 **Runes 모드 강제** (`svelte.config.js`). Svelte 4 문법 사용 금지.

### 4.1 사용할 Runes

| Rune | 용도 |
|---|---|
| `$props()` | 컴포넌트 props |
| `$state()` | 로컬 반응형 상태 |
| `$derived()` | 계산된 값 |
| `$effect()` | 사이드 이펙트 (DOM·구독) |
| `$bindable()` | 양방향 바인딩 prop |

### 4.2 금지 / 대체

```svelte
<!-- ❌ Svelte 4 -->
<script>
  export let name;
  let count = 0;
  $: doubled = count * 2;
</script>

<!-- ✅ Svelte 5 Runes -->
<script lang="ts">
  let { name }: { name: string } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

- `createEventDispatcher` → callback props (`onclick`, `onchange`)
- `$$props` / `$$restProps` → `$props()` destructuring + spread
- `onMount` → `$effect` (cleanup 반환)
- stores (`writable`/`derived`) → `$state` / `$derived` (전역 필요 시에만 store 유지)

### 4.3 SvelteKit 패턴

```svelte
<!-- +page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>
```

```typescript
// +page.server.ts — 서버 데이터 로드
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data, error } = await locals.supabase.from('items').select('*');
  if (error) throw error;
  return { items: data };
};
```

```typescript
// +page.ts — 클라이언트 전용 fetch (필요 시)
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, depends }) => {
  depends('items');
  const res = await fetch('/api/items');
  return { items: await res.json() };
};
```

### 4.4 파일·네이밍

- 컴포넌트: `PascalCase.svelte`
- 유틸/타입: `camelCase.ts`
- 라우트: SvelteKit 파일 기반 라우팅 (`+page.svelte`, `+layout.svelte`, `+server.ts`)
- `$lib/` alias 사용 (`$lib/components`, `$lib/supabase`, `$lib/types`)

---

## 5. Supabase 연동

### 5.1 패키지

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

### 5.2 환경 변수 (`.env` — git 커밋 금지)

```env
PUBLIC_SUPABASE_URL=https://<project>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # 서버 전용, 클라이언트 노출 금지
```

`src/app.d.ts`에 `locals.supabase` 타입을 선언한다.

### 5.3 권장 디렉터리

```
src/lib/supabase/
  client.ts          # 브라우저 클라이언트 (createBrowserClient)
  server.ts          # 서버 클라이언트 (createServerClient)
  admin.ts           # service role (서버 전용, RLS 우회 — 최소 사용)
src/lib/types/
  database.types.ts  # supabase gen types typescript
src/hooks.server.ts  # supabase SSR 세션 + locals 주입
```

### 5.4 클라이언트 / 서버 분리

| 계층 | Supabase 클라이언트 | 용도 |
|---|---|---|
| `+page.server.ts`, `+server.ts`, `hooks.server.ts` | `createServerClient` | 인증 세션, RLS 보호 데이터 |
| `.svelte` (클라이언트) | `createBrowserClient` | Realtime, 클라이언트 Auth UI |
| 서버 전용 admin 작업 | `createClient` + service role | 마이그레이션·배치 (최소화) |

**원칙:** DB 쓰기·민감 조회는 가능한 한 `+page.server.ts` / `+server.ts`에서 처리. 클라이언트에 service role key 노출 금지.

### 5.5 Auth (SSR)

```typescript
// hooks.server.ts 개요
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { /* getAll / setAll */ } }
  );
  const { data: { session } } = await event.locals.supabase.auth.getSession();
  event.locals.session = session;
  return resolve(event);
};
```

- 로그인/회원가입 UI: `$lib/components/auth/` + `$effect`로 세션 구독
- 보호 라우트: `+layout.server.ts`에서 `session` 확인 후 redirect

### 5.6 데이터 접근 패턴

```typescript
// 읽기 — +page.server.ts
const { data, error } = await locals.supabase
  .from('products')
  .select('id, name, price')
  .order('created_at', { ascending: false });

// 쓰기 — form action (+page.server.ts)
export const actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();
    const { error } = await locals.supabase.from('products').insert({ ... });
    if (error) return fail(400, { error: error.message });
    return { success: true };
  }
};
```

- Form action 우선 (progressive enhancement)
- Realtime 필요 시 `$effect` + `supabase.channel().subscribe()`
- 타입: `supabase gen types typescript --project-id <id> > src/lib/types/database.types.ts`

### 5.7 Storage

- Public bucket: 제품 이미지 CDN URL
- Private bucket: signed URL (`createSignedUrl`) — 서버에서 생성
- 업로드: `+server.ts` 또는 form action에서 처리

### 5.8 RLS

- 모든 테이블 **RLS 활성화** 기본
- anon key는 RLS 정책으로만 접근
- service role은 admin·마이그레이션에만 사용

---

## 6. 프로젝트 구조

```
src/
  lib/
    components/     # UI 컴포넌트
    supabase/       # Supabase 클라이언트
    types/          # DB·도메인 타입
    utils/          # 순수 함수
  routes/
    +layout.svelte
    +layout.server.ts   # (필요 시) 전역 session
    layout.css          # @theme 디자인 토큰
    api/                # +server.ts REST 엔드포인트
  hooks.server.ts       # Supabase SSR
  app.d.ts              # Locals 타입
  app.html
```

---

## 7. 구현 체크리스트

새 기능 PR 전 확인:

- [ ] `.cursor/Rules.md` 와 DESIGN-apple.md 토큰 준수
- [ ] 기능 구현 시작/수정 시 `.cursor/history/feature-history.md`에 구현 히스토리 기록
- [ ] Svelte 5 Runes만 사용 (Svelte 4 API 없음)
- [ ] hex/px 하드코딩 없음 — CSS 변수·Tailwind 토큰 사용
- [ ] Supabase: 서버/클라이언트 클라이언트 분리, RLS 적용
- [ ] 민감 key·`.env` 커밋 없음
- [ ] `pnpm check` / `pnpm lint` 통과
- [ ] 터치 타겟 최소 44×44px (DESIGN responsive 섹션)

---

## 8. Do's and Don'ts (요약)

### Do

- DESIGN-apple.md 컴포넌트 키를 prop variant 이름으로 재사용
- light/dark product tile 교차로 섹션 리듬 구성
- body 17px, headline weight 600, primary blue 단일 액센트
- Supabase 타입 생성 후 `$lib/types/database.types.ts` import

### Don't

- 두 번째 브랜드 컬러·장식 그라데이션·카드/버튼 box-shadow 추가
- Svelte 4 `export let`, `$:`, `createEventDispatcher`
- 클라이언트에서 service role key 사용
- DESIGN 문서와 다른 border-radius 문법 혼용 (pill / sm / lg / md 만)

---

## 9. 참고 링크

- [DESIGN-apple.md](./design/DESIGN-apple.md) — 디자인 토큰 원본
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)
- [SvelteKit Load](https://svelte.dev/docs/kit/load)
- [Supabase SSR (SvelteKit)](https://supabase.com/docs/guides/auth/server-side/sveltekit)
- [Tailwind CSS v4 @theme](https://tailwindcss.com/docs/theme)
