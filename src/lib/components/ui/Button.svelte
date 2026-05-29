<script lang="ts">
	import type { Snippet } from 'svelte';

	type ButtonVariant = 'primary' | 'secondary-pill' | 'dark-utility' | 'pearl-capsule' | 'ghost';
	type ButtonType = 'button' | 'submit' | 'reset';

	let {
		variant = 'primary',
		type = 'button',
		form,
		name,
		value,
		disabled = false,
		pressed = false,
		compact = false,
		label,
		onclick,
		children
	}: {
		variant?: ButtonVariant;
		type?: ButtonType;
		form?: string;
		name?: string;
		value?: string;
		disabled?: boolean;
		pressed?: boolean;
		compact?: boolean;
		label?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	} = $props();

	const variantClass = $derived(
		compact
			? {
					primary: 'bg-primary text-on-primary px-sm py-[5px] text-[13px] leading-[1.29]',
					'secondary-pill':
						'border border-primary bg-canvas px-sm py-[5px] text-[13px] leading-[1.29] text-primary',
					'dark-utility':
						'rounded-sm bg-ink px-sm py-[5px] text-[13px] leading-[1.29] tracking-[-0.13px] text-on-dark',
					'pearl-capsule':
						'rounded-md border border-divider-soft bg-surface-pearl px-sm py-[5px] text-[13px] leading-[1.29] tracking-[-0.13px] text-ink-muted-80',
					ghost: 'bg-transparent px-sm py-[5px] text-[13px] leading-[1.29] text-primary'
				}[variant]
			: {
					primary: 'bg-primary text-on-primary px-[22px] py-[11px] text-[17px] leading-[1.47]',
					'secondary-pill':
						'border border-primary bg-canvas px-[22px] py-[11px] text-[17px] leading-[1.47] text-primary',
					'dark-utility':
						'rounded-sm bg-ink px-[15px] py-[8px] text-[14px] leading-[1.29] tracking-[-0.224px] text-on-dark',
					'pearl-capsule':
						'rounded-md border-[3px] border-divider-soft bg-surface-pearl px-[14px] py-[8px] text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80',
					ghost: 'bg-transparent px-sm py-xs text-[17px] leading-[1.47] text-primary'
				}[variant]
	);

	const sizeClass = $derived(compact ? 'min-h-8' : 'min-h-11');
</script>

<button
	{type}
	{form}
	{name}
	{value}
	{disabled}
	aria-pressed={pressed}
	class="inline-flex {sizeClass} items-center justify-center gap-xs rounded-pill font-text font-normal transition-transform active:scale-95 disabled:opacity-50 {variantClass}"
	{onclick}
>
	{#if children}
		{@render children()}
	{:else}
		{label}
	{/if}
</button>
