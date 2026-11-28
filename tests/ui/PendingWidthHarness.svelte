<script lang="ts">
	/** 칸 폭을 정해 ChartPending 높이 규칙(컨테이너 기준)을 검증한다. */
	import ChartPending from '$lib/components/charts/ChartPending.svelte';

	let { width, height }: { width: number; height: 180 | 200 | 260 } = $props();
</script>

<div style="width:{width}px"><ChartPending {height} /></div>
