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

	// v1.7.0 (DS §7-0): Skeleton badge + preset-tonal-*. 크기(12px·높이 22·반경 6)는 skeleton-overrides.css
	const PRESET: Record<BadgeTone, string> = {
		default: 'preset-tonal-surface',
		up: 'preset-tonal-error',
		down: 'preset-tonal-secondary',
		warn: 'preset-tonal-warning',
		info: 'preset-tonal-tertiary',
		ok: 'preset-tonal-success',
		accent: 'preset-tonal-primary'
	};
</script>

<span class="badge {PRESET[tone]} {className}" {title}
	>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{@render children()}</span
>
