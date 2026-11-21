<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ExactValueSheet from '$lib/components/ui/ExactValueSheet.svelte';
	import ToastHost from '$lib/components/ui/ToastHost.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={favicon} />
</svelte:head>
{@render children()}
<!-- 앱 전역 단일 인스턴스: 토스트(role=status), 축약 금액 정확한 값 시트(터치) -->
<ToastHost />
<ExactValueSheet />
