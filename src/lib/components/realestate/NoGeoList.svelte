<script lang="ts">
	/** 위치 정보가 없는 단지(시안 .rm-nogeo): 접어 두고, 지도에는 찍지 않았다고 밝힌다. 이름과 네이버 지도 링크. */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { ComplexItem } from '$lib/maps/points';
	import NaverLink from './NaverLink.svelte';

	let { items, open = false }: { items: ComplexItem[]; open?: boolean } = $props();
</script>

{#if items.length}
	<details class="rm-nogeo" {open} data-testid="complex-nogeo">
		<summary
			><span>위치 정보가 없는 단지 {items.length}곳</span><ChevronDown
				size={16}
				aria-hidden="true"
			/></summary
		>
		<p>지도에는 찍지 않았어요. 이름으로 찾아볼 수 있어요.</p>
		<ul>
			{#each items as it (it.id)}
				<li>
					<span class="n">{it.name}<small>{it.region}</small></span><NaverLink
						item={it}
						label="네이버 지도"
					/>
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style>
	.rm-nogeo {
		margin: 8px 6px 0;
		border-top: 1px solid var(--color-line);
		padding-top: 8px;
		font-size: var(--text-sm);
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		color: var(--color-muted);
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary :global(svg) {
		transition: transform 0.15s;
	}
	.rm-nogeo[open] summary :global(svg) {
		transform: rotate(180deg);
	}
	summary:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	p {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		margin: 0 0 4px;
	}
	ul {
		margin: 0 0 6px;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: center;
		padding: 2px 0;
	}
	.n small {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
</style>
