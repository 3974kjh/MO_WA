<script lang="ts">
	/**
	 * 선(+영역) 차트 (FE-14, DS §7-4, H §3): 지수·평가금액 추이. 1~3 시리즈, 마지막 점 강조, 격자 5줄, 기준선 점선(앰버) 옵션.
	 * 컨테이너 폭을 관찰해 다시 그린다. <480: 높이 190, X축 눈금 4개 이내, 탭하면 아래 값 카드. ≥480: 마우스 툴팁.
	 * 접근성: svg role="img" + 요약 aria-label, 값 전체는 숨김 데이터 표.
	 */
	import { area as d3area, line as d3line, scaleLinear } from 'd3';
	import {
		categoryColor,
		chartHeight,
		isMobileChart,
		LINE_DEFAULT_HEIGHT,
		lineSummary,
		lineTickMax,
		nearestIndex,
		plainNumber,
		xTickIndices
	} from '$lib/charts/layout';
	import { observeWidth } from '$lib/charts/observeWidth';
	import ChartReadout from './ChartReadout.svelte';

	export interface LineSeries {
		name: string;
		values: readonly number[];
		/** 생략하면 순서대로 chart-1~8 */
		color?: string;
	}

	let {
		series,
		labels,
		ariaLabel,
		area = false,
		refLine,
		height,
		digits = 0,
		format,
		class: className = ''
	}: {
		series: readonly LineSeries[];
		labels: readonly string[];
		/** 차트 제목(요약 문장이 뒤에 자동으로 붙는다) */
		ariaLabel: string;
		/** 첫 시리즈 아래 영역 채움 */
		area?: boolean;
		/** 기준선(점선, 앰버) */
		refLine?: { v: number; label: string };
		/** ≥480에서의 높이(기본 260). <480은 항상 190 */
		height?: number;
		/** 축·값 표기 소수 자릿수 */
		digits?: number;
		/** 값 표기 함수(지정하면 digits 대신 사용) */
		format?: (v: number) => string;
		class?: string;
	} = $props();

	let width = $state(600);
	let mobile = $derived(isMobileChart(width));
	let H = $derived(chartHeight(width, height, LINE_DEFAULT_HEIGHT));
	let fmt = $derived(format ?? ((v: number) => plainNumber(v, digits)));
	let m = $derived({ l: mobile ? 44 : 54, r: 12, t: 12, b: 26 });
	let n = $derived(labels.length);
	let colors = $derived(series.map((s, k) => s.color ?? categoryColor(k)));

	let geo = $derived.by(() => {
		const all = series.flatMap((s) => s.values.filter(Number.isFinite));
		if (refLine && Number.isFinite(refLine.v)) all.push(refLine.v);
		if (all.length === 0 || n === 0) return null;
		let lo = Math.min(...all);
		let hi = Math.max(...all);
		const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
		lo -= pad;
		hi += pad;
		const iw = Math.max(1, width - m.l - m.r);
		const ih = Math.max(1, H - m.t - m.b);
		const x = scaleLinear()
			.domain([0, Math.max(1, n - 1)])
			.range([m.l, m.l + iw]);
		const y = scaleLinear()
			.domain([lo, hi])
			.range([m.t + ih, m.t]);
		const grid = Array.from({ length: 5 }, (_, g) => lo + ((hi - lo) * g) / 4);
		const defined = (v: number) => Number.isFinite(v);
		const lineGen = d3line<number>()
			.defined(defined)
			.x((_, i) => x(i))
			.y((v) => y(v));
		const areaGen = d3area<number>()
			.defined(defined)
			.x((_, i) => x(i))
			.y0(m.t + ih)
			.y1((v) => y(v));
		const paths = series.map((s) => {
			const vals = [...s.values];
			let li = vals.length - 1;
			while (li >= 0 && !Number.isFinite(vals[li])) li--;
			return {
				d: lineGen(vals) ?? '',
				last: li >= 0 ? { cx: x(li), cy: y(vals[li]) } : null
			};
		});
		return {
			x,
			y,
			iw,
			ih,
			grid,
			paths,
			areaD: area && series[0] ? (areaGen([...series[0].values]) ?? '') : '',
			ticks: xTickIndices(n, lineTickMax(width))
		};
	});

	let summary = $derived(lineSummary(ariaLabel, series, labels, fmt));

	// 값 읽기: hover(≥480 마우스) / selected(<480 탭)
	let hover = $state<number | null>(null);
	let selected = $state<number | null>(null);
	let active = $derived(mobile ? selected : hover);

	function indexAt(e: PointerEvent): number | null {
		if (!geo) return null;
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		return nearestIndex(e.clientX - rect.left, m.l, geo.iw, n);
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
		return series.map((s, k) => ({
			name: s.name,
			value: Number.isFinite(s.values[i]) ? fmt(s.values[i]) : '—',
			color: colors[k]
		}));
	}
</script>

<div class="line-chart {className}" {@attach observeWidth((w) => (width = w || 600))}>
	<!-- 포인터 보조 읽기(툴팁·값 카드). 같은 값은 키보드·낭독기용 숨김 데이터 표로 제공한다. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="plot" onpointermove={onmove} onpointerleave={() => (hover = null)} onpointerup={onup}>
		<svg class="chart" {width} height={H} role="img" aria-label={summary}>
			{#if geo}
				{#each geo.grid as g, gi (gi)}
					<line class="grid-line" x1={m.l} x2={width - m.r} y1={geo.y(g)} y2={geo.y(g)} />
					<text x={m.l - 6} y={geo.y(g) + 4} text-anchor="end">{fmt(g)}</text>
				{/each}
				{#each geo.ticks as i (i)}
					<text
						x={geo.x(i)}
						y={H - 6}
						text-anchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{labels[i]}</text
					>
				{/each}
				{#if refLine && Number.isFinite(refLine.v)}
					<line
						class="ref-line"
						x1={m.l}
						x2={width - m.r}
						y1={geo.y(refLine.v)}
						y2={geo.y(refLine.v)}
					/>
					<text class="ref-label" x={m.l + 4} y={geo.y(refLine.v) - 4} text-anchor="start"
						>{refLine.label}</text
					>
				{/if}
				{#if geo.areaD}
					<path d={geo.areaD} fill={colors[0]} opacity="0.1" />
				{/if}
				{#each geo.paths as p, k (k)}
					<path d={p.d} fill="none" stroke={colors[k]} stroke-width="2" stroke-linejoin="round" />
					{#if p.last}
						<circle
							cx={p.last.cx}
							cy={p.last.cy}
							r="4"
							fill={colors[k]}
							stroke="var(--color-surface)"
							stroke-width="2"
						/>
					{/if}
					{#if active !== null && Number.isFinite(series[k].values[active])}
						<circle
							cx={geo.x(active)}
							cy={geo.y(series[k].values[active])}
							r="3.5"
							fill={colors[k]}
						/>
					{/if}
				{/each}
			{/if}
		</svg>
		{#if !mobile && hover !== null && geo}
			<ChartReadout
				mode="tooltip"
				title={labels[hover] ?? ''}
				rows={rowsAt(hover)}
				left={Math.min(Math.max(geo.x(hover), 60), width - 60)}
			/>
		{/if}
	</div>
	{#if mobile && selected !== null}
		<ChartReadout
			mode="card"
			title={labels[selected] ?? ''}
			rows={rowsAt(selected)}
			onclose={() => (selected = null)}
		/>
	{/if}
	<table class="sr-only">
		<caption>{ariaLabel}</caption>
		<thead>
			<tr>
				<th scope="col">구간</th>
				{#each series as s (s.name)}<th scope="col">{s.name}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each labels as lb, i (i)}
				<tr>
					<th scope="row">{lb}</th>
					{#each series as s (s.name)}<td
							>{Number.isFinite(s.values[i]) ? fmt(s.values[i]) : '—'}</td
						>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.line-chart {
		position: relative;
		width: 100%;
	}
	.plot {
		position: relative;
		touch-action: pan-y;
	}
	.chart {
		display: block;
		width: 100%;
	}
	.chart text {
		font-family: var(--font-num);
		font-size: 11px;
		fill: var(--color-chart-axis);
		font-variant-numeric: tabular-nums;
	}
	.grid-line {
		stroke: var(--color-chart-grid);
		stroke-width: 1;
	}
	.ref-line {
		stroke: var(--color-warn-fill);
		stroke-dasharray: 4 4;
	}
	.chart .ref-label {
		fill: var(--color-warn);
	}
</style>
