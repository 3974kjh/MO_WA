<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import SearchX from '@lucide/svelte/icons/search-x';
	import Notebook from '@lucide/svelte/icons/notebook';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import Target from '@lucide/svelte/icons/target';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import KeyRound from '@lucide/svelte/icons/key-round';
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

	// icons.md §2 #23·#36~39·#48~53: 빈 상태 기호 → Lucide 24(장식). 대응표에 없는 기호는 글자 그대로
	const LUCIDE = {
		'✓': CircleCheck,
		'🔍': SearchX,
		'📒': Notebook,
		'🗂': FolderOpen,
		'🗓': CalendarX,
		'◔': ChartPie,
		'📊': ChartColumn,
		'📈': ChartLine,
		'🎯': Target,
		'💼': Briefcase,
		'🔑': KeyRound
	} as const;
	// 이모지 표시 선택자(U+FE0F)가 붙은 '🗂️'도 같은 기호로 본다
	const glyph = $derived(LUCIDE[icon.replace(/\uFE0F/g, '') as keyof typeof LUCIDE]);
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
