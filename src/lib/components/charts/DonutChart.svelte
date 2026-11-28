<script lang="ts">
	/**
	 * 비중 도넛 (FE-14, DS §7-4, H §3·§13-5). 범례 표(색+이름+값+%)가 주 읽기 면이고 도넛은 보조.
	 * 최대 8조각: 6% 미만과 8조각을 넘는 작은 항목은 '기타'로 묶는다(groupDonut). 색은 chart-1~8만.
	 * 중앙 합계는 Money(축약 + 탭/클릭하면 정확한 값). 컨테이너가 480 미만이면 범례가 도넛 아래로 간다.
	 * 이 컴포넌트를 다른 화면으로 늘리지 않는다(포트폴리오 비중 전용, 원형 게이지 금지).
	 */
	import { arc as d3arc, pie as d3pie } from 'd3';
	import { donutSummary, groupDonut, type DonutInput } from '$lib/charts/layout';
	import DonutShell from './DonutShell.svelte';
	import type { Currency } from '$lib/format/money';
	import Money from '$lib/components/ui/Money.svelte';

	let {
		items,
		ariaLabel,
		center,
		sub,
		total,
		currency = 'KRW',
		valueKind = 'pct',
		class: className = ''
	}: {
		/** value는 비중(%) 또는 금액. 0 이하는 뺀다 */
		items: readonly DonutInput[];
		ariaLabel: string;
		/** 중앙 큰 글씨(total이 없을 때) */
		center?: string;
		/** 중앙 작은 글씨(예: '평가금액 기준') */
		sub?: string;
		/** 중앙 합계 금액(만 원 축약 + 정확한 값) */
		total?: number;
		currency?: Currency;
		/** 범례 '값' 열: pct면 %만, KRW·USD면 금액 + % */
		valueKind?: 'pct' | Currency;
		class?: string;
	} = $props();

	const SIZE = 180;
	const R = 70;
	const r = 46;

	let slices = $derived(groupDonut(items));
	let arcs = $derived.by(() => {
		const pie = d3pie<(typeof slices)[number]>()
			.sort(null)
			.value((s) => s.value)
			.padAngle(slices.length > 1 ? 0.024 : 0);
		const arc = d3arc<{ startAngle: number; endAngle: number; padAngle: number }>()
			.innerRadius(r)
			.outerRadius(R);
		return pie(slices).map((a) => ({ d: arc(a) ?? '', slice: a.data }));
	});
	let summary = $derived(donutSummary(ariaLabel, slices));
</script>

<div class="donut-chart {className}">
	<DonutShell {items} {ariaLabel} {valueKind}>
		<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} role="img" aria-label={summary}>
			<g transform="translate({SIZE / 2} {SIZE / 2})">
				{#each arcs as a, ai (ai)}
					<path d={a.d} fill={a.slice.color} />
				{/each}
			</g>
		</svg>
		{#if total !== undefined || center || sub}
			<div class="center">
				{#if total !== undefined}
					<b class="center-main"><Money value={total} {currency} label={sub ?? '합계'} /></b>
				{:else if center}
					<b class="center-main">{center}</b>
				{/if}
				{#if sub}<span class="center-sub">{sub}</span>{/if}
			</div>
		{/if}
	</DonutShell>
</div>

<style>
	.donut-chart {
		width: 100%;
	}
	.donut-chart :global(svg) {
		display: block;
	}
	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		text-align: center;
	}
	.center-main {
		pointer-events: auto;
		font-family: var(--font-num);
		font-weight: 700;
		font-size: 18px;
		color: var(--color-text);
	}
	.center-sub {
		font-size: 11px;
		color: var(--color-subtle);
	}
</style>
