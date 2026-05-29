<script lang="ts">
	import { formatCurrency } from '$lib/components/datagrid/formatters';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { DashboardSummary, FutureProjectionSummary } from '$lib/utils/assetCalculations';

	let {
		summary,
		projection,
		privacyHidden = false,
		goalProgress = null,
		onAddCashflow,
		onAddAsset,
		onSetGoal
	}: {
		summary: DashboardSummary;
		projection: FutureProjectionSummary;
		privacyHidden?: boolean;
		goalProgress?: number | null;
		onAddCashflow: () => void;
		onAddAsset: () => void;
		onSetGoal: () => void;
	} = $props();

	function amount(value: number) {
		return privacyHidden ? '••••••' : formatCurrency(value);
	}

	const cards = $derived([
		{
			icon: 'asset' as const,
			label: '현재 순자산',
			value: amount(summary.netWorth),
			helper: `목표 ${goalProgress ?? 0}%`
		},
		{
			icon: 'projection' as const,
			label: `${projection.horizonYears}년 후 예상`,
			value: amount(projection.projectedNetWorth),
			helper: amount(projection.growthAmount)
		},
		{
			icon: 'income' as const,
			label: '월 순현금흐름',
			value: amount(projection.monthlyNetCashflow),
			helper: '고정 수입 - 고정 지출'
		},
		{
			icon: 'chart' as const,
			label: '복리 예상 수익',
			value: amount(projection.compoundGain),
			helper: '자산별 연 수익률 기준'
		}
	]);
</script>

<section
	class="grid gap-xl rounded-none bg-surface-tile-1 px-lg py-section text-on-dark lg:grid-cols-[1.1fr_0.9fr]"
	id="scenario-lab"
>
	<div class="grid content-center gap-lg">
		<div
			class="inline-flex w-fit items-center gap-xs rounded-pill bg-surface-tile-2 px-sm py-xs text-primary-on-dark"
		>
			<Icon name="dashboard" size={18} />
			<span class="text-[14px] leading-[1.29] tracking-[-0.224px]">Scenario Lab</span>
		</div>
		<div class="grid gap-md">
			<h1
				class="max-w-[780px] font-display text-[40px] leading-[1.1] font-semibold tracking-[-0.28px] sm:text-[56px] sm:leading-[1.07]"
			>
				지금의 자산이 미래에 어떻게 흐를지 먼저 봅니다.
			</h1>
			<p class="max-w-[720px] font-display text-[24px] leading-[1.5] font-light text-body-muted">
				월·년 고정 수입과 지출, 예금·적금 금리, 주식 예상 수익률을 하나의 시나리오로 묶어 연 단위
				순자산 흐름을 예측합니다.
			</p>
		</div>
		<div class="flex flex-wrap gap-sm">
			<Button label="고정 수입/지출 추가" onclick={onAddCashflow} />
			<Button variant="secondary-pill" label="자산 수익률 조정" onclick={onAddAsset} />
			<Button variant="ghost" label="목표 설정" onclick={onSetGoal} />
		</div>
		<p class="text-[14px] leading-[1.43] tracking-[-0.224px] text-body-muted">
			가정 기반 예측이며 투자 조언이 아닙니다. 환율 변동은 이번 시나리오에 포함하지 않습니다.
		</p>
	</div>

	<div class="grid gap-md sm:grid-cols-2">
		{#each cards as card (card.label)}
			<article class="grid min-h-[170px] gap-sm rounded-lg bg-canvas p-lg text-ink">
				<div class="flex items-center justify-between gap-sm">
					<span class="rounded-full bg-canvas-parchment p-sm text-primary">
						<Icon name={card.icon} />
					</span>
					<span class="text-[12px] leading-none tracking-[-0.12px] text-ink-muted-48">
						{card.label}
					</span>
				</div>
				<p class="font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.374px]">
					{card.value}
				</p>
				<p class="text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48">
					{card.helper}
				</p>
			</article>
		{/each}
	</div>
</section>
