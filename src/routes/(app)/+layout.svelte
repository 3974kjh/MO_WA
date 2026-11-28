<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import { backHrefFromPath, sectionFromPath } from '$lib/components/layout/nav';

	let { data, children } = $props();

	let current = $derived(sectionFromPath(page.url.pathname));
	// 화면이 정한 뒤로 경로가 우선(분석 리포트 → 들어온 종목 화면, FE-11 결정 1)
	let backHref = $derived(
		(page.data as { backHref?: string }).backHref ?? backHrefFromPath(page.url.pathname)
	);
	let title = $derived((page.data as { title?: string }).title);
</script>

<AppShell {current} pendingCount={data.pendingCount} userEmail={data.userEmail} {title} {backHref}>
	{@render children()}
</AppShell>
