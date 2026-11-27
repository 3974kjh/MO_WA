<script lang="ts">
	/**
	 * 토스트 자리 (앱에 하나). Skeleton 토스트(ToastGroup.svelte, Zag 포함 ~17KiB gzip)는 첫 페인트·로그인 경로에 싣지 않고
	 * 브라우저가 한가할 때 미리 불러 둔다. 그 전에 토스트가 생기면 곧바로 불러 같은 항목을 그린다(항목은 toast.svelte.ts에 남아 있음).
	 */
	import { onMount, type Component } from 'svelte';
	import { toast } from './toast.svelte';

	let Group = $state<Component | null>(null);
	let loading = false;

	function load() {
		if (loading) return;
		loading = true;
		import('./ToastGroup.svelte').then((m) => (Group = m.default));
	}

	onMount(() => {
		const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
		idle(load);
	});

	$effect(() => {
		if (toast.items.length > 0) load();
	});
</script>

{#if Group}<Group />{/if}
