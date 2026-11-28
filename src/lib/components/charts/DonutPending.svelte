<script lang="ts">
	/** 도넛 지연 자리: 범례는 즉시 그리고, 180 칸만 연한 면으로 비워 둔다. */
	import type { DonutInput } from '$lib/charts/layout';
	import type { Currency } from '$lib/format/money';
	import DonutShell from './DonutShell.svelte';
	import ChartFailBody from './ChartFailBody.svelte';

	let {
		items,
		ariaLabel,
		valueKind = 'pct',
		failed = false,
		onretry
	}: {
		items: readonly DonutInput[];
		ariaLabel: string;
		valueKind?: 'pct' | Currency;
		/** 청크 로드 실패: 180 칸 안에서 안내와 새로고침 버튼(범례는 그대로) */
		failed?: boolean;
		onretry?: () => void;
	} = $props();
</script>

<DonutShell {items} {ariaLabel} {valueKind}>
	<div
		class="chart-pending"
		data-failed={failed ? '' : undefined}
		aria-busy={failed ? undefined : 'true'}
	>
		{#if failed}<ChartFailBody {onretry} />{/if}
	</div>
</DonutShell>

<style>
	.chart-pending {
		width: 100%;
		height: 100%;
		background: var(--color-surface-2);
		border-radius: var(--radius-md);
	}
	.chart-pending[data-failed] {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	:global(:root[data-theme='dark']) .chart-pending {
		background: var(--color-surface-3);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light']):not([data-theme='dark'])) .chart-pending {
			background: var(--color-surface-3);
		}
	}
</style>
