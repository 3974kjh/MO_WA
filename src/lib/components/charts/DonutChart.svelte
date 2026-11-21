<script lang="ts">
	/**
	 * 비중 도넛 (FE-14, DS §7-4, H §3·§13-5). 범례 표(색+이름+값+%)가 주 읽기 면이고 도넛은 보조.
	 * 최대 8조각: 6% 미만과 8조각을 넘는 작은 항목은 '기타'로 묶는다(groupDonut). 색은 chart-1~8만.
	 * 중앙 합계는 Money(축약 + 탭/클릭하면 정확한 값). 컨테이너가 480 미만이면 범례가 도넛 아래로 간다.
	 * 이 컴포넌트를 다른 화면으로 늘리지 않는다(포트폴리오 비중 전용, 원형 게이지 금지).
	 */
	import { arc as d3arc, pie as d3pie } from 'd3';
	import { donutSummary, groupDonut, isMobileChart, type DonutInput } from '$lib/charts/layout';
	import { observeWidth } from '$lib/charts/observeWidth';
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

	let width = $state(600);
	let stacked = $derived(isMobileChart(width));
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

<div class="donut-wrap {className}" class:stacked {@attach observeWidth((w) => (width = w || 600))}>
	<div class="donut">
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
	</div>
	<table class="leg-table">
		<caption class="sr-only">{ariaLabel} 범례</caption>
		<tbody>
			{#each slices as s, si (si)}
				<tr>
					<th scope="row">
						<i style:background={s.color} aria-hidden="true"></i>{s.label}
						{#if s.members}<span class="members">{s.members.join(', ')}</span>{/if}
					</th>
					{#if valueKind !== 'pct'}
						<td class="num"><Money value={s.value} currency={valueKind} label={s.label} /></td>
					{/if}
					<td class="num pct">{s.pct.toFixed(1)}%</td>
				</tr>
			{:else}
				<tr><td class="empty" colspan="3">표시할 비중이 없습니다</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.donut-wrap {
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.donut-wrap.stacked {
		flex-direction: column;
		align-items: stretch;
	}
	.donut {
		position: relative;
		flex: none;
		width: 180px;
		height: 180px;
		margin: 0 auto;
	}
	.donut svg {
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
	.leg-table {
		flex: 1 1 auto;
		width: 100%;
		font-size: var(--text-sm);
		border-collapse: collapse;
	}
	.leg-table th,
	.leg-table td {
		padding: 5px 0;
		font-weight: 400;
		text-align: left;
		vertical-align: top;
	}
	.leg-table td.num {
		text-align: right;
		font-family: var(--font-num);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		padding-left: 12px;
		white-space: nowrap;
	}
	.leg-table i {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
		margin-right: 8px;
	}
	.members {
		display: block;
		margin-left: 18px;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.empty {
		color: var(--color-muted);
	}
</style>
