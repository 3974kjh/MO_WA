<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		flush = false,
		title,
		sub,
		aside,
		headingLevel = 2,
		class: className = '',
		children
	}: {
		/** 패딩 없음(표·목록을 가장자리까지) */
		flush?: boolean;
		title?: string;
		/** 제목 아래가 아니라 우측 보조 문구(기준 시각 등) */
		sub?: string;
		/** 제목 줄 우측 요소(배지·링크) */
		aside?: Snippet;
		headingLevel?: 2 | 3;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<section class="card {className}" class:flush>
	{#if title || aside || sub}
		<header class="card-head">
			{#if title}
				<svelte:element this={`h${headingLevel}`} class="card-title">{title}</svelte:element>
			{/if}
			{#if aside}{@render aside()}{:else if sub}<span class="card-sub">{sub}</span>{/if}
		</header>
	{/if}
	{@render children()}
</section>

<style>
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-card-line); /* 라이트 transparent(그림자만), 다크 연한 1px */
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		padding: 16px;
		min-width: 0;
	}
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}
	.card-title {
		font-size: var(--text-lg);
		line-height: var(--text-lg--line-height);
	}
	.card-sub {
		font-size: var(--text-sm);
		color: var(--color-subtle);
	}
	.flush {
		padding: 0;
		overflow: hidden;
	}
	.flush .card-head {
		padding: 14px 16px 0;
	}
</style>
