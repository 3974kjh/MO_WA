<script lang="ts">
	import ChartPending from '$lib/components/charts/ChartPending.svelte';

	let { deferred, height = 180 }: { deferred: Promise<void>; height?: 180 | 200 | 260 } = $props();
</script>

{#await deferred}
	<ChartPending {height} />
{:then}
	<div data-testid="chart-loaded" style="min-height:{height}px"></div>
{/await}
