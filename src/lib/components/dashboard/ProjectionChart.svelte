<script lang="ts">
	import { scaleLinear, scalePoint } from 'd3';
	import { formatCurrency } from '$lib/components/datagrid/formatters';
	import type { ChartSeries } from '$lib/utils/assetCalculations';

	let {
		series = [],
		privacyHidden = false
	}: {
		series?: ChartSeries[];
		privacyHidden?: boolean;
	} = $props();

	const netWorthSeries = $derived(series.find((item) => item.id === 'projected-net-worth'));
	const assetSeries = $derived(series.find((item) => item.id === 'projected-assets'));
	const cashflowSeries = $derived(series.find((item) => item.id === 'fixed-cashflow'));
	const labels = $derived((netWorthSeries?.points ?? []).map((point) => String(point.x)));
	const values = $derived(series.flatMap((item) => item.points.map((point) => point.y)));
	const minY = $derived(Math.min(0, ...values));
	const maxY = $derived(Math.max(1, ...values));
	const xScale = $derived(scalePoint<string>().domain(labels).range([48, 552]).padding(0.35));
	const yScale = $derived(scaleLinear().domain([minY, maxY]).range([220, 24]).nice());
	const zeroY = $derived(yScale(0));
	const netWorthPath = $derived(toPath(netWorthSeries, xScale, yScale));
	const assetPath = $derived(toPath(assetSeries, xScale, yScale));
	const assetAreaPath = $derived(toAreaPath(assetSeries, xScale, yScale, zeroY));

	function toPath(
		item: ChartSeries | undefined,
		x: ReturnType<typeof scalePoint<string>>,
		y: ReturnType<typeof scaleLinear>
	) {
		return (item?.points ?? [])
			.map((point, index) => {
				const px = x(String(point.x)) ?? 48;
				return `${index === 0 ? 'M' : 'L'} ${px} ${y(point.y)}`;
			})
			.join(' ');
	}

	function toAreaPath(
		item: ChartSeries | undefined,
		x: ReturnType<typeof scalePoint<string>>,
		y: ReturnType<typeof scaleLinear>,
		baseline: number
	) {
		const points = item?.points ?? [];
		if (points.length === 0) return '';
		const top = points
			.map((point, index) => {
				const px = x(String(point.x)) ?? 48;
				return `${index === 0 ? 'M' : 'L'} ${px} ${y(point.y)}`;
			})
			.join(' ');
		const lastX = x(String(points.at(-1)?.x)) ?? 552;
		const firstX = x(String(points[0].x)) ?? 48;
		return `${top} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
	}

	function amount(value: number) {
		return privacyHidden ? '••••••' : formatCurrency(value);
	}
</script>

<div class="grid gap-md">
	<svg viewBox="0 0 600 260" class="min-h-[320px] w-full rounded-lg bg-canvas-parchment">
		<line x1="36" x2="572" y1={zeroY} y2={zeroY} stroke="var(--color-hairline)" />
		{#each yScale.ticks(4) as tick (tick)}
			<line
				x1="36"
				x2="572"
				y1={yScale(tick)}
				y2={yScale(tick)}
				stroke="var(--color-divider-soft)"
			/>
		{/each}

		{#each cashflowSeries?.points ?? [] as point (`cashflow-${point.x}`)}
			{@const x = xScale(String(point.x)) ?? 48}
			{@const barWidth = 24}
			{@const y = yScale(Math.max(0, point.y))}
			{@const height = Math.abs(yScale(point.y) - zeroY)}
			<rect
				x={x - barWidth / 2}
				y={point.y >= 0 ? y : zeroY}
				width={barWidth}
				{height}
				rx="8"
				fill={point.y >= 0 ? 'var(--color-primary)' : 'var(--color-surface-tile-1)'}
				opacity="0.28"
			/>
		{/each}

		{#if assetAreaPath}
			<path d={assetAreaPath} fill="var(--color-primary)" opacity="0.12" />
		{/if}
		{#if assetPath}
			<path
				d={assetPath}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				opacity="0.6"
			/>
		{/if}
		{#if netWorthPath}
			<path
				d={netWorthPath}
				fill="none"
				stroke="var(--color-ink)"
				stroke-width="4"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}

		{#each netWorthSeries?.points ?? [] as point (`net-${point.x}`)}
			{@const x = xScale(String(point.x)) ?? 48}
			<circle cx={x} cy={yScale(point.y)} r="5" fill="var(--color-ink)" />
			<text {x} y="246" text-anchor="middle" fill="var(--color-ink-muted-48)" font-size="12">
				{point.x}
			</text>
		{/each}
	</svg>

	<div
		class="grid gap-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80 sm:grid-cols-3"
	>
		{#each series as item (item.id)}
			<div class="rounded-md bg-surface-pearl p-sm">
				<p class="font-semibold text-ink">{item.name}</p>
				<p>{amount(item.points.at(-1)?.y ?? 0)}</p>
			</div>
		{/each}
	</div>
</div>
