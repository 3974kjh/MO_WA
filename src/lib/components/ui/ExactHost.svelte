<script lang="ts">
	/**
	 * 축약 금액의 정확한 값 시트·팝오버(앱에 하나씩)를 쓸 때(또는 앱 화면에서 한가할 때) 불러온다 — 첫 화면 번들에 넣지 않는다.
	 * 청크가 끝내 안 오면 조용히 죽지 않고 상태를 되돌린 뒤 안내(토스트 + 새로고침)를 보인다. 복구 규칙은 lazyImport.
	 * 미리 받기는 금액을 탭할 수 있는 (app) 화면에서만 한다(/login 등은 금액이 없어 바이트만 는다).
	 */
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import { idleImport } from '$lib/lazy';
	import { lazyImport, notifyChunkFailed } from '$lib/lazyImport';
	import { exactPopover, exactValue } from './exactValue.svelte';

	type Loader = () => Promise<{ default: Component }>;
	let {
		sheetLoader = () => import('./ExactValueSheet.svelte'),
		popoverLoader = () => import('./ExactPopover.svelte')
	}: {
		/** 테스트용: 시트·팝오버 로더 */
		sheetLoader?: Loader;
		popoverLoader?: Loader;
	} = $props();

	let SheetComp = $state<Component | null>(null);
	let PopoverComp = $state<Component | null>(null);

	// 컴포넌트가 사는 동안 로더는 바뀌지 않는다(테스트 주입용 prop)
	// svelte-ignore state_referenced_locally
	const sheetChunk = lazyImport(sheetLoader);
	// svelte-ignore state_referenced_locally
	const popoverChunk = lazyImport(popoverLoader);

	async function loadSheet(silent = false) {
		if (!SheetComp) SheetComp = (await sheetChunk.load({ silent })).default;
	}
	async function loadPopover(silent = false) {
		if (!PopoverComp) PopoverComp = (await popoverChunk.load({ silent })).default;
	}

	// 열려는 순간 청크가 안 오면 상태를 되돌리고(다음 탭이 다시 시도) 안내한다
	$effect(() => {
		if (exactValue.open)
			loadSheet().catch(() => {
				exactValue.close();
				notifyChunkFailed('정확한 금액을 불러오지 못했어요');
			});
	});
	$effect(() => {
		if (exactPopover.open)
			loadPopover().catch(() => {
				exactPopover.hide();
				notifyChunkFailed('정확한 금액을 불러오지 못했어요');
			});
	});

	let inApp = $derived(page.route.id?.startsWith('/(app)') ?? false);
	$effect(() => {
		if (!inApp) return;
		idleImport(() => loadSheet(true));
		idleImport(() => loadPopover(true));
	});
</script>

{#if SheetComp}
	<SheetComp />
{/if}
{#if PopoverComp}
	<PopoverComp />
{/if}
