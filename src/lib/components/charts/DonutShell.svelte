<script lang="ts">
	/**
	 * 도넛 바깥 뼈대: 180 자리 + 범례. d3 없음(지연 청크 밖).
	 * 컨테이너 <480이면 범례가 아래로 간다(@container, 로드 전후에도 같은 높이).
	 */
	import type { Snippet } from 'svelte';
	import { groupDonut, type DonutInput } from '$lib/charts/layout';
	import type { Currency } from '$lib/format/money';
	import Money from '$lib/components/ui/Money.svelte';

	let {
		items,
		ariaLabel,
		valueKind = 'pct',
		children
	}: {
		items: readonly DonutInput[];
		ariaLabel: string;
		valueKind?: 'pct' | Currency;
		children: Snippet;
	} = $props();

	let slices = $derived(groupDonut(items));
</script>

<div class="donut-shell">
	<div class="donut-wrap">
		<div class="donut">{@render children()}</div>
		<table class="leg-table">
			<caption class="sr-only">{ariaLabel} 범례</caption>
			<tbody>
				{#each slices as s, si (si)}
					<tr>
						<th scope="row">
							<i style:background={s.color} aria-hidden="true"></i>{s.label}
							{#if s.members}<span class="members">{s.members.join(', ')}</span>{/if}
						</th>
						{#if valueKind !== 'pct'}
							<td class="num"><Money value={s.value} currency={valueKind} label={s.label} /></td>
						{/if}
						<td class="num pct">{s.pct.toFixed(1)}%</td>
					</tr>
				{:else}
					<tr><td class="empty" colspan="3">표시할 비중이 없습니다</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.donut-shell {
		container-type: inline-size;
		width: 100%;
	}
	.donut-wrap {
		display: flex;
		align-items: center;
		gap: 20px;
	}
	@container (max-width: 479.98px) {
		.donut-wrap {
			flex-direction: column;
			align-items: stretch;
		}
	}
	.donut {
		position: relative;
		flex: none;
		width: 180px;
		height: 180px;
		margin: 0 auto;
	}
	.leg-table {
		flex: 1 1 auto;
		width: 100%;
		font-size: var(--text-sm);
		border-collapse: collapse;
	}
	.leg-table th,
	.leg-table td {
		padding: 5px 0;
		font-weight: 400;
		text-align: left;
		vertical-align: top;
	}
	.leg-table td.num {
		text-align: right;
		font-family: var(--font-num);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		padding-left: 12px;
		white-space: nowrap;
	}
	.leg-table i {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
		margin-right: 8px;
	}
	.members {
		display: block;
		margin-left: 18px;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.empty {
		color: var(--color-muted);
	}
</style>
