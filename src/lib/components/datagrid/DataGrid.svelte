<script lang="ts">
	import DataGridEmptyState from './DataGridEmptyState.svelte';
	import DataGridToolbar from './DataGridToolbar.svelte';
	import { categoryLabels, formatCurrency, formatDate, formatPercent } from './formatters';
	import type { AssetGridRow, DataGridColumn } from './types';

	let {
		rows = [],
		onAdd,
		onEdit,
		onDelete
	}: {
		rows?: AssetGridRow[];
		onAdd?: () => void;
		onEdit?: (row: AssetGridRow) => void;
		onDelete?: (row: AssetGridRow) => void;
	} = $props();

	let query = $state('');
	let sortId = $state<keyof AssetGridRow>('currentValue');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	const columns: DataGridColumn<AssetGridRow>[] = [
		{ id: 'name', header: '자산명', sortable: true },
		{
			id: 'category',
			header: '분류',
			sortable: true,
			format: (value) => categoryLabels[value as AssetGridRow['category']]
		},
		{ id: 'institution', header: '기관', sortable: true, format: (value) => String(value ?? '-') },
		{
			id: 'principalAmount',
			header: '원금',
			align: 'right',
			sortable: true,
			format: (value, row) => formatCurrency(Number(value), row.currency)
		},
		{
			id: 'currentValue',
			header: '현재가치',
			align: 'right',
			sortable: true,
			format: (value, row) => formatCurrency(Number(value), row.currency)
		},
		{
			id: 'annualRate',
			header: '수익률',
			align: 'right',
			sortable: true,
			format: (value) => formatPercent(value as number | undefined)
		},
		{
			id: 'valuationDate',
			header: '평가일',
			sortable: true,
			format: (value) => formatDate(String(value))
		}
	];

	const filteredRows = $derived(
		rows.filter((row) => {
			const target =
				`${row.name} ${row.category} ${row.subcategory} ${row.institution ?? ''} ${row.memo ?? ''}`.toLowerCase();
			return target.includes(query.toLowerCase());
		})
	);

	const visibleRows = $derived(
		[...filteredRows].sort((a, b) => {
			const left = a[sortId];
			const right = b[sortId];
			const direction = sortDirection === 'asc' ? 1 : -1;

			if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
			return String(left ?? '').localeCompare(String(right ?? ''), 'ko') * direction;
		})
	);

	function toggleSort(column: DataGridColumn<AssetGridRow>) {
		if (!column.sortable) return;
		if (sortId === column.id) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}
		sortId = column.id;
		sortDirection = 'asc';
	}

	function handleRowKeydown(event: KeyboardEvent, row: AssetGridRow) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onEdit?.(row);
		}
	}
</script>

<section class="overflow-hidden rounded-lg border border-hairline bg-canvas">
	<DataGridToolbar bind:query {onAdd} total={visibleRows.length} />

	{#if visibleRows.length === 0}
		<div class="p-lg">
			<DataGridEmptyState {onAdd} />
		</div>
	{:else}
		<div class="hidden overflow-x-auto lg:block">
			<table class="w-full border-collapse text-left" role="grid">
				<thead class="sticky top-0 bg-canvas-parchment">
					<tr>
						{#each columns as column (column.id)}
							<th
								class="border-b border-hairline px-md py-sm text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] text-ink"
							>
								<button
									type="button"
									class="flex min-h-11 w-full items-center gap-xxs"
									class:justify-end={column.align === 'right'}
									class:justify-center={column.align === 'center'}
									aria-label={`${column.header} 정렬`}
									onclick={() => toggleSort(column)}
								>
									<span class:ml-auto={column.align === 'right'}>{column.header}</span>
									{#if sortId === column.id}
										<span class="text-primary">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</button>
							</th>
						{/each}
						<th
							class="border-b border-hairline px-md py-sm text-right text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] text-ink"
						>
							작업
						</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as row (row.id)}
						<tr
							class="border-b border-divider-soft transition-colors hover:bg-canvas-parchment"
							role="button"
							tabindex="0"
							onclick={() => onEdit?.(row)}
							onkeydown={(event) => handleRowKeydown(event, row)}
						>
							{#each columns as column (column.id)}
								<td
									class="min-h-12 px-md py-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80"
									class:text-right={column.align === 'right'}
								>
									{column.format ? column.format(row[column.id], row) : row[column.id]}
								</td>
							{/each}
							<td class="px-md py-sm text-right">
								<button
									type="button"
									class="min-h-11 rounded-pill px-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-primary"
									onclick={(event) => {
										event.stopPropagation();
										onDelete?.(row);
									}}
								>
									삭제
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="grid gap-sm p-lg lg:hidden">
			{#each visibleRows as row (row.id)}
				<button
					type="button"
					class="grid min-h-14 gap-sm rounded-lg border border-hairline bg-canvas p-lg text-left transition-transform active:scale-[0.99]"
					onclick={() => onEdit?.(row)}
				>
					<div class="flex items-start justify-between gap-md">
						<div>
							<p class="text-[17px] leading-[1.24] font-semibold tracking-[-0.374px] text-ink">
								{row.name}
							</p>
							<p class="text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48">
								{categoryLabels[row.category]} · {row.subcategory} · {row.institution ??
									'기관 없음'}
							</p>
						</div>
						<p
							class="text-right font-display text-[21px] leading-[1.19] font-semibold tracking-[-0.231px] text-ink"
						>
							{formatCurrency(row.currentValue, row.currency)}
						</p>
					</div>
					<div
						class="flex flex-wrap gap-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48"
					>
						<span>원금 {formatCurrency(row.principalAmount, row.currency)}</span>
						<span>수익률 {formatPercent(row.annualRate)}</span>
						<span>{formatDate(row.valuationDate)}</span>
					</div>
					{#if onDelete}
						<span
							class="inline-flex min-h-11 items-center text-[14px] leading-[1.43] tracking-[-0.224px] text-primary"
							role="button"
							tabindex="0"
							onclick={(event) => {
								event.stopPropagation();
								onDelete(row);
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									event.stopPropagation();
									onDelete(row);
								}
							}}
						>
							삭제
						</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</section>
