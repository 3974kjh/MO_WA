<script lang="ts">
	// FE-11 '없는 종목'(404) · 그 밖 오류(503 등). 상태 코드는 load가 정한 값 그대로.
	import StocksError from '$lib/components/stocks/StocksError.svelte';
</script>

<StocksError
	title="이 종목을 찾을 수 없어요"
	what="종목"
	desc="종목 코드가 바뀌었거나 아직 기록되지 않은 종목이에요."
/>
