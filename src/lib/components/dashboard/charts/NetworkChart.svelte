<script lang="ts">
	import { formatCurrency } from '$lib/components/datagrid/formatters';
	import type { NetworkEdge, NetworkNode } from '$lib/utils/assetCalculations';

	let {
		nodes = [],
		edges = [],
		privacyHidden = false
	}: {
		nodes?: NetworkNode[];
		edges?: NetworkEdge[];
		privacyHidden?: boolean;
	} = $props();

	const layoutNodes = $derived(
		nodes.map((node, index) => {
			const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
			const radius = node.group === 'liability' ? 72 : 108;
			return {
				...node,
				x: 300 + Math.cos(angle) * radius,
				y: 180 + Math.sin(angle) * radius
			};
		})
	);

	function findNode(id: string) {
		return layoutNodes.find((node) => node.id === id);
	}
</script>

<div class="grid gap-md">
	<svg viewBox="0 0 600 360" class="min-h-[280px] w-full rounded-lg bg-canvas-parchment">
		{#each edges as edge (`${edge.source}-${edge.target}`)}
			{@const source = findNode(edge.source)}
			{@const target = findNode(edge.target)}
			{#if source && target}
				<line
					x1={source.x}
					y1={source.y}
					x2={target.x}
					y2={target.y}
					stroke="var(--color-hairline)"
					stroke-width="2"
				/>
				<text
					x={(source.x + target.x) / 2}
					y={(source.y + target.y) / 2 - 6}
					text-anchor="middle"
					class="fill-ink-muted-48 text-[11px]"
				>
					{edge.label}
				</text>
			{/if}
		{/each}

		{#each layoutNodes as node (node.id)}
			<g>
				<circle
					cx={node.x}
					cy={node.y}
					r={node.group === 'liability' ? 18 : 22}
					fill={node.group === 'liability' ? 'var(--color-surface-tile-1)' : 'var(--color-canvas)'}
					stroke="var(--color-hairline)"
					stroke-width="2"
				/>
				<text
					x={node.x}
					y={node.y + 36}
					text-anchor="middle"
					class="fill-ink text-[12px] font-semibold"
				>
					{node.label}
				</text>
			</g>
		{/each}
	</svg>

	<ul class="grid gap-sm text-[14px] text-ink-muted-80 md:grid-cols-2">
		{#each layoutNodes as node (node.id)}
			<li class="rounded-md bg-canvas p-sm">
				{node.label} · {privacyHidden ? '••••••' : formatCurrency(node.value ?? 0)}
			</li>
		{/each}
	</ul>
</div>
