<script lang="ts">
	/** LazyChart.svelte.spec.ts 전용: 칸 폭을 정해 두고 LazyChart를 그린다. */
	import LazyChart from '$lib/components/charts/LazyChart.svelte';
	import LazyDonut from '$lib/components/charts/LazyDonut.svelte';

	let {
		load,
		kind = 'line',
		width = 600,
		onretry
	}: {
		load: () => Promise<{ default: import('svelte').Component<any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any
		kind?: 'line' | 'donut';
		width?: number;
		onretry?: () => void;
	} = $props();
</script>

<div data-testid="host" style="width:{width}px">
	{#if kind === 'donut'}
		<LazyDonut
			{load}
			{onretry}
			items={[
				{ label: 'A', value: 60 },
				{ label: 'B', value: 40 }
			]}
			ariaLabel="비중"
		/>
	{:else}
		<LazyChart {load} {onretry} height={260} props={{ labels: ['a'], series: [] }} />
	{/if}
</div>
