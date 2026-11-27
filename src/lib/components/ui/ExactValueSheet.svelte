<script lang="ts">
	/** 모바일(<640) 축약 금액의 '정확한 금액' 하단 시트 (handoff v1.1 §12, 시안 shared/shell.js). 앱에 하나만 둔다. */
	import { exactValue } from './exactValue.svelte';
	import Sheet from './Sheet.svelte';
</script>

<Sheet
	open={exactValue.open}
	onclose={() => exactValue.close()}
	variant="bottom"
	title="정확한 금액"
>
	<div class="stack">
		<div class="mw-label">{exactValue.label}</div>
		<div class="value num">{exactValue.exact}</div>
		<p class="note">
			화면에서는 큰 금액을 ‘만’ 단위로 줄여 보여 줘요. 주가·평균 단가·손익분기 가격과 반영 내용은
			줄이지 않고 전체 값으로 표시해요.
		</p>
	</div>
	{#snippet footer()}
		<button type="button" class="mw-btn primary" onclick={() => exactValue.close()}>확인</button>
	{/snippet}
</Sheet>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.mw-label,
	.note {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.value {
		font-size: var(--text-2xl);
		line-height: var(--text-2xl--line-height);
		font-weight: 700;
	}
</style>
