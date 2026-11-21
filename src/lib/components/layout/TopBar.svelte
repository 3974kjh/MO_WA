<script lang="ts">
	/** 상단바 (FE-01): PC 60px / 모바일 52px, 제목 · (상세 화면) 뒤로 · 테마 토글. 시안의 '샘플' 배지는 넣지 않는다(H §7). */
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';

	let {
		title,
		backHref,
		actions
	}: {
		title: string;
		/** 상세 화면에서 상위 목록 경로(이미 resolve된 값). 모바일에서만 보인다 */
		backHref?: string | null;
		actions?: Snippet;
	} = $props();
</script>

<header class="topbar">
	{#if backHref}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="icon-btn back" href={backHref} aria-label="뒤로">
			<ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
		</a>
	{/if}
	<div class="grow"><h1>{title}</h1></div>
	{#if actions}{@render actions()}{/if}
	<ThemeToggle />
</header>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--color-canvas) 88%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--color-line);
		display: flex;
		align-items: center;
		gap: 12px;
		/* 높이는 min-height(PC 60 / 모바일 52, 테두리 포함)로 고정하고 세로 패딩은 두지 않는다 */
		padding: 0 28px;
		padding-top: var(--safe-top);
		min-height: calc(var(--size-topbar) + var(--safe-top));
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	h1 {
		font-size: var(--text-xl);
		line-height: var(--text-xl--line-height);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.back {
		display: none;
	}
	@media (max-width: 1023px) {
		.topbar {
			padding-inline: 20px;
		}
	}
	@media (max-width: 639px) {
		.topbar {
			padding: 0 16px;
			padding-top: var(--safe-top);
			min-height: calc(var(--size-topbar-m) + var(--safe-top));
		}
		h1 {
			font-size: var(--text-lg);
			line-height: 1.5rem;
		}
		.back {
			display: inline-grid;
			margin-left: -4px;
		}
	}
</style>
