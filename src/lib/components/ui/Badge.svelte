<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BadgeTone } from './types';

	let {
		tone = 'default',
		icon,
		title,
		class: className = '',
		children
	}: {
		tone?: BadgeTone;
		/** 색만으로 구분하지 않도록 기호를 함께 쓴다(✓, ●, ⏸, ▲ …) */
		icon?: string;
		title?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<span class="badge {tone} {className}" {title}
	>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{@render children()}</span
>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 22px;
		padding: 0 8px;
		border-radius: var(--radius-xs);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		background: var(--color-surface-2);
		color: var(--color-muted);
	}
	.up {
		background: var(--color-up-soft);
		color: var(--color-up);
	}
	.down {
		background: var(--color-down-soft);
		color: var(--color-down);
	}
	.warn {
		background: var(--color-warn-soft);
		color: var(--color-warn);
	}
	.info {
		background: var(--color-info-soft);
		color: var(--color-info);
	}
	.ok {
		background: var(--color-ok-soft);
		color: var(--color-ok);
	}
	.accent {
		background: var(--color-accent-soft);
		color: var(--color-accent);
	}
</style>
