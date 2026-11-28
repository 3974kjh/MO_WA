<script lang="ts">
	// FE-11 '없는 리포트'(404) · 그 밖 오류.
	import StocksError from '$lib/components/stocks/StocksError.svelte';
</script>

<StocksError
	title="이 리포트를 찾을 수 없어요"
	what="리포트"
	desc="주소가 바뀌었거나 보관된 리포트예요."
/>
