<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		value,
		delta,
		tone = 'light',
		children
	}: {
		label: string;
		value: string;
		delta?: string;
		tone?: 'light' | 'dark' | 'parchment';
		children?: Snippet;
	} = $props();

	const toneClass = $derived(
		tone === 'dark'
			? 'bg-surface-tile-1 text-on-dark'
			: tone === 'parchment'
				? 'bg-canvas-parchment text-ink'
				: 'bg-canvas text-ink'
	);
	const mutedClass = $derived(tone === 'dark' ? 'text-body-muted' : 'text-ink-muted-48');
</script>

<article class="grid min-h-[148px] gap-sm rounded-lg border border-hairline p-lg {toneClass}">
	<div class="flex items-start justify-between gap-md">
		<p class="text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] {mutedClass}">{label}</p>
		{#if delta}
			<span
				class="rounded-pill bg-primary px-sm py-xxs text-[12px] leading-none tracking-[-0.12px] text-on-primary"
			>
				{delta}
			</span>
		{/if}
	</div>
	<p class="font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.374px]">{value}</p>
	{#if children}
		<div class="text-[14px] leading-[1.43] tracking-[-0.224px] {mutedClass}">
			{@render children()}
		</div>
	{/if}
</article>
