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
| `wrangler.jsonc` | **로컬 preview 전용** (호환 플래그만). Dashboard 잠금 방지 |
| `svelte.config.js` | `@sveltejs/adapter-cloudflare` |
| `.dev.vars.example` | 로컬 `wrangler pages dev`용 **비밀 변수** 템플릿 |
| `package.json` | `CF_PAGES=1` 빌드, `cf:preview`, `cf:deploy` |

> **중요:** `wrangler.jsonc`에 `pages_build_output_dir` 또는 `vars`를 넣으면  
> Cloudflare Dashboard의 Environment variables가 **읽기 전용(수정·삭제 불가)** 으로 바뀝니다.  
> Dashboard에서 설정을 관리하려면 `wrangler.jsonc`에 위 항목을 **넣지 마세요**.

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
| `PUBLIC_NAVER_MAP_KEY_ID` | Plaintext (Production만) | 네이버 클라우드 Maps Application의 **Client ID**(공개 값). Client Secret은 넣지 않는다. 비우면 부동산 지도 탭은 안내 화면(목록·네이버 지도 링크)으로 동작한다 — 부록 A |

Git 연동 배포 시 **Dashboard 환경 변수만** 사용합니다.

---

### 3.3 Dashboard 설정이 수정·삭제 안 될 때

**원인:** 저장소의 `wrangler.jsonc`에 `pages_build_output_dir` 또는 `vars`가 있으면,  
Wrangler 파일이 설정의 **단일 소스**가 되어 Dashboard 항목이 잠깁니다.  
([Cloudflare 공식 문서](https://developers.cloudflare.com/pages/functions/wrangler-configuration/))

**해결:**

1. 저장소에서 `wrangler.jsonc`의 `pages_build_output_dir`, `vars` 제거 (이 프로젝트는 이미 반영됨)
2. 변경사항 push → Pages **재배포** 1회
3. 재배포 후 Dashboard → Settings → Environment variables에서 수정·삭제 가능

재배포 전까지는 Dashboard가 계속 잠겨 있을 수 있습니다.

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

---

## 부록 A. 네이버 지도(부동산 ⑤ 지도 탭)

- 변수: `PUBLIC_NAVER_MAP_KEY_ID` = Maps Application **Client ID**만. 값은 저장소·코드·테스트·로그에 쓰지 않는다(테스트는 자리 표시 값). Client Secret은 지도 표시에 쓰지 않으며 어디에도 넣지 않는다.
- 전달 경로: `src/lib/server/web/naverMapKey.ts`가 서버에서만 `$env/dynamic/public`을 읽고, 로그인 뒤 `/realestate` load 결과로만 내려준다. 클라이언트 코드는 `$env/dynamic/public`을 import하지 않는다(그러면 SvelteKit이 로그인 화면을 포함한 모든 HTML에 공개 env를 싣는다 — 빌드 manifest의 `uses_env_dynamic_public:false` 유지).
- 적용: Pages는 변수 변경 뒤 **새 배포**부터 반영된다(변수 저장 → Retry deployment).
- SDK: `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=<Client ID>`를 지도 탭이 화면에 보일 때만 요청한다(외부 전송 약 92 KB gzip, 빌드 크기 가드 대상 아님). 요청 시점에만 `nrbe.pstatic.net`·`map.pstatic.net` preconnect를 붙인다.
- 네이버 콘솔 웹 서비스 URL(호스트만, 포트·경로 없음): `https://mo-wa.pages.dev`(필수), `http://localhost`(로컬), `http://127.0.0.1`(선택). 와일드카드는 쓰지 않는다.
- 실패 시 화면: 키 없음·인증 실패(`navermap_authFailure`)·스크립트 오류·시간 초과(8초, 첫 타일 포함)·오프라인·렌더 오류 모두 빈 지도 대신 안내 + 목록. 검증용 상태는 지도 자리의 `data-state`(`nokey|init|idle|loading|ready|auth-failed|load-failed|timeout|offline|error`)·`data-markers`.
- CSP: 지금은 CSP 헤더가 없어 허용할 것이 없다. 나중에 도입하면 아래를 허용한다(SDK v3.10.5 기준, 실측 필요).

| 지시어 | 허용 |
|---|---|
| `script-src` | `https://oapi.map.naver.com` |
| `connect-src` | `https://oapi.map.naver.com` `https://map.pstatic.net` `https://nrbe.pstatic.net` (선택 `https://kr-col-ext.nelo.navercorp.com`) |
| `img-src` | `https://map.pstatic.net` `https://nrbe.pstatic.net` `https://simg.pstatic.net` `https://ssl.pstatic.net` `data:` `blob:` |
| `style-src` | SDK 인라인 스타일 — `'unsafe-inline'` 필요 가능성(실측 필요) |
