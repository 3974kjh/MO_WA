<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import MoWaLogo from '$lib/components/brand/MoWaLogo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Login | MO_WA</title>
	<meta name="description" content="MO_WA protected dashboard login." />
</svelte:head>

<main class="grid min-h-dvh place-items-center bg-canvas px-lg py-section text-text">
	<section class="grid w-full max-w-[440px] gap-lg rounded-lg border border-line bg-surface p-xl">
		<header class="grid justify-items-center gap-sm text-center">
			<MoWaLogo size={52} />
			<div class="grid gap-xxs">
				<h1 class="font-display text-[40px] leading-[1.1] font-semibold tracking-[-0.28px]">
					MO_WA
				</h1>
				<p class="text-[17px] leading-[1.47] tracking-[-0.374px] text-muted">
					Money and Wallet in one place
				</p>
			</div>
		</header>

		<form
			method="POST"
			class="login-form grid gap-md"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<Input id="email" label="아이디(email)" type="email" value={form?.email ?? ''} required />
			<Input id="password" label="패스워드" type="password" required />

			{#if form?.message}
				<p
					class="rounded-md bg-surface-2 p-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-muted"
					aria-live="polite"
				>
					{form.message}
				</p>
			{/if}

			<Button type="submit" label={submitting ? '로그인 중' : '로그인'} disabled={submitting} />
		</form>
	</section>
</main>

<style>
	/*
	 * handoff §13-8: 공유 Input(레거시 대시보드와 공용)은 수정하지 않고 로그인에서만 보완한다.
	 * - 입력 높이 40(min-h-11=44 → 40), 모바일(<640) 입력 글자 16px(iOS 확대 방지)
	 * - text-ink(다크 값 없음) → text-text 매핑: 다크에서 라벨·입력 글자가 보이도록. pill·데스크톱 17px 유지
	 */
	.login-form :global(input) {
		min-height: 0;
		height: 2.5rem;
		padding-block: 0;
		color: var(--color-text);
	}
	.login-form :global(label > span) {
		color: var(--color-text);
	}
	/* 공유 Input의 hairline(다크 값 없음)은 그대로 두고 로그인에서만 border-line(§13-8) */
	.login-form :global(input) {
		border-color: var(--color-line);
	}
	/* 공유 Button(primary)의 레거시 파랑 → 공식 틸 bg-accent text-on-accent. 높이(~47px)는 유지 */
	.login-form :global(button[type='submit']) {
		background-color: var(--color-accent);
		color: var(--color-on-accent);
	}
	.login-form :global(button[type='submit']:hover:not(:disabled)) {
		background-color: var(--color-accent-hover);
	}
	.login-form :global(input::placeholder) {
		color: var(--color-subtle);
	}
	@media (max-width: 639px) {
		.login-form :global(input) {
			font-size: 1rem;
		}
	}
</style>
