<script lang="ts">
	import '../app.css';
	import ToastHost from '$lib/components/ui/ToastHost.svelte';
	import ExactHost from '$lib/components/ui/ExactHost.svelte';

	let { children } = $props();
</script>

{@render children()}
<!-- 앱 전역 단일 인스턴스: 토스트(role=status), 축약 금액 정확한 값 시트·팝오버는 쓸 때(또는 앱 화면 idle) 로드 -->
<ToastHost />
<ExactHost />
