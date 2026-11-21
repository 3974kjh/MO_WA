<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import { backHrefFromPath, sectionFromPath } from '$lib/components/layout/nav';

	let { data, children } = $props();

	let current = $derived(sectionFromPath(page.url.pathname));
	let backHref = $derived(backHrefFromPath(page.url.pathname));
	let title = $derived((page.data as { title?: string }).title);
</script>

<AppShell {current} pendingCount={data.pendingCount} userEmail={data.userEmail} {title} {backHref}>
	{@render children()}
</AppShell>
