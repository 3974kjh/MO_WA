<script lang="ts">
	/** 전체 시트 위에 확인 시트를 겹친 경로(일지 상세 + 보관 확인과 같은 구조). */
	import Sheet from '$lib/components/ui/Sheet.svelte';

	let detailOpen = $state(false);
	let confirmOpen = $state(false);
</script>

<button type="button" data-testid="stack-opener" onclick={() => (detailOpen = true)}
	>상세 열기</button
>

<Sheet
	open={detailOpen}
	onclose={() => (detailOpen = false)}
	variant="full"
	title="일지 상세"
	backLabel="목록으로"
>
	<p data-testid="stack-detail-body">상세 내용</p>
	<button
		type="button"
		data-testid="stack-archive"
		class="btn text-muted"
		onclick={() => (confirmOpen = true)}>보관</button
	>
</Sheet>

<Sheet
	open={confirmOpen}
	onclose={() => (confirmOpen = false)}
	variant="center"
	title="일지를 보관할까요?"
>
	<p>목록에서 내려요.</p>
	{#snippet footer()}
		<button type="button" class="btn preset-outlined-surface-500" data-testid="stack-cancel"
			>취소</button
		>
		<button
			type="button"
			class="btn-primary-m btn preset-filled-brand"
			data-action="journal-archive-confirm"
			data-testid="stack-confirm">보관하기</button
		>
	{/snippet}
</Sheet>
