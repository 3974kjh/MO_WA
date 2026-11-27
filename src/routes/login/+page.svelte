<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData } from './$types';
	import MoWaLogo from '$lib/components/brand/MoWaLogo.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatKstTime } from '$lib/format/datetime';
	import FileText from '@lucide/svelte/icons/file-text';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import NotebookTabs from '@lucide/svelte/icons/notebook-tabs';
	import Lock from '@lucide/svelte/icons/lock';
	import Mail from '@lucide/svelte/icons/mail';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	// DS §7-17 / handoff §19-6. 서버(+page.server.ts) 흐름은 그대로 — 마크업·스타일·클라이언트 상태만.
	let { form }: { form: ActionData } = $props();

	const EMAIL_RE = /^[^@\s]+@[^@\s]+$/;
	const features = [
		{ icon: FileText, name: '브리핑', desc: '장 마감 요약과 지표를 날짜별로' },
		{ icon: ChartPie, name: '포트폴리오', desc: '보유·계획 종목과 변경 요청 확인' },
		{ icon: NotebookTabs, name: '매매일지', desc: '매수·매도 기록과 점검 메모' }
	];

	// 첫 렌더(JS 없이 서버 실패 후 다시 그릴 때)만 서버가 돌려준 이메일로 채운다.
	// svelte-ignore state_referenced_locally
	let email = $state(form?.email ?? '');
	let password = $state('');
	let submitting = $state(false);
	let revealed = $state(false);
	let caps = $state(false);
	let emailError = $state('');
	let passwordError = $state('');
	// 서버 실패(틀린 정보) 뒤 비밀번호 칸 빨간 테두리. 다시 입력하면 지운다.
	let passwordFlagged = $state(false);

	let emailInput: HTMLInputElement | undefined = $state();
	let passwordInput: HTMLInputElement | undefined = $state();

	// 서버 문장 '첫 문장. 나머지' → 첫 문장만 굵게(시안 callout err).
	const message = $derived.by(() => {
		const m = form?.message ?? '';
		const i = m.indexOf('. ');
		return i < 0 ? { lead: m, rest: '' } : { lead: m.slice(0, i + 1), rest: m.slice(i + 2) };
	});

	// 로그인 불가(DS §7-17): 서버가 인증 서버 연결 실패를 알려 준 직후. 다시 제출하는 동안에는 알림을 걷는다.
	const unavailable = $derived(!!form?.unavailable && !submitting);
	const checkedAt = $derived(form?.checkedAt ? formatKstTime(form.checkedAt) : '');

	function validate(): boolean {
		const e = email.trim();
		emailError = !e
			? '이메일을 입력해 주세요.'
			: EMAIL_RE.test(e)
				? ''
				: '이메일 형식을 확인해 주세요. 예: name@example.com';
		passwordError = password ? '' : '비밀번호를 입력해 주세요.';
		if (emailError) emailInput?.focus();
		else if (passwordError) passwordInput?.focus();
		return !emailError && !passwordError;
	}

	function toggleReveal() {
		revealed = !revealed;
		passwordInput?.focus();
	}

	function onPasswordKey(e: KeyboardEvent) {
		caps = e.getModifierState?.('CapsLock') ?? false;
	}
</script>

<svelte:head>
	<title>로그인 · MO_WA</title>
	<meta name="description" content="MO_WA 로그인" />
</svelte:head>

<main class="mw-login">
	<header class="lg-head">
		<MoWaLogo link={false} />
	</header>

	<section class="lg-intro" aria-labelledby="login-intro-title">
		<h2 id="login-intro-title">투자 기록과 브리핑을<br />한곳에서 확인해요</h2>
		<p class="lead">
			매일 브리핑, 보유 종목, 매매일지를 보고 봇이 올린 변경 요청을 반영할지 정해요.
		</p>
		<ul class="feat">
			{#each features as f (f.name)}
				<li>
					<span class="fi"><Icon icon={f.icon} size={20} /></span>
					<div><b>{f.name}</b><span>{f.desc}</span></div>
				</li>
			{/each}
		</ul>
		<p class="lg-note">
			<Icon icon={Lock} size={16} /><span>초대된 계정만 로그인할 수 있는 개인용 서비스예요.</span>
		</p>
	</section>

	<section class="lg-panel" aria-labelledby="login-title">
		<h1 id="login-title">로그인</h1>
		<p class="lead">등록된 이메일과 비밀번호를 입력하세요.</p>

		<div class="lg-alert" role="alert">
			{#if form?.message && !submitting}
				<div class="mw-callout err">
					<Icon icon={CircleAlert} size={18} />
					<div>
						<b>{message.lead}</b>
						{message.rest}
					</div>
				</div>
			{:else if unavailable}
				<div class="mw-callout warn" data-testid="login-unavailable">
					<Icon icon={TriangleAlert} size={18} />
					<div>
						<b>지금은 로그인 서버에 연결할 수 없어요.</b>
						잠시 후 다시 시도해 주세요.{checkedAt ? ` 마지막 확인 ${checkedAt}` : ''}
					</div>
				</div>
			{/if}
		</div>

		<form
			method="POST"
			class="lg-form"
			novalidate
			use:enhance={({ cancel }) => {
				if (!validate()) {
					cancel();
					return;
				}
				revealed = false;
				caps = false;
				submitting = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					submitting = false;
					if (result.type === 'failure' && result.data?.unavailable) {
						// 로그인 불가: 이메일 유지 · 비밀번호만 비움(빨간 테두리·포커스 이동 없음 — 입력 문제가 아니다)
						password = '';
					} else if (result.type === 'failure') {
						// 틀린 정보: 이메일 유지 · 비밀번호 비움 · 비밀번호 칸 빨간 테두리 · 포커스
						password = '';
						passwordFlagged = true;
						await tick();
						passwordInput?.focus();
					}
				};
			}}
		>
			<div class="label">
				<label class="label-text" for="email">이메일</label>
				<div class="mw-input-group" data-invalid={emailError ? '' : undefined}>
					<Icon icon={Mail} size={18} />
					<input
						bind:this={emailInput}
						bind:value={email}
						oninput={() => (emailError = '')}
						id="email"
						name="email"
						type="email"
						inputmode="email"
						autocomplete="username"
						autocapitalize="none"
						spellcheck="false"
						enterkeyhint="next"
						placeholder="name@example.com"
						required
						readonly={submitting}
						aria-invalid={emailError ? 'true' : undefined}
						aria-describedby={emailError ? 'email-help' : undefined}
					/>
				</div>
				{#if emailError}
					<p class="mw-help err" id="email-help">
						<Icon icon={CircleAlert} size={16} /><span>{emailError}</span>
					</p>
				{/if}
			</div>

			<div class="label">
				<label class="label-text" for="password">비밀번호</label>
				<div
					class="mw-input-group"
					data-invalid={passwordError || passwordFlagged ? '' : undefined}
				>
					<Icon icon={Lock} size={18} />
					<input
						bind:this={passwordInput}
						bind:value={password}
						oninput={() => {
							passwordError = '';
							passwordFlagged = false;
						}}
						onkeydown={onPasswordKey}
						onkeyup={onPasswordKey}
						onblur={() => (caps = false)}
						id="password"
						name="password"
						type={revealed ? 'text' : 'password'}
						autocomplete="current-password"
						enterkeyhint="go"
						required
						readonly={submitting}
						aria-invalid={passwordError || passwordFlagged ? 'true' : undefined}
						aria-describedby={[passwordError && 'password-help', caps && 'caps-help']
							.filter(Boolean)
							.join(' ') || undefined}
					/>
					<button
						type="button"
						class="pw-toggle btn-icon"
						aria-pressed={revealed}
						aria-controls="password"
						aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
						onclick={toggleReveal}
					>
						<Icon icon={revealed ? EyeOff : Eye} size={20} />
					</button>
				</div>
				{#if passwordError}
					<p class="mw-help err" id="password-help">
						<Icon icon={CircleAlert} size={16} /><span>{passwordError}</span>
					</p>
				{/if}
				{#if caps}
					<p class="mw-help" id="caps-help">
						<Icon icon={TriangleAlert} size={16} /><span>Caps Lock이 켜져 있어요.</span>
					</p>
				{/if}
			</div>

			<button
				type="submit"
				class="btn w-full preset-filled-brand btn-lg"
				disabled={submitting || unavailable}
				aria-busy={submitting}
				aria-describedby={unavailable ? 'submit-why' : undefined}
			>
				{#if submitting}
					<Icon icon={LoaderCircle} size={20} class="mw-spin" /><span>로그인 중…</span>
				{:else}
					<span>로그인</span>
				{/if}
			</button>
			{#if unavailable}
				<p class="mw-help" id="submit-why">
					<Icon icon={TriangleAlert} size={16} /><span
						>로그인 서버 점검 중이라 버튼을 누를 수 없어요. 연결되면 자동으로 다시 켜져요.</span
					>
				</p>
			{/if}
		</form>

		<p class="lg-foot">
			로그인 상태는 이 기기에 유지돼요. 함께 쓰는 기기라면 사용 후 로그아웃하세요.
		</p>
	</section>
</main>

<style>
	/* 시안 screens/login.html v1.7.0 — AppShell 밖. 모바일 1열 / ≥640 2열(소개 | 폼 카드). 정렬 §4-3 */
	.mw-login {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-content: start;
		padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
		background: var(--color-canvas);
		color: var(--color-text);
	}
	.lg-head :global(.mw-logo) {
		font-size: var(--text-lg);
		letter-spacing: -0.02em;
	}
	/* 숨은(hidden) 알림·도움말이 display 규칙에 지지 않게(시안 v1.7.1) */
	.mw-login :global([hidden]) {
		display: none !important;
	}
	.lg-intro {
		display: none;
	}
	.lg-panel {
		margin-top: 32px;
		width: 100%;
		max-width: 420px;
		justify-self: center;
	}
	.lg-panel h1 {
		text-wrap: balance;
		font-size: var(--text-2xl);
		line-height: 2.2rem;
		letter-spacing: -0.02em;
		font-weight: 700;
	}
	.lg-panel .lead {
		text-wrap: pretty;
		margin-top: 6px;
		color: var(--color-muted);
		font-size: var(--text-base);
		line-height: 1.5rem;
	}
	.lg-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-top: 24px;
	}
	.lg-form .label {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	/* Skeleton .label 의 자식 사이 margin(space-y) 대신 gap 6 하나로 */
	.lg-form .label > :global(*) {
		margin-block: 0;
	}
	.lg-form .btn-lg {
		margin-top: 4px;
	}
	.lg-alert {
		margin-top: 20px;
	}
	.lg-alert:empty {
		display: none;
	}
	.lg-foot {
		margin-top: 20px;
		font-size: var(--text-sm);
		line-height: 1.25rem;
		color: var(--color-subtle);
	}
	.pw-toggle {
		color: var(--color-muted);
	}
	.pw-toggle[aria-pressed='true'] {
		color: var(--color-accent);
	}
	/* 브라우저 자동완성 배경이 입력 그룹 모양을 깨지 않게 surface 로 덮는다 */
	.mw-login :global(.mw-input-group input:-webkit-autofill),
	.mw-login :global(.mw-input-group input:-webkit-autofill:hover),
	.mw-login :global(.mw-input-group input:-webkit-autofill:focus) {
		-webkit-text-fill-color: var(--color-text);
		-webkit-box-shadow: 0 0 0 40px var(--color-surface) inset;
		caret-color: var(--color-text);
		transition: background-color 9999s;
	}
	@media (max-width: 639px) {
		.lg-panel h1 {
			font-size: var(--text-xl);
			line-height: 1.85rem;
		}
	}
	/* 태블릿·PC: 2열. 왼쪽 소개는 캔버스, 오른쪽 폼은 카드(그림자) */
	@media (min-width: 640px) {
		.mw-login {
			grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
			grid-template-rows: auto 0fr;
			column-gap: 28px;
			row-gap: 28px;
			align-content: center;
			align-items: center;
			max-width: 1040px;
			margin: 0 auto;
			padding: 32px 24px;
		}
		/* v1.7.1: 로고 윗선 = 폼 카드 윗선. 둘 다 start, 가운데 맞춤은 묶음 전체(align-content)만 */
		.lg-head {
			grid-column: 1;
			grid-row: 1;
			align-self: start;
		}
		.lg-intro {
			display: block;
			grid-column: 1;
			grid-row: 2;
			align-self: start;
		}
		.lg-panel {
			grid-column: 2;
			grid-row: 1 / 3;
			align-self: start;
			margin: 0;
			max-width: none;
			background: var(--color-surface);
			border: 1px solid var(--color-card-line);
			border-radius: var(--radius-container);
			box-shadow: var(--shadow-card);
			padding: 28px;
		}
		.lg-panel h1 {
			font-size: var(--text-xl);
			line-height: 1.85rem;
		}
	}
	@media (min-width: 1024px) {
		.mw-login {
			grid-template-columns: minmax(0, 1fr) 420px;
			column-gap: 64px;
			padding: 40px 32px;
		}
		.lg-panel {
			padding: 32px;
		}
	}
	.lg-intro h2 {
		text-wrap: balance;
		font-size: var(--text-2xl);
		line-height: 2.2rem;
		letter-spacing: -0.02em;
		font-weight: 700;
	}
	.lg-intro .lead {
		text-wrap: pretty;
		margin-top: 10px;
		color: var(--color-muted);
		font-size: var(--text-md);
		line-height: 1.7rem;
		max-width: 30rem;
	}
	.feat {
		list-style: none;
		margin: 28px 0 0;
		padding: 0;
		display: grid;
		gap: 4px;
		max-width: 30rem;
	}
	.feat li {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		column-gap: 14px;
		align-items: center;
		padding: 10px 0;
	}
	.fi {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-base);
		background: var(--color-accent-soft);
		color: var(--color-accent);
		display: grid;
		place-items: center;
	}
	.feat b {
		display: block;
		font-size: var(--text-base);
		line-height: 1.5rem;
	}
	.feat div span {
		display: block;
		font-size: var(--text-sm);
		line-height: 1.25rem;
		color: var(--color-muted);
	}
	.lg-note {
		margin-top: 24px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		line-height: 1.25rem;
		color: var(--color-subtle);
	}
</style>
