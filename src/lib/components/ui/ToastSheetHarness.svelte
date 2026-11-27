<script lang="ts">
	/** ToastGroup.svelte.spec.ts 전용 하니스: 토스트 묶음 + 아래에서 올라오는 시트를 한 화면에 둔다. */
	import Sheet from './Sheet.svelte';
	import ToastGroup from './ToastGroup.svelte';
	import type { SheetVariant } from './types';

	let { variant = 'bottom', lines = 4 }: { variant?: SheetVariant; lines?: number } = $props();
	let open = $state(false);
</script>

<header class="topbar" style="position: fixed; inset: 0 0 auto 0; height: 56px"></header>
<button type="button" style="margin-top: 80px" onclick={() => (open = true)}>시트 열기</button>
<ToastGroup />
<Sheet {open} onclose={() => (open = false)} {variant} title="확인">
	{#each Array.from({ length: lines }, (_, i) => i) as i (i)}<p>줄 {i}</p>{/each}
</Sheet>
