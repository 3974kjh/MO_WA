<script lang="ts" generics="V extends string">
	let {
		options,
		value,
		onchange,
		ariaLabel
	}: {
		options: { value: V; label: string }[];
		value: V;
		onchange: (v: V) => void;
		ariaLabel: string;
	} = $props();
</script>

<div class="seg" role="group" aria-label={ariaLabel}>
	{#each options as o (o.value)}
		<button type="button" aria-pressed={o.value === value} onclick={() => onchange(o.value)}
			>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		background: var(--color-surface-2);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 2px;
	}
	button {
		border: 0;
		background: transparent;
		min-height: var(--size-touch);
		padding: 0 14px;
		border-radius: calc(var(--radius-sm) - 1px);
		color: var(--color-muted);
		font-weight: 500;
		font-size: var(--text-sm);
	}
	button[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-accent);
		font-weight: 700;
		box-shadow: var(--shadow-card);
	}
	@media (pointer: coarse) {
		button {
			min-height: var(--size-touch);
		}
	}
</style>
