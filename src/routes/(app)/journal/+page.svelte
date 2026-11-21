<script lang="ts">
	import type { PageData } from './$types';
	import JournalPage from '$lib/components/journal/JournalPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<JournalPage {data} />
