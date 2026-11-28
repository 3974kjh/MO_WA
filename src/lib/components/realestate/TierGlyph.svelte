<script lang="ts">
	import { STAR_D } from '$lib/maps/shapes';
	import type { ComplexTier } from '$lib/maps/points';

	let { tier, size = 22 }: { tier: ComplexTier; size?: number } = $props();
</script>

<svg class="g" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
	{#if tier === 'top' || tier === 'target'}
		<path
			d="M14 26.5C14 26.5 4 17 4 11A10 10 0 0 1 24 11C24 17 14 26.5 14 26.5Z"
			fill={tier === 'top' ? '#D98A00' : '#0B6E67'}
			stroke={tier === 'top' ? '#8F5200' : '#095A54'}
			stroke-width="1.6"
		/>
		{#if tier === 'top'}
			<path
				transform="translate(8.6 5.4) scale(.45)"
				d={STAR_D}
				fill="#1B1100"
				stroke="#1B1100"
				stroke-width="1.2"
			/>
		{:else}
			<circle cx="14" cy="11" r="3.6" fill="#fff" />
		{/if}
	{:else if tier === 'cand'}
		<rect
			x="6"
			y="6"
			width="16"
			height="16"
			rx="3"
			transform="rotate(45 14 14)"
			fill="#fff"
			stroke="#3F4C99"
			stroke-width="2"
		/>
		<text x="14" y="18.4" text-anchor="middle" font-size="12.5" font-weight="800" fill="#3F4C99"
			>후</text
		>
	{:else}
		<circle cx="14" cy="14" r="10.5" fill="#5D6676" stroke="#454E5C" stroke-width="1.6" />
		<text x="14" y="18.2" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">참</text
		>
	{/if}
</svg>
