<script lang="ts">
	import { formatCurrency } from '$lib/components/datagrid/formatters';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { CashflowGridItem } from '$lib/types/cashflow';

	let {
		cashflows = [],
		privacyHidden = false,
		onAdd,
		onEdit,
		onDelete
	}: {
		cashflows?: CashflowGridItem[];
		privacyHidden?: boolean;
		onAdd: () => void;
		onEdit: (item: CashflowGridItem) => void;
		onDelete: (item: CashflowGridItem) => void;
	} = $props();

	function amount(value: number) {
		return privacyHidden ? '••••••' : formatCurrency(value);
	}

	function cadenceLabel(value: CashflowGridItem['cadence']) {
		return value === 'monthly' ? '월' : '년';
	}
</script>

<div class="grid gap-md">
	<div class="flex flex-wrap items-center justify-between gap-sm">
		<div class="grid gap-xxs">
			<p class="font-display text-[21px] leading-[1.19] font-semibold tracking-[-0.231px]">
				고정 수입·지출
			</p>
			<p class="text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48">
				월/년 반복 현금흐름은 미래 예측 차트에 자동 반영됩니다.
			</p>
		</div>
		<Button variant="pearl-capsule" label="항목 추가" onclick={onAdd} />
	</div>

	<div class="grid gap-sm md:grid-cols-2">
		{#each cashflows as item (item.id)}
			<article class="grid gap-sm rounded-lg border border-hairline bg-canvas p-md">
				<div class="flex items-start justify-between gap-sm">
					<div class="flex items-center gap-sm">
						<span
							class="rounded-full bg-canvas-parchment p-xs {item.direction === 'income'
								? 'text-primary'
								: 'text-ink'}"
						>
							<Icon name={item.direction === 'income' ? 'income' : 'expense'} size={20} />
						</span>
						<div>
							<p class="font-semibold text-ink">{item.name}</p>
							<p class="text-[14px] text-ink-muted-48">
								{item.category ?? '분류 없음'} · {cadenceLabel(item.cadence)} 반복
							</p>
						</div>
					</div>
					<p class="font-display text-[21px] font-semibold tracking-[-0.231px]">
						{item.direction === 'expense' ? '-' : '+'}{amount(item.amount)}
					</p>
				</div>
				<div class="flex flex-wrap gap-xs">
					<Button variant="ghost" label="수정" onclick={() => onEdit(item)} />
					<Button variant="ghost" label="삭제" onclick={() => onDelete(item)} />
				</div>
			</article>
		{:else}
			<div class="rounded-lg bg-canvas-parchment p-lg text-[14px] text-ink-muted-80 md:col-span-2">
				아직 고정 수입·지출이 없습니다. 월급, 월세, 보험료처럼 반복되는 항목을 추가해 미래 자산
				흐름을 예측해 보세요.
			</div>
		{/each}
	</div>
</div>
