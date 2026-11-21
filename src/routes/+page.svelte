<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import MoWaLogo from '$lib/components/brand/MoWaLogo.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>MO_WA</title>
	<meta name="description" content="MO_WA — Money and Wallet." />
</svelte:head>

<main
	class="grid min-h-screen place-items-center bg-canvas-parchment px-lg py-section text-ink"
	data-testid="mo-wa-authenticated-landing"
>
	<section class="grid w-full max-w-[440px] justify-items-center gap-lg text-center">
		<MoWaLogo size={64} />
		<div class="grid gap-sm">
			<h1 class="font-display text-[48px] leading-[1.05] font-semibold tracking-[-0.32px]">
				MO_WA
			</h1>
			<p class="text-[17px] leading-[1.47] tracking-[-0.374px] text-ink-muted-80">
				Money and Wallet in one place
				{#if data.user?.email}
					<br />
					{data.user.email}으로 로그인됨
				{/if}
			</p>
		</div>
		<form method="POST" action="?/logout" use:enhance>
			<Button type="submit" variant="secondary-pill">로그아웃</Button>
		</form>
	</section>
</main>
