<script lang="ts">
	import { scaleLinear } from 'd3';
	import type { ChartSeries } from '$lib/utils/assetCalculations';

	let {
		series = []
	}: {
		series?: ChartSeries[];
	} = $props();

	const categories = $derived(series.map((item) => item.name));
	const maxY = $derived(
		Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.y)))
	);
	const yScale = $derived(scaleLinear().domain([0, maxY]).range([180, 24]));

	function polygonFor(item: ChartSeries) {
		return item.points
			.map((point, index) => {
				const angle = (Math.PI * 2 * index) / item.points.length - Math.PI / 2;
				const radius = (yScale(point.y) - 102) * 0.55;
				const x = 150 + Math.cos(angle) * radius;
				const y = 102 + Math.sin(angle) * radius;
				return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
			})
			.join(' ');
	}
</script>

<div class="grid gap-md md:grid-cols-2">
	<svg viewBox="0 0 300 220" class="min-h-[220px] w-full rounded-lg bg-surface-tile-1 text-on-dark">
		{#each series as item, index (item.id)}
			<path
				d={`${polygonFor(item)} Z`}
				fill="none"
				stroke={index === 0
					? 'var(--color-primary-on-dark)'
					: index === 1
						? 'var(--color-body-muted)'
						: 'var(--color-ink-muted-48)'}
				stroke-width="2"
				opacity="0.9"
			/>
		{/each}
		{#each categories as label, index (label)}
			<text
				x={150}
				y={24 + index * 16}
				text-anchor="middle"
				class="fill-current text-[12px] opacity-80"
			>
				{label}
			</text>
		{/each}
	</svg>

	<ul class="grid gap-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80">
		{#each series as item (item.id)}
			<li class="rounded-md bg-canvas-parchment p-sm">
				<span class="font-semibold text-ink">{item.name}</span>
				현재 {item.points[0]?.y ?? 0}% · 목표 {item.points[1]?.y ?? 0}%
			</li>
		{/each}
	</ul>
</div>
