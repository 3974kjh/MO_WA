<script lang="ts">
	/** Sheet.svelte.spec.ts 전용: 첫 포커스 대상이 .btn 인 확인 시트(사용 중지·반영과 같은 푸터). */
	import Sheet from '$lib/components/ui/Sheet.svelte';

	let open = $state(false);
</script>

<button type="button" data-testid="sheet-opener" onclick={() => (open = true)}>시트 열기</button>
<Sheet {open} onclose={() => (open = false)} title="사용 중지할까요?">
	<p>이 봇의 키는 바로 쓸 수 없게 돼요.</p>
	{#snippet footer()}
		<button
			type="button"
			class="btn-primary-m btn preset-outlined-surface-500"
			data-testid="sheet-cancel">취소</button
		>
		<button
			type="button"
			class="btn-primary-m btn preset-outlined-error-700-300"
			data-testid="sheet-confirm">사용 중지</button
		>
	{/snippet}
</Sheet>
