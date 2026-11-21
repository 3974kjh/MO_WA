<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		icon = '🔍',
		title,
		desc,
		action
	}: {
		/** 원형 안 기호(장식) */
		icon?: string;
		title: string;
		desc?: string;
		/** 행동 버튼(필터 초기화 등) */
		action?: Snippet;
	} = $props();
</script>

<div class="state">
	<div class="ico" aria-hidden="true">{icon}</div>
	<h4>{title}</h4>
	{#if desc}<p class="desc">{desc}</p>{/if}
	{#if action}<div class="act">{@render action()}</div>{/if}
</div>

<style>
	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		padding: 36px 20px;
		color: var(--color-muted);
	}
	.ico {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--color-surface-2);
		display: grid;
		place-items: center;
		font-size: 20px;
	}
	h4 {
		color: var(--color-text);
		font-size: var(--text-lg);
	}
	.desc {
		font-size: var(--text-sm);
	}
	.act {
		margin-top: 4px;
	}
</style>
