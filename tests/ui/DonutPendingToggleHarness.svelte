<script lang="ts">
	import DonutPending from '$lib/components/charts/DonutPending.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import type { DonutInput } from '$lib/charts/layout';
	import type { Currency } from '$lib/format/money';

	let {
		deferred,
		items,
		ariaLabel = '보유 종목 비중',
		valueKind = 'KRW' as const
	}: {
		deferred: Promise<void>;
		items: readonly DonutInput[];
		ariaLabel?: string;
		valueKind?: 'pct' | Currency;
	} = $props();
</script>

{#await deferred}
	<DonutPending {items} {ariaLabel} {valueKind} />
{:then}
	<DonutChart
		{items}
		{ariaLabel}
		{valueKind}
		total={items.reduce((a, i) => a + i.value, 0)}
		sub="총 평가금액"
	/>
{/await}
