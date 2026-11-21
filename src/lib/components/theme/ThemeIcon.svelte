<script lang="ts">
	import Contrast from '@lucide/svelte/icons/contrast';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import type { ThemeMode } from '$lib/theme/theme';

	let { mode, size = 20 }: { mode: ThemeMode; size?: number } = $props();
</script>

{#if mode === 'dark'}
	<Moon {size} strokeWidth={1.8} aria-hidden="true" />
{:else if mode === 'light'}
	<Sun {size} strokeWidth={1.8} aria-hidden="true" />
{:else}
	<Contrast {size} strokeWidth={1.8} aria-hidden="true" />
{/if}
