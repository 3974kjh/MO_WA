<script lang="ts">
	/** 바텀시트 끌어 닫기: 본문이 길어 스크롤되는 확인 시트 */
	import Sheet from '$lib/components/ui/Sheet.svelte';

	let open = $state(false);
	const lines = [...Array(40).keys()].map((i) => i + 1);
</script>

<button type="button" data-testid="sheet-opener" onclick={() => (open = true)}>시트 열기</button>
<Sheet {open} onclose={() => (open = false)} title="거절할까요?" variant="bottom">
	<div data-testid="sheet-body-inner">
		<p>거절하면 이 요청은 반영되지 않아요.</p>
		{#each lines as n (n)}
			<p>스크롤 줄 {n}</p>
		{/each}
	</div>
	{#snippet footer()}
		<button
			type="button"
			class="btn-primary-m btn preset-outlined-surface-500"
			data-testid="sheet-cancel">취소</button
		>
		<button
			type="button"
			class="btn-primary-m btn preset-outlined-error-700-300"
			data-testid="sheet-confirm">거절</button
		>
	{/snippet}
</Sheet>

<style>
	/* 시트 본문을 분명히 스크롤되게 줄 간격을 확보 */
	p {
		margin: 12px 0;
		line-height: 1.6;
	}
</style>
