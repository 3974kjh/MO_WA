<script lang="ts">
	/** 도넛 지연 로드 자리: 범례는 즉시, 180 칸은 연한 자리 → 차트, 실패하면 같은 칸에서 안내+새로고침. */
	import type { Component, ComponentProps } from 'svelte';
	import type DonutChart from './DonutChart.svelte';
	import DonutPending from './DonutPending.svelte';

	let {
		load,
		onretry,
		...props
	}: {
		load: () => Promise<{ default: Component<ComponentProps<typeof DonutChart>> }>;
		onretry?: () => void;
	} & ComponentProps<typeof DonutChart> = $props();
</script>

{#await load()}
	<DonutPending items={props.items} ariaLabel={props.ariaLabel} valueKind={props.valueKind} />
{:then { default: Comp }}
	<Comp {...props} />
{:catch}
	<DonutPending
		items={props.items}
		ariaLabel={props.ariaLabel}
		valueKind={props.valueKind}
		failed
		{onretry}
	/>
{/await}
