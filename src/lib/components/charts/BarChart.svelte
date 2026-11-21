<script lang="ts">
	/**
	 * 막대 차트 (FE-14, DS §7-4, H §3): 일별 등락률·평균 단가 대비 손익. 양수 빨강(up)/음수 파랑(down) + 값 라벨, 0선.
	 * 세로축은 0을 항상 포함하고 값이 있는 쪽에만 여유를 둬서 음수만 있어도 자연스럽다(barDomain).
	 * <480: 높이 190, 이름 눈금 5개·값 라벨 5개 간격, 탭하면 아래 값 카드. ≥480: 마우스 툴팁.
	 */
	import { scaleBand, scaleLinear } from 'd3';
	import {
		BAR_DEFAULT_HEIGHT,
		bandIndex,
		barDomain,
		barLabelVisible,
		barShape,
		barSummary,
		barTickIndices,
		chartHeight,
		isMobileChart,
		signedNumber
	} from '$lib/charts/layout';
	import { observeWidth } from '$lib/charts/observeWidth';
	import ChartReadout from './ChartReadout.svelte';

	export interface BarItem {
		label: string;
		value: number;
	}

	let {
		items,
		ariaLabel,
		height,
		digits = 1,
		unit = '%',
		class: className = ''
	}: {
		items: readonly BarItem[];
		ariaLabel: string;
		/** ≥480에서의 높이(기본 200). <480은 항상 190 */
		height?: number;
		/** 값 라벨 소수 자릿수 */
		digits?: number;
		/** 축·값 카드 단위(값 라벨에는 붙이지 않는다) */
		unit?: string;
		class?: string;
	} = $props();

	let width = $state(600);
	let mobile = $derived(isMobileChart(width));
	let H = $derived(chartHeight(width, height, BAR_DEFAULT_HEIGHT));
	const m = { l: 44, r: 8, t: 18, b: 26 };
	let n = $derived(items.length);
	let fmtValue = $derived((v: number) => signedNumber(v, digits));
	let fmtUnit = $derived((v: number) =>
		Number.isFinite(v) ? signedNumber(v, digits) + unit : signedNumber(v, digits)
	);

	let geo = $derived.by(() => {
		if (n === 0) return null;
		const [lo, hi] = barDomain(items.map((i) => i.value));
		const iw = Math.max(1, width - m.l - m.r);
		const ih = Math.max(1, H - m.t - m.b);
		const y = scaleLinear()
			.domain([lo, hi])
			.range([m.t + ih, m.t]);
		const x = scaleBand<number>()
			.domain(items.map((_, i) => i))
			.range([m.l, m.l + iw]);
		const bw = Math.max(1, Math.min(28, x.bandwidth() * 0.6));
		const y0 = y(0);
		const span = hi - lo;
		// 위·아래 끝 보조선: 0과 너무 가까우면(5% 이하) 생략
		const ends = [hi, lo].filter((v) => Math.abs(v) > span * 0.05);
		const bars = items.map((it, i) => {
			const cx = (x(i) ?? 0) + x.bandwidth() / 2;
			// 비유한 값은 shape=null(rect·값 라벨 생략). 배열에서 빼지 않아 인덱스·눈금 cx는 items와 맞는다.
			return { cx, x: cx - bw / 2, w: bw, shape: barShape(it.value, y, y0) };
		});
		return { y, y0, iw, ends, bars, ticks: barTickIndices(n, mobile) };
	});

	let summary = $derived(barSummary(ariaLabel, items, fmtUnit));

	let hover = $state<number | null>(null);
	let selected = $state<number | null>(null);

	function indexAt(e: PointerEvent): number | null {
		if (!geo) return null;
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		return bandIndex(e.clientX - rect.left, m.l, geo.iw, n);
	}
	function onmove(e: PointerEvent) {
		if (mobile || e.pointerType !== 'mouse') return;
		hover = indexAt(e);
	}
	function onup(e: PointerEvent) {
		if (!mobile) return;
		const i = indexAt(e);
		selected = selected === i ? null : i;
	}
	function rowsAt(i: number) {
		const v = items[i]?.value;
		return [{ name: ariaLabel, value: Number.isFinite(v) ? fmtUnit(v) : '—' }];
	}
	// 그려지지 않은(shape null) 막대는 강조할 대상이 없으므로 hover/selected로 흐림을 켜지 않는다.
	let active = $derived.by(() => {
		const i = mobile ? selected : hover;
		return i !== null && geo?.bars[i]?.shape ? i : null;
	});
</script>

<div
	class="bar-chart {className}"
	style:--chart-h="{height ?? BAR_DEFAULT_HEIGHT}px"
	{@attach observeWidth((w) => (width = w || 600))}
>
	<!-- 포인터 보조 읽기(툴팁·값 카드). 같은 값은 키보드·낭독기용 숨김 데이터 표로 제공한다. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="plot" onpointermove={onmove} onpointerleave={() => (hover = null)} onpointerup={onup}>
		<svg class="chart" {width} height={H} role="img" aria-label={summary}>
			{#if geo}
				<line class="zero-line" x1={m.l} x2={width - m.r} y1={geo.y0} y2={geo.y0} />
				{#each geo.ends as v (v)}
					<line
						class="grid-line"
						x1={m.l}
						x2={width - m.r}
						y1={geo.y(v)}
						y2={geo.y(v)}
						stroke-dasharray="2 3"
					/>
					<text x={m.l - 6} y={geo.y(v) + 4} text-anchor="end">{signedNumber(v, 0)}{unit}</text>
				{/each}
				<text x={m.l - 6} y={geo.y0 + 4} text-anchor="end">0</text>
				{#each geo.bars as b, i (i)}
					{#if b.shape}
						<rect
							x={b.x}
							y={b.shape.y}
							width={b.w}
							height={b.shape.h}
							rx="2"
							fill={b.shape.up ? 'var(--color-up)' : 'var(--color-down)'}
							opacity={active !== null && active !== i ? 0.55 : 1}
						/>
						{#if barLabelVisible(i, n, mobile)}
							<text class="val" x={b.cx} y={b.shape.ly} text-anchor="middle"
								>{fmtValue(items[i].value)}</text
							>
						{/if}
					{/if}
				{/each}
				{#each geo.ticks as i (i)}
					<text x={geo.bars[i].cx} y={H - 6} text-anchor="middle">{items[i].label}</text>
				{/each}
			{/if}
		</svg>
		{#if !mobile && hover !== null && geo}
			<ChartReadout
				mode="tooltip"
				title={items[hover]?.label ?? ''}
				rows={rowsAt(hover)}
				left={Math.min(Math.max(geo.bars[hover].cx, 60), width - 60)}
			/>
		{/if}
	</div>
	{#if mobile && selected !== null}
		<ChartReadout
			mode="card"
			title={items[selected]?.label ?? ''}
			rows={rowsAt(selected)}
			onclose={() => (selected = null)}
		/>
	{/if}
	<table class="sr-only">
		<caption>{ariaLabel}</caption>
		<thead><tr><th scope="col">구간</th><th scope="col">값</th></tr></thead>
		<tbody>
			{#each items as it, i (i)}
				<tr>
					<th scope="row">{it.label}</th>
					<td>{Number.isFinite(it.value) ? fmtUnit(it.value) : '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.bar-chart {
		position: relative;
		width: 100%;
		/* SSR 첫 렌더에서도 폭(<480)에 맞는 높이를 CSS로 잡아 CLS를 줄인다 */
		container-type: inline-size;
	}
	.plot {
		position: relative;
		touch-action: pan-y;
		height: var(--chart-h);
	}
	@container (max-width: 479.98px) {
		.plot {
			height: 190px;
		}
	}
	.chart {
		display: block;
		width: 100%;
		height: 100%;
	}
	.chart text {
		font-family: var(--font-num);
		font-size: 11px;
		fill: var(--color-chart-axis);
		font-variant-numeric: tabular-nums;
	}
	.chart .val {
		font-size: 10px;
	}
	.grid-line {
		stroke: var(--color-chart-grid);
		stroke-width: 1;
	}
	.zero-line {
		stroke: var(--color-chart-axis);
		stroke-width: 1;
	}
</style>
