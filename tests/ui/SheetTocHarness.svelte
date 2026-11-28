<script lang="ts">
	/** SheetToc.svelte.spec.ts 전용: 구역 수·줄 수·꼬리 유무를 바꿔 가며 쓰는 긴/짧은 시트 */
	import Sheet from '$lib/components/ui/Sheet.svelte';

	let {
		sections = 3,
		lines = 14,
		foot = true,
		variant = 'bottom'
	}: {
		sections?: number;
		lines?: number;
		foot?: boolean;
		variant?: 'bottom' | 'center' | 'full';
	} = $props();
	let open = $state(false);
	let closed = $state(0);
	const secs = $derived([...Array(sections).keys()]);
	const rows = $derived([...Array(lines).keys()]);
	const onclose = () => {
		open = false;
		closed++;
	};
</script>

<button type="button" data-testid="sheet-opener" onclick={() => (open = true)}>열기</button>
<span data-testid="closed-count">{closed}</span>
{#snippet content()}
	<div class="form">
		{#each secs as s (s)}
			<h4 class="sheet-sec" data-toc={`구역 ${s + 1}`}>구역 {s + 1}</h4>
			{#each rows as r (r)}
				<p>구역 {s + 1} · 줄 {r + 1}</p>
			{/each}
		{/each}
	</div>
{/snippet}
{#snippet footer()}
	<button type="button" class="btn-primary-m btn preset-outlined-surface-500">취소</button>
	<button type="button" class="btn-primary-m btn preset-filled-brand" data-testid="sheet-ok"
		>확인</button
	>
{/snippet}
{#if foot}
	<Sheet {open} {onclose} {variant} title="긴 모달" {footer}>{@render content()}</Sheet>
{:else}
	<Sheet {open} {onclose} {variant} title="긴 모달">{@render content()}</Sheet>
{/if}
