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

	// v1.7.0 (DS §7-0): 내부만 Skeleton 버튼. 높이 40(모바일 주 행동은 btn-primary-m 44)·포커스·비활성은 skeleton-overrides.css
	const variantClass = $derived(
		{
			primary: compact ? 'preset-filled-brand' : 'preset-filled-brand btn-primary-m',
			'secondary-pill': 'preset-outlined-surface-500',
			'dark-utility': 'preset-filled-surface-950-50',
			'pearl-capsule': 'preset-tonal',
			ghost: 'hover:preset-tonal text-muted'
		}[variant]
	);

	const sizeClass = $derived(compact ? 'btn-sm' : '');
</script>

<button
	{type}
	{form}
	{name}
	{value}
	{disabled}
	aria-pressed={pressed}
	class="btn {sizeClass} {variantClass}"
	{onclick}
>
	{#if children}
		{@render children()}
	{:else}
		{label}
	{/if}
</button>
