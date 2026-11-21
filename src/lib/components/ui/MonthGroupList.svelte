<script lang="ts" generics="T">
	/** 월 그룹 목록 (H §3): 월 헤더 sticky(top = 상단바 높이 PC 60 / 모바일 52) */
	import type { Snippet } from 'svelte';

	let {
		groups,
		item,
		itemKey
	}: {
		groups: { month: string; label?: string; items: T[] }[];
		item: Snippet<[T]>;
		itemKey?: (it: T, i: number) => string | number;
	} = $props();
</script>

{#each groups as g (g.month)}
	<section class="group" aria-labelledby="mg-{g.month}">
		<h3 class="month-head" id="mg-{g.month}">
			<span>{g.label ?? g.month}</span><span class="count num">{g.items.length}건</span>
		</h3>
		<ul class="list">
			{#each g.items as it, i (itemKey ? itemKey(it, i) : i)}
				<li>{@render item(it)}</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
	.month-head {
		position: sticky;
		top: var(--size-topbar);
		z-index: 5;
		background: var(--color-canvas);
		padding: 14px 4px 8px;
		font-weight: 700;
		font-size: var(--text-sm);
		color: var(--color-muted);
		display: flex;
		justify-content: space-between;
	}
	.count {
		font-weight: 600;
		color: var(--color-subtle);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--color-surface);
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.list > li {
		border-bottom: 1px solid var(--color-line);
	}
	.list > li:last-child {
		border-bottom: 0;
	}
	@media (max-width: 639px) {
		.month-head {
			top: var(--size-topbar-m);
		}
	}
</style>
