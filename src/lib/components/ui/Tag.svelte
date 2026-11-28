<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		href,
		on = false,
		children
	}: { href?: string; /** 선택됨(정적 표시) */ on?: boolean; children: Snippet } = $props();
</script>

{#if href}
	<!-- href는 호출부에서 resolve()한 값을 받는다 -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="tag" class:on {href}>{@render children()}</a>
{:else}
	<span class="tag" class:on>{@render children()}</span>
{/if}

<style>
	.tag {
		display: inline-flex;
		align-items: center;
		height: 24px;
		padding: 0 10px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-line);
		font-size: var(--text-xs);
		color: var(--color-muted);
		background: var(--color-surface);
		white-space: nowrap;
		font-weight: 500;
	}
	.on {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 600;
	}
	a.tag:hover {
		border-color: var(--color-line-strong);
		text-decoration: none;
	}
</style>
