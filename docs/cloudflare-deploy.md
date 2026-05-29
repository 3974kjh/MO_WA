# Cloudflare Pages 배포 가이드 (MO_WA)

SvelteKit + Supabase 프로젝트를 **Cloudflare Pages**에 배포하는 방법입니다.

---

## 1. 사전 준비

| 항목 | 설명 |
|---|---|
| [Cloudflare 계정](https://dash.cloudflare.com/sign-up) | Pages 무료 플랜으로 시작 가능 |
| [Supabase 프로젝트](https://supabase.com/dashboard) | Auth + Postgres |
| GitHub/GitLab 저장소 | Pages Git 연동 배포 권장 |
| Node.js 20+ / pnpm | 빌드용 |

CLI로 직접 배포할 경우:

```bash
pnpm wrangler login
```

---

## 2. 프로젝트 설정 요약

| 파일 | 역할 |
|---|---|
| `wrangler.jsonc` | Pages 출력 경로, 호환 플래그, **공개 env vars** |
| `svelte.config.js` | `@sveltejs/adapter-cloudflare` |
| `.dev.vars.example` | 로컬 `wrangler pages dev`용 **비밀 변수** 템플릿 |
| `package.json` | `CF_PAGES=1` 빌드, `cf:preview`, `cf:deploy` |

> Workers와 달리 Pages는 `wrangler.jsonc`에 `pages_build_output_dir`를 사용합니다.  
> `main`, `assets` 키는 **Pages에 필요 없습니다**.

---

## 3. 설정해야 할 값

### 3.1 Supabase Dashboard → Project Settings → API

| 변수명 | 복사 위치 | 비밀 여부 |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | **Project URL** | 공개 |
| `PUBLIC_SUPABASE_ANON_KEY` | **anon public** key | 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** key | **비밀 (절대 공개 금지)** |

---

### 3.2 Cloudflare Pages Dashboard — Environment variables

**Workers & Pages → mo-wa → Settings → Environment variables**

Production / Preview 각각 설정합니다 (Preview에도 동일 값 권장).

| Name | Type | Value |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Plaintext | `https://YOUR-PROJECT-REF.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | Plaintext | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** (Encrypt) | Supabase service_role key |

Git 연동 배포 시 **Dashboard 환경 변수가 가장 중요**합니다.  
`wrangler.jsonc`의 `vars`는 로컬 preview 및 wrangler CLI 배포 시에도 사용됩니다.

---

### 3.3 `wrangler.jsonc` — 공개 변수 (`vars`)

Dashboard와 동일한 공개 값을 넣습니다.

```jsonc
"vars": {
  "PUBLIC_SUPABASE_URL": "https://YOUR-PROJECT-REF.supabase.co",
  "PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| 필드 | 설명 |
|---|---|
| `name` | Pages 프로젝트 이름 (`mo-wa`). CLI `--project-name`과 일치 |
| `pages_build_output_dir` | **`.svelte-kit/cloudflare`** — 수정하지 마세요 |
| `compatibility_flags` | `nodejs_compat` — Supabase SSR 등 Node API 호환 |
| `compatibility_date` | Workers/Pages 런타임 버전 |

---

### 3.4 로컬 preview용 비밀 변수

```bash
cp .dev.vars.example .dev.vars
# SUPABASE_SERVICE_ROLE_KEY 입력
pnpm cf:preview   # http://localhost:8788
```

---

### 3.5 Supabase Auth — Site URL / Redirect URLs

**Authentication → URL Configuration**

| 설정 | 값 예시 |
|---|---|
| **Site URL** | `https://mo-wa.pages.dev` (배포 후 실제 Pages URL) |
| **Redirect URLs** | `https://mo-wa.pages.dev/**` |
| | Preview: `https://<branch>.mo-wa.pages.dev/**` |
| | 커스텀 도메인: `https://your-domain.com/**` |

로컬 개발:

| 설정 | 값 |
|---|---|
| Redirect URLs | `http://localhost:5173/**` |

---

## 4. 배포 방법

### 방법 A — Git 연동 (권장)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 저장소 선택 후 빌드 설정:

| 항목 | 값 |
|---|---|
| **Framework preset** | SvelteKit |
| **Production branch** | `main` (또는 사용 중인 브랜치) |
| **Build command** | `pnpm install && pnpm build` |
| **Build output directory** | `.svelte-kit/cloudflare` |
| **Root directory** | `/` |
| **Node.js version** | 20 이상 (Environment variables에서 `NODE_VERSION=22` 등) |

3. **Environment variables** (§3.2) 설정
4. **Save and Deploy**

이후 `main`(또는 설정한 브랜치) push마다 자동 배포됩니다.

---

### 방법 B — CLI 직접 배포

```bash
pnpm cf:deploy
```

첫 배포 시 Pages 프로젝트 `mo-wa`가 없으면 생성 여부를 묻습니다.

---

### 로컬에서 Pages 런타임 미리보기

```bash
pnpm cf:preview
```

`wrangler.jsonc` vars + `.dev.vars` 시크릿이 적용됩니다.

---

## 5. 커스텀 도메인 (선택)

1. Pages 프로젝트 → **Custom domains** → **Set up a domain**
2. Supabase Auth Site URL / Redirect URLs에 동일 도메인 추가

---

## 6. Preview 배포 URL

Pages는 브랜치/PR마다 Preview URL을 발급합니다.

- Production: `https://mo-wa.pages.dev`
- Preview: `https://<commit-hash>.mo-wa.pages.dev` 또는 `https://<branch>.mo-wa.pages.dev`

Supabase Redirect URLs에 Preview 패턴(`https://*.mo-wa.pages.dev/**`)을 추가하면 PR preview에서도 로그인 테스트가 가능합니다.

---

## 7. 로컬 개발 vs Pages

| 명령 | 용도 |
|---|---|
| `pnpm dev` | Vite dev server (`localhost:5173`), `.env` 사용 |
| `pnpm build` | Pages용 빌드 (`CF_PAGES=1` 포함) |
| `pnpm cf:preview` | Pages Functions 런타임 로컬 테스트 |
| `pnpm cf:deploy` | CLI로 Pages에 수동 배포 |

일상 개발은 `pnpm dev` + `.env`로 충분합니다.

---

## 8. 문제 해결

| 증상 | 확인 사항 |
|---|---|
| 빌드 실패: output directory 없음 | Build output이 `.svelte-kit/cloudflare`인지 |
| Adapter / platform 오류 | `pnpm build`가 `CF_PAGES=1`로 실행되는지 |
| 로그인 세션 안 됨 | Supabase Site URL = Pages URL인지 |
| service_role 오류 | Dashboard Secrets + `.dev.vars`(로컬) |
| Preview에서만 Auth 실패 | Supabase Redirect URLs에 preview URL 추가 |

---

## 9. Workers vs Pages (참고)

이 프로젝트는 **Pages** 기준입니다.

| | Pages (현재) | Workers |
|---|---|---|
| wrangler 키 | `pages_build_output_dir` | `main` + `assets` |
| Git 자동 배포 | ✅ 기본 지원 | 별도 Workers Builds 설정 |
| Preview URL | ✅ 브랜치/PR별 | 제한적 |
| 배포 CLI | `wrangler pages deploy` | `wrangler deploy` |
