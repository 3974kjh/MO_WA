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

<button
	type="button"
	class="chip {pressed ? 'preset-filled-brand' : 'preset-outlined-surface-500'}"
	aria-pressed={pressed}
	{onclick}
	>{@render children()}{#if count != null}<span class="count num">{count}</span>{/if}</button
>

<style>
	/* DS §7-0: chip preset-outlined-surface-500 / 선택 preset-filled-brand, 클릭 40(overrides .chip), 긴 이름 줄바꿈 허용(v1.3) */
	.chip {
		gap: 6px;
		max-width: 100%;
		padding-inline: 12px;
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		line-height: 1.25;
		white-space: normal;
		text-align: left;
	}
	.count {
		font-size: var(--text-xs);
		opacity: 0.85;
	}
</style>
