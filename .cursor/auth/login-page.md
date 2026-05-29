# Login Page Implementation Guide

## Purpose

MO_WA는 개인 자산 관리 프로그램이므로 로그인 후에만 접근 가능하다. 회원가입 기능은 구현하지 않고, Supabase Auth에 관리자가 직접 등록한 아이디와 패스워드가 일치하는 경우에만 로그인된다.

## User Flow

1. 사용자가 `/login`에 접근한다.
2. 이메일 또는 아이디와 패스워드를 입력한다.
3. Supabase Auth `signInWithPassword`를 호출한다.
4. 성공 시 `/` 대시보드로 이동한다.
5. 실패 시 로그인 페이지에 일반 오류 메시지를 표시한다.

## Routes

```
src/routes/login/
  +page.svelte
  +page.server.ts
```

## Supabase Setup

- Supabase Dashboard에서 사용자 계정을 직접 생성한다.
- Email provider를 활성화한다.
- 회원가입 링크, magic link, OAuth는 초기 범위에서 제외한다.
- 패스워드 재설정은 관리자 수동 처리로 시작한다.

## Server Action

로그인은 server action에서 처리한다.

```typescript
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data } = await locals.supabase.auth.getSession();
  if (data.session) redirect(303, '/');
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { message: '아이디와 패스워드를 입력해 주세요.', email });
    }

    const { error } = await locals.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return fail(400, {
        message: '아이디 또는 패스워드를 확인해 주세요.',
        email
      });
    }

    redirect(303, '/');
  }
};
```

## Page UI

### Layout

- 전체 화면 중앙 정렬
- 상단에 MO_WA 로고
- 제목: "MO_WA"
- 보조 문구: "Money and Wallet in one place"
- 입력: 아이디(email), 패스워드
- 버튼: 로그인

### Apple Style

- 배경: `canvas-parchment`
- 로그인 카드: `canvas`, `rounded-lg`, `hairline`
- CTA: `button-primary`
- 입력: `search-input` 스타일 기반 pill input
- 오류: `caption` 텍스트, 색상은 과한 red 대신 `ink`와 아이콘/문구로 표현한다. 필요 시 접근성 목적의 error token을 별도 추가한다.

## Protected Routes

`src/routes/+layout.server.ts`에서 session을 확인한다.

```typescript
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const { data } = await locals.supabase.auth.getSession();

  if (!data.session && url.pathname !== '/login') {
    redirect(303, '/login');
  }

  return {
    session: data.session
  };
};
```

## Logout

- dashboard 상단 utility menu에 로그아웃 버튼 배치
- server action 또는 endpoint에서 `locals.supabase.auth.signOut()` 호출
- 성공 후 `/login`으로 redirect

## Accessibility

- `label`과 input 연결
- 오류 메시지는 `aria-live="polite"`
- 로그인 버튼은 submit 중 disabled
- 키보드만으로 모든 입력과 제출 가능

## Security

- 로그인 실패 이유를 상세히 노출하지 않는다.
- 회원가입 기능을 숨기는 것이 아니라 구현하지 않는다.
- Supabase Auth 사용자를 직접 등록하는 운영 절차를 별도 문서화한다.
- service role key는 로그인 플로우에 사용하지 않는다.

## Svelte 5 Rules

- form state가 필요하면 `$state()` 사용
- derived validation message는 `$derived()` 사용
- action 결과는 SvelteKit form action 결과를 사용한다.
