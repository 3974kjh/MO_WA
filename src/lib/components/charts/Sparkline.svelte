<script lang="ts">
	/**
	 * 스파크라인 (FE-14, DS §7-4): 표·타일 안 추세. 기본 84×28, 끝점 원.
	 * 시작보다 끝이 높으면 빨강(up), 낮으면 파랑(down), 같으면 회색. `tone`으로 색을 직접 줄 수도 있다(카테고리 색 등).
	 */
	import { line, scaleLinear } from 'd3';
	import { sparkSummary, TONE_COLOR, trendTone } from '$lib/charts/layout';

	let {
		values,
		label,
		w = 84,
		h = 28,
		tone = 'auto',
		class: className = ''
	}: {
		values: readonly number[];
		/** 접근 이름(예: '코스피 8일 추이'). 상승/하락 단어가 자동으로 붙는다 */
		label: string;
		w?: number;
		h?: number;
		/** 'auto'면 시작→끝 등락으로 색을 정한다. 그 밖의 값은 CSS 색(예: var(--color-chart-3)) */
		tone?: 'auto' | string;
		class?: string;
	} = $props();

	let pts = $derived(values.filter(Number.isFinite));
	let color = $derived(tone === 'auto' ? TONE_COLOR[trendTone(pts)] : tone);
	let geo = $derived.by(() => {
		if (pts.length < 2) return null;
		const lo = Math.min(...pts);
		const hi = Math.max(...pts);
		const x = scaleLinear()
			.domain([0, pts.length - 1])
			.range([2, w - 2]);
		const y = scaleLinear()
			.domain(lo === hi ? [lo - 1, hi + 1] : [lo, hi])
			.range([h - 3, 3]);
		const d = line<number>()
			.x((_, i) => x(i))
			.y((v) => y(v))(pts);
		return { d: d ?? '', cx: x(pts.length - 1), cy: y(pts[pts.length - 1]) };
	});
</script>

<svg
	class="spark {className}"
	width={w}
	height={h}
	viewBox="0 0 {w} {h}"
	role="img"
	aria-label={sparkSummary(label, pts)}
>
	{#if geo}
		<path
			d={geo.d}
			fill="none"
			stroke={color}
			stroke-width="1.8"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
		<circle cx={geo.cx} cy={geo.cy} r="2.5" fill={color} />
	{/if}
</svg>

<style>
	.spark {
		display: inline-block;
		vertical-align: middle;
		overflow: visible;
	}
</style>
