<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3';
	import type { ChartSeries } from '$lib/utils/assetCalculations';

	let {
		series = []
	}: {
		series?: ChartSeries[];
	} = $props();

	const barSeries = $derived(series.find((item) => item.type === 'bar') ?? series[0]);
	const lineSeries = $derived(series.find((item) => item.type === 'line') ?? series[1]);
	const labels = $derived([...(barSeries?.points ?? [])].map((point) => String(point.x)));
	const maxY = $derived(
		Math.max(1, ...series.flatMap((item) => item.points.map((point) => Math.abs(point.y))))
	);
	const xScale = $derived(scaleBand<string>().domain(labels).range([32, 568]).padding(0.32));
	const yScale = $derived(scaleLinear().domain([-maxY, maxY]).range([208, 24]));
	const zeroY = $derived(yScale(0));

	const linePath = $derived(
		(lineSeries?.points ?? [])
			.map((point, index) => {
				const x = (xScale(String(point.x)) ?? 32) + (xScale.bandwidth?.() ?? 0) / 2;
				const y = yScale(point.y);
				return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
			})
			.join(' ')
	);
</script>

<svg viewBox="0 0 600 240" class="min-h-[260px] w-full rounded-lg bg-canvas-parchment">
	<line x1="24" x2="576" y1={zeroY} y2={zeroY} stroke="var(--color-hairline)" />
	{#each barSeries?.points ?? [] as point (`bar-${point.x}-${point.label}`)}
		{@const x = xScale(String(point.x)) ?? 32}
		{@const y = yScale(Math.max(0, point.y))}
		{@const height = Math.abs(yScale(point.y) - zeroY)}
		<rect
			{x}
			y={point.y >= 0 ? y : zeroY}
			width={xScale.bandwidth()}
			{height}
			rx="8"
			fill={point.y >= 0 ? 'var(--color-primary)' : 'var(--color-surface-tile-1)'}
		/>
	{/each}
	{#if linePath}
		<path
			d={linePath}
			fill="none"
			stroke="var(--color-ink)"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
</svg>
