<script lang="ts">
	import { formatCurrency } from '$lib/components/datagrid/formatters';
	import type { AssetCategory } from '$lib/components/datagrid/types';
	import type { HierarchyNode } from '$lib/utils/assetCalculations';

	let {
		root,
		privacyHidden = false,
		selectedId = null,
		onSelect
	}: {
		root: HierarchyNode;
		privacyHidden?: boolean;
		selectedId?: string | null;
		onSelect?: (selection: { category?: AssetCategory; assetId?: string } | null) => void;
	} = $props();

	const nodes = $derived(root.children ?? []);
	const total = $derived(Math.max(root.value, 1));

	function handleCategoryClick(node: HierarchyNode) {
		onSelect?.({ category: node.id as AssetCategory });
	}

	function handleAssetClick(node: HierarchyNode, category: AssetCategory) {
		onSelect?.({ assetId: node.id, category });
	}

	function handleReset() {
		onSelect?.(null);
	}
</script>

<div class="grid gap-xs">
	{#if selectedId}
		<button type="button" class="justify-self-start text-[14px] text-primary" onclick={handleReset}>
			필터 해제
		</button>
	{/if}

	<div class="grid min-h-[360px] gap-xs rounded-lg bg-canvas-parchment p-xs md:grid-cols-12">
		{#each nodes as node (node.id)}
			<button
				type="button"
				class="grid min-h-[132px] content-between rounded-md p-lg text-left transition-opacity {node.kind ===
				'liability'
					? 'bg-surface-tile-1 text-on-dark'
					: 'bg-canvas text-ink'} {selectedId === node.id ? 'ring-2 ring-primary' : ''}"
				style={`grid-column: span ${Math.max(3, Math.round((node.value / total) * 12))} / span ${Math.max(3, Math.round((node.value / total) * 12))};`}
				onclick={() => handleCategoryClick(node)}
			>
				<div class="grid gap-xxs">
					<p class="font-display text-[28px] leading-[1.14] font-normal tracking-[0.196px]">
						{Math.round((node.value / total) * 100)}%
					</p>
					<p class="text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] opacity-75">
						{node.name}
					</p>
				</div>
				<p class="text-[14px] leading-[1.43] tracking-[-0.224px] opacity-75">
					{privacyHidden ? '••••••' : formatCurrency(node.value)}
				</p>
			</button>

			{#each node.children ?? [] as child (child.id)}
				<button
					type="button"
					class="hidden"
					aria-hidden="true"
					onclick={() => handleAssetClick(child, node.id as AssetCategory)}
				></button>
			{/each}
		{/each}
	</div>
</div>
