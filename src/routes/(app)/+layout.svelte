<script lang="ts">
	import { page, navigating } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import NavStage from '$lib/components/layout/NavStage.svelte';
	import { backHrefFromPath, sectionFromPath } from '$lib/components/layout/nav';
	import { chromeForPath, isMenuNavigation } from '$lib/nav/navTarget';

	let { data, children } = $props();

	// 경로가 바뀌는 이동 중에는 클릭 즉시 사이드바 활성 항목·제목을 목적지로 맞춘다(본문은 NavStage가 로딩 패널로 보인다).
	let dest = $derived(
		navigating.to &&
			isMenuNavigation({ from: navigating.from, to: navigating.to, type: navigating.type })
			? chromeForPath(navigating.to.url.pathname)
			: null
	);
	let current = $derived(dest ? dest.current : sectionFromPath(page.url.pathname));
	// 화면이 정한 뒤로 경로가 우선(분석 리포트 → 들어온 종목 화면, FE-11 결정 1)
	let backHref = $derived(
		dest
			? dest.backHref
			: ((page.data as { backHref?: string }).backHref ?? backHrefFromPath(page.url.pathname))
	);
	let title = $derived(dest ? dest.title : (page.data as { title?: string }).title);
</script>

<AppShell {current} pendingCount={data.pendingCount} userEmail={data.userEmail} {title} {backHref}>
	<NavStage>{@render children()}</NavStage>
</AppShell>
