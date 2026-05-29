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

<main class="grid min-h-screen place-items-center bg-canvas-parchment px-lg py-section text-ink">
	<section
		class="grid w-full max-w-[440px] gap-lg rounded-lg border border-hairline bg-canvas p-xl"
	>
		<header class="grid justify-items-center gap-sm text-center">
			<MoWaLogo size={52} />
			<div class="grid gap-xxs">
				<h1 class="font-display text-[40px] leading-[1.1] font-semibold tracking-[-0.28px]">
					MO_WA
				</h1>
				<p class="text-[17px] leading-[1.47] tracking-[-0.374px] text-ink-muted-80">
					Money and Wallet in one place
				</p>
			</div>
		</header>

		<form
			method="POST"
			class="grid gap-md"
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
					class="rounded-md bg-canvas-parchment p-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80"
					aria-live="polite"
				>
					{form.message}
				</p>
			{/if}

			<Button type="submit" label={submitting ? '로그인 중' : '로그인'} disabled={submitting} />
		</form>
	</section>
</main>
