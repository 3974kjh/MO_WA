<script lang="ts">
	/** 도넛 지연 자리: 범례는 즉시 그리고, 180 칸만 연한 면으로 비워 둔다. */
	import type { DonutInput } from '$lib/charts/layout';
	import type { Currency } from '$lib/format/money';
	import DonutShell from './DonutShell.svelte';

	let {
		items,
		ariaLabel,
		valueKind = 'pct'
	}: {
		items: readonly DonutInput[];
		ariaLabel: string;
		valueKind?: 'pct' | Currency;
	} = $props();
</script>

<DonutShell {items} {ariaLabel} {valueKind}>
	<div class="chart-pending" aria-busy="true"></div>
</DonutShell>

<style>
	.chart-pending {
		width: 100%;
		height: 100%;
		background: var(--color-surface-2);
		border-radius: var(--radius-md);
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
