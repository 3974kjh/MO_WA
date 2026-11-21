<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		pressed = false,
		onclick,
		count,
		children
	}: {
		pressed?: boolean;
		onclick?: (e: MouseEvent) => void;
		/** 칩 옆 건수(선택) */
		count?: number;
		children: Snippet;
	} = $props();
</script>

<button type="button" class="chip" aria-pressed={pressed} {onclick}
	>{@render children()}{#if count != null}<span class="count num">{count}</span>{/if}</button
>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 12px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-line);
		background: var(--color-surface);
		color: var(--color-muted);
		font-size: var(--text-sm);
		white-space: nowrap;
		flex: none;
	}
	.chip:hover {
		border-color: var(--color-line-strong);
		color: var(--color-text);
	}
	.chip[aria-pressed='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 600;
	}
	.count {
		font-size: var(--text-xs);
		opacity: 0.85;
	}
	/* 터치 영역 ≥40px: 시각 높이 32px + 위아래 히트 영역 확장 */
	@media (pointer: coarse) {
		.chip {
			min-height: var(--size-touch);
		}
	}
</style>
