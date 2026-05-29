# MO_WA System Architecture

## Architecture Goal

MO_WA는 SvelteKit 2, Svelte 5 Runes, Tailwind CSS v4, Supabase를 기반으로 한 개인 자산 관리 웹 앱이다. 프론트엔드는 단일 대시보드 중심으로 구성하고, 백엔드는 Supabase Auth, Postgres, Storage, RLS를 사용한다.

## High Level Structure

```
Browser
  -> SvelteKit routes
    -> Server load / form actions
      -> Supabase SSR client
        -> Supabase Auth
        -> Supabase Postgres with RLS
        -> Supabase Storage
```

## Directory Layout

```
src/
  lib/
    components/
      brand/
      dashboard/
      datagrid/
      modal/
      asset/
      layout/
      ui/
    server/
      auth.ts
      assets.ts
      snapshots.ts
    supabase/
      client.ts
      server.ts
      admin.ts
    types/
      database.types.ts
      asset.ts
    utils/
      currency.ts
      date.ts
      chartData.ts
  routes/
    +layout.svelte
    +layout.server.ts
    +page.svelte
    +page.server.ts
    login/
      +page.svelte
      +page.server.ts
    api/
      assets/+server.ts
  hooks.server.ts
  app.d.ts
```

## Layer Responsibilities

### Route Layer

- 인증 여부 확인
- 서버 데이터 로드
- form action 처리
- 페이지 단위 error/redirect 처리

### Component Layer

- Svelte 5 Runes 기반 UI 상태 관리
- chart, datagrid, modal 재사용
- 서버 저장 로직을 직접 갖지 않고 callback 또는 form action과 연결

### Domain Layer

- 자산, 부채, 평가액, 스냅샷 계산
- chart data 변환
- 금액 포맷과 수익률 계산

### Supabase Layer

- browser client와 server client 분리
- service role은 `src/lib/supabase/admin.ts`에서만 사용
- RLS를 기본 보안 경계로 사용

## Authentication

- 회원가입 기능은 제공하지 않는다.
- Supabase Auth에 미리 등록된 email/password 계정만 로그인 가능하다.
- 로그인 성공 시 dashboard로 redirect
- 로그인 실패 시 같은 페이지에서 오류 메시지 표시
- `+layout.server.ts`에서 session이 없으면 `/login`으로 redirect

## Data Model Draft

### assets

- `id`
- `user_id`
- `category`
- `subcategory`
- `name`
- `institution`
- `principal_amount`
- `current_value`
- `currency`
- `valuation_date`
- `memo`
- `created_at`
- `updated_at`

### asset_valuations

- `id`
- `asset_id`
- `user_id`
- `value`
- `currency`
- `valued_at`
- `source`

### liabilities

- `id`
- `user_id`
- `asset_id`
- `name`
- `liability_type`
- `principal_amount`
- `remaining_amount`
- `interest_rate`
- `started_at`
- `due_at`
- `memo`

### snapshots

- `id`
- `user_id`
- `snapshot_date`
- `total_assets`
- `total_liabilities`
- `net_worth`
- `payload`

## RLS Rules

모든 사용자 데이터 테이블은 `user_id = auth.uid()` 조건을 가진다.

- Select: 본인 row만
- Insert: `user_id = auth.uid()`만 허용
- Update: 본인 row만
- Delete: 본인 row만

## State Management

- 서버 데이터: SvelteKit load
- UI filter state: 상위 dashboard page의 `$state()`
- 계산값: `$derived()`
- 외부 이벤트: `$effect()`
- 전역 store는 꼭 필요한 경우에만 사용한다.

## Error Handling

- Supabase error는 서버에서 사용자 메시지로 변환
- form action은 `fail(400, { message })` 사용
- DataGrid row 저장 실패는 row-level error로 표시
- 로그인 실패는 보안을 위해 "아이디 또는 패스워드를 확인해 주세요"처럼 일반 메시지 사용

## Testing Strategy

- 순수 계산 함수: Vitest
- 컴포넌트 렌더링: Vitest browser
- 로그인/대시보드 핵심 플로우: Playwright
- Supabase 연동은 local mock 또는 테스트 프로젝트를 분리한다.

## Security Rules

- `.env` 커밋 금지
- service role key 클라이언트 노출 금지
- 금액 숨김 모드는 UI 기능이며 보안 경계가 아니다.
- 모든 DB 접근은 RLS를 전제로 한다.

## Performance

- dashboard는 초기 load에서 필요한 데이터만 가져온다.
- 큰 valuation history는 기간 필터에 따라 지연 로드한다.
- DataGrid는 행이 많아지면 가상 스크롤을 도입한다.
- chart data 변환은 `$derived()`와 memoized pure function을 사용한다.
