<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import SearchX from '@lucide/svelte/icons/search-x';
	import Notebook from '@lucide/svelte/icons/notebook';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import Icon from './Icon.svelte';

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

	// icons.md §2 #23·#36~39: 빈 상태 기호 → Lucide 24. 대응표에 없는 기호는 글자 그대로(READY.md 열린 질문)
	const LUCIDE = {
		'✓': CircleCheck,
		'🔍': SearchX,
		'📒': Notebook,
		'🗂': FolderOpen,
		'🗓': CalendarX
	} as const;
	const glyph = $derived(LUCIDE[icon as keyof typeof LUCIDE]);
</script>

<div class="state">
	<div class="ico" aria-hidden="true">
		{#if glyph}<Icon icon={glyph} size={24} />{:else}{icon}{/if}
	</div>
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
