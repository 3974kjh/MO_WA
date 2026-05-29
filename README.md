# MO_WA

개인 자산 관리 대시보드 — SvelteKit 2, Svelte 5 Runes, Tailwind v4, Supabase.

## Features

- Supabase Auth 로그인 (회원가입 UI 없음, 관리자가 계정 생성)
- One-page dashboard: summary, treemap, charts, DataGrid
- 자산 CRUD + 평가 이력 (`assets`, `asset_valuations`)
- 부채 CRUD + 상환 내역 (`liabilities`, `liability_payments`)
- 목표 순자산, 스냅샷, CSV import/export
- 만기 알림, 리밸런싱, 유동성 경고, Radar/Network 차트

## Setup

```bash
pnpm install
cp .env.example .env
```

`.env`에 Supabase 프로젝트 값을 설정합니다.

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

### Database

Supabase Dashboard SQL Editor 또는 CLI로 migration을 적용합니다.

```bash
# Supabase CLI (optional)
supabase start
supabase db reset   # applies supabase/migrations/*
pnpm db:types     # regenerate database.types.ts from local Supabase
```

Migration files:

- `supabase/migrations/20260529190000_initial_mo_wa_schema.sql`
- `supabase/migrations/20260529200000_profiles_trigger_tags_maturity.sql`

### Auth account

Supabase Dashboard → Authentication → Users에서 관리자 계정을 직접 생성합니다.

## Development

```bash
pnpm dev
```

Open http://localhost:5173 — unauthenticated users redirect to `/login`.

## Scripts

| Script           | Description                         |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Dev server                          |
| `pnpm check`     | TypeScript + Svelte check           |
| `pnpm test:unit` | Vitest unit tests                   |
| `pnpm test:e2e`  | Playwright E2E                      |
| `pnpm db:types`  | Generate Supabase types (local CLI) |
| `pnpm db:reset`  | Reset local Supabase DB             |

## Project docs

- `.cursor/Rules.md` — implementation guide
- `.cursor/orchestration/MO_WA-orchestration.md` — phase order
- `.cursor/history/feature-history.md` — implementation log

## Architecture

```
Browser → SvelteKit routes → form actions / load → Supabase SSR → Postgres (RLS)
```

Protected routes: `src/routes/+layout.server.ts`  
Supabase client: `src/hooks.server.ts`, `src/lib/supabase/`
