<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		valueLabel,
		periodLabel,
		actions,
		children
	}: {
		title: string;
		description?: string;
		valueLabel?: string;
		periodLabel?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="grid h-full gap-lg rounded-lg border border-hairline bg-canvas p-lg">
	<header class="flex flex-col gap-md md:flex-row md:items-start md:justify-between">
		<div class="grid gap-xxs">
			<p class="text-[17px] leading-[1.24] font-semibold tracking-[-0.374px] text-ink">{title}</p>
			{#if description}
				<p class="max-w-[64ch] text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48">
					{description}
				</p>
			{/if}
		</div>
		<div class="flex flex-wrap items-center gap-sm">
			{#if valueLabel}
				<span
					class="font-display text-[21px] leading-[1.19] font-semibold tracking-[-0.231px] text-ink"
				>
					{valueLabel}
				</span>
			{/if}
			{#if periodLabel}
				<span
					class="rounded-md border-[3px] border-divider-soft bg-surface-pearl px-[14px] py-[8px] text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80"
				>
					{periodLabel}
				</span>
			{/if}
			{#if actions}
				{@render actions()}
			{/if}
		</div>
	</header>

	{@render children()}
</section>
