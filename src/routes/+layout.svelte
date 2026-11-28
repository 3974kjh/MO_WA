<script lang="ts">
	import '../app.css';
	import { onMount, type Component } from 'svelte';
	import ToastHost from '$lib/components/ui/ToastHost.svelte';
	import { exactPopover, exactValue } from '$lib/components/ui/exactValue.svelte';
	import { idleImport } from '$lib/lazy';

	let { children } = $props();

	let ExactValueSheetComp = $state<Component | null>(null);
	let ExactPopoverComp = $state<Component | null>(null);

	async function loadExactSheet() {
		if (!ExactValueSheetComp)
			ExactValueSheetComp = (await import('$lib/components/ui/ExactValueSheet.svelte')).default;
	}
	async function loadExactPopover() {
		if (!ExactPopoverComp)
			ExactPopoverComp = (await import('$lib/components/ui/ExactPopover.svelte')).default;
	}

	$effect(() => {
		if (exactValue.open) void loadExactSheet();
	});
	$effect(() => {
		if (exactPopover.open) void loadExactPopover();
	});

	onMount(() => {
		idleImport(loadExactSheet);
		idleImport(loadExactPopover);
	});
</script>

{@render children()}
<!-- 앱 전역 단일 인스턴스: 토스트(role=status), 축약 금액 정확한 값 시트·팝오버는 쓸 때(또는 idle) 로드 -->
<ToastHost />
{#if ExactValueSheetComp}
	<ExactValueSheetComp />
{/if}
{#if ExactPopoverComp}
	<ExactPopoverComp />
{/if}
