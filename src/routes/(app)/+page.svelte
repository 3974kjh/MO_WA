<script lang="ts">
	// 홈(`/`) — (app) 셸 안. FE-03(I-8 대시보드) 전까지 HF-1 최소 내용만 둔다.
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import MoWaLogo from '$lib/components/brand/MoWaLogo.svelte';
	import { LOGOUT_PATH } from '$lib/components/layout/nav';
	import Button from '$lib/components/ui/Button.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>MO_WA</title>
	<meta name="description" content="MO_WA — Money and Wallet." />
</svelte:head>

<section
	class="grid place-items-center px-lg py-section text-text"
	data-testid="mo-wa-authenticated-landing"
>
	<div class="grid w-full max-w-[440px] justify-items-center gap-lg text-center">
		<MoWaLogo size={64} showWordmark={false} />
		<div class="grid gap-sm">
			<h1 class="font-display text-[48px] leading-[1.05] font-semibold tracking-[-0.32px]">
				MO_WA
			</h1>
			<p class="text-[17px] leading-[1.47] tracking-[-0.374px] text-muted">
				Money and Wallet in one place
				{#if data.user?.email}
					<br />
					{data.user.email}으로 로그인됨
				{/if}
			</p>
		</div>
		<form method="POST" action={resolve(LOGOUT_PATH)} use:enhance>
			<Button type="submit" variant="secondary-pill">로그아웃</Button>
		</form>
	</div>
</section>
