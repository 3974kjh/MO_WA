<script lang="ts">
	// FE-11 '없는 리포트'(404) · 그 밖 오류.
	import { page } from '$app/state';
	import StocksError from '$lib/components/stocks/StocksError.svelte';
	import { isTickerParam } from '$lib/stocks/view';
	// 종목 화면에서 왔으면(?from=) '종목 화면으로' 보조 버튼
	const from = $derived(page.url.searchParams.get('from'));
</script>

<StocksError
	title="이 리포트를 찾을 수 없어요"
	what="리포트"
	desc="주소가 바뀌었거나 보관된 리포트예요."
	from={from && isTickerParam(from) ? from : null}
/>
