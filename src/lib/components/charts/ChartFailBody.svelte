<script lang="ts">
	/** 지연 차트 청크가 끝내 안 왔을 때 자리 안에 들어가는 안내. 부모(.chart-pending[data-failed])가 가운데 정렬한다. */
	let { onretry = () => location.reload() }: { onretry?: () => void } = $props();
</script>

<p class="fail-msg" role="alert">불러오지 못했어요</p>
<button
	type="button"
	class="btn min-h-10 min-w-16 preset-outlined-surface-500 btn-sm"
	onclick={onretry}>새로고침</button
>

<style>
	.fail-msg {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text);
	}
	/* .btn-sm은 보이는 높이 32(.btn-sm::after로 클릭만 40). 이 버튼은 보이는 면이 터치 하한 40×64이어야 한다 */
	button {
		min-height: 40px;
		min-width: 64px;
	}
</style>
