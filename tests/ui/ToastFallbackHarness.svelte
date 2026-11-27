<script lang="ts">
	/** ToastHost.svelte.spec.ts 전용: 청크 로드 실패 대체 토스트 + 아래에서 올라오는 시트. */
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import ToastHost from '$lib/components/ui/ToastHost.svelte';

	let { loader }: { loader: () => Promise<{ default: import('svelte').Component }> } = $props();
	let open = $state(false);
</script>

<header class="topbar" style="position: fixed; inset: 0 0 auto 0; height: 56px"></header>
<button type="button" style="margin-top: 80px" onclick={() => (open = true)}>시트 열기</button>
<ToastHost {loader} retryDelayMs={0} />
<Sheet {open} onclose={() => (open = false)} title="확인">
	{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}<p>줄 {i}</p>{/each}
</Sheet>
