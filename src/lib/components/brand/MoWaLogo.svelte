<script lang="ts">
	import { resolve } from '$app/paths';
	import logoUrl from '$lib/assets/mo-wa-logo.svg';

	type LogoVariant = 'ink' | 'on-dark' | 'primary';

	let {
		size = 36,
		label = 'MO_WA',
		variant = 'ink',
		showWordmark = true
	}: {
		size?: number;
		label?: string;
		variant?: LogoVariant;
		showWordmark?: boolean;
	} = $props();

	const variantClass = $derived(
		variant === 'primary' ? 'text-primary' : variant === 'on-dark' ? 'text-on-dark' : 'text-ink'
	);
</script>

<a class="inline-flex items-center gap-xs {variantClass}" href={resolve('/')} aria-label={label}>
	<img class="block" src={logoUrl} alt="" style:width={`${size}px`} style:height={`${size}px`} />
	{#if showWordmark}
		<span class="font-display text-[21px] font-semibold tracking-[-0.231px]">MO_WA</span>
	{/if}
</a>
