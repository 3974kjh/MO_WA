<script lang="ts">
	import { scaleLinear, scalePoint } from 'd3';
	import type { ChartSeries } from '$lib/utils/assetCalculations';

	let {
		series = [],
		onSeriesSelect
	}: {
		series?: ChartSeries[];
		onSeriesSelect?: (assetId: string | null) => void;
	} = $props();

	let hidden = $state<Set<string>>(new Set());

	const visibleSeries = $derived(series.filter((item) => !hidden.has(item.id)));
	const points = $derived(visibleSeries.flatMap((item) => item.points));
	const xLabels = $derived([...new Set(points.map((point) => String(point.x)))]);
	const maxY = $derived(Math.max(1, ...points.map((point) => point.y)));
	const xScale = $derived(scalePoint<string>().domain(xLabels).range([32, 568]).padding(0.5));
	const yScale = $derived(scaleLinear().domain([0, maxY]).range([208, 24]));

	function pathFor(item: ChartSeries) {
		return item.points
			.map((point, index) => {
				const x = xScale(String(point.x)) ?? 32;
				const y = yScale(point.y);
				return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
			})
			.join(' ');
	}

	function toggle(id: string) {
		hidden = new Set(hidden.has(id) ? [...hidden].filter((item) => item !== id) : [...hidden, id]);
	}

	function selectSeries(id: string) {
		onSeriesSelect?.(id);
	}
</script>

<div class="grid gap-md">
	<svg viewBox="0 0 600 240" class="min-h-[260px] w-full rounded-lg bg-surface-tile-1 text-on-dark">
		{#each visibleSeries as item, index (item.id)}
			<path
				d={pathFor(item)}
				fill="none"
				stroke={index % 2 === 0 ? 'var(--color-primary-on-dark)' : 'var(--color-body-muted)'}
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			{#each item.points as point (`${item.id}-${point.x}`)}
				<circle
					cx={xScale(String(point.x)) ?? 32}
					cy={yScale(point.y)}
					r="4"
					fill={index % 2 === 0 ? 'var(--color-primary-on-dark)' : 'var(--color-body-muted)'}
				/>
			{/each}
		{/each}
	</svg>

	<div class="flex flex-wrap gap-sm">
		{#each series as item (item.id)}
			<button
				type="button"
				class="min-h-11 rounded-pill border border-hairline px-md text-[14px] tracking-[-0.224px] {hidden.has(
					item.id
				)
					? 'bg-canvas text-ink-muted-48'
					: 'bg-primary text-on-primary'}"
				onclick={() => {
					toggle(item.id);
					selectSeries(item.id);
				}}
			>
				{item.name}
			</button>
		{/each}
	</div>
</div>
