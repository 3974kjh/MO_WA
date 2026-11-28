<script lang="ts">
	/**
	 * 선·막대 차트 지연 로드 자리. 로드 전에는 연한 자리(aria-busy), 실패하면 같은 칸 안에서
	 * '불러오지 못했어요' + 새로고침(밀림 없음). load는 lazyImport().load 같은 재호출 가능한 로더.
	 * 옛 배포 청크 404는 lazyImport 쪽이 60초 가드 안에서 한 번만 새로고침으로 복구한다.
	 */
	import type { Component } from 'svelte';
	import ChartPending from './ChartPending.svelte';

	let {
		load,
		height,
		props = {},
		onretry
	}: {
		load: () => Promise<{ default: Component<any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any
		height: 180 | 200 | 260;
		props?: Record<string, unknown>;
		onretry?: () => void;
	} = $props();
</script>

{#await load()}
	<ChartPending {height} />
{:then { default: Comp }}
	<Comp {...props} />
{:catch}
	<ChartPending {height} failed {onretry} />
{/await}
