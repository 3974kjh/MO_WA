<script lang="ts">
	import { formatCurrency, formatDate, formatPercent } from '$lib/components/datagrid/formatters';
	import type { AssetGridRow } from '$lib/components/datagrid/types';
	import type { LiabilityGridRow } from '$lib/types/liability';

	let {
		asset,
		linkedLiabilities = [],
		privacyHidden = false
	}: {
		asset: AssetGridRow;
		linkedLiabilities?: LiabilityGridRow[];
		privacyHidden?: boolean;
	} = $props();

	const amount = $derived(
		privacyHidden ? '••••••' : formatCurrency(asset.currentValue, asset.currency)
	);
	const principal = $derived(
		privacyHidden ? '••••••' : formatCurrency(asset.principalAmount, asset.currency)
	);
	const linkedDebt = $derived(
		linkedLiabilities.reduce((sum, liability) => sum + liability.remainingAmount, 0)
	);
	const netValue = $derived(
		privacyHidden
			? '••••••'
			: formatCurrency(
					(asset.category === 'liability' ? -asset.currentValue : asset.currentValue) - linkedDebt,
					asset.currency
				)
	);
	const returnRate = $derived(
		asset.principalAmount > 0
			? Math.round(((asset.currentValue - asset.principalAmount) / asset.principalAmount) * 1000) /
					10
			: null
	);
</script>

<div class="grid gap-lg">
	<div class="grid gap-md md:grid-cols-3">
		<div class="rounded-lg border border-hairline bg-canvas-parchment p-lg">
			<p class="text-[14px] text-ink-muted-48">현재가치</p>
			<p class="font-display text-[28px]">{amount}</p>
		</div>
		<div class="rounded-lg border border-hairline bg-canvas-parchment p-lg">
			<p class="text-[14px] text-ink-muted-48">원금</p>
			<p class="font-display text-[28px]">{principal}</p>
		</div>
		<div class="rounded-lg border border-hairline bg-canvas-parchment p-lg">
			<p class="text-[14px] text-ink-muted-48">순가치 영향</p>
			<p class="font-display text-[28px]">{netValue}</p>
		</div>
	</div>

	<dl
		class="grid gap-sm text-[17px] leading-[1.47] tracking-[-0.374px] text-ink-muted-80 md:grid-cols-2"
	>
		<div>
			<dt class="font-semibold text-ink">기관</dt>
			<dd>{asset.institution ?? '기관 없음'}</dd>
		</div>
		<div>
			<dt class="font-semibold text-ink">평가일</dt>
			<dd>{formatDate(asset.valuationDate)}</dd>
		</div>
		<div>
			<dt class="font-semibold text-ink">수익률</dt>
			<dd>{returnRate === null ? formatPercent(asset.annualRate) : `${returnRate}%`}</dd>
		</div>
		<div>
			<dt class="font-semibold text-ink">만기일</dt>
			<dd>{asset.maturityDate ? formatDate(asset.maturityDate) : '없음'}</dd>
		</div>
		<div>
			<dt class="font-semibold text-ink">태그</dt>
			<dd>{asset.tags?.length ? asset.tags.join(', ') : '태그 없음'}</dd>
		</div>
		<div>
			<dt class="font-semibold text-ink">메모</dt>
			<dd>{asset.memo ?? '메모 없음'}</dd>
		</div>
	</dl>

	{#if linkedLiabilities.length > 0}
		<section class="grid gap-sm">
			<h3 class="text-[17px] font-semibold tracking-[-0.374px] text-ink">연결 부채</h3>
			<ul class="grid gap-sm">
				{#each linkedLiabilities as liability (liability.id)}
					<li class="rounded-md border border-hairline bg-canvas-parchment p-sm">
						<p class="font-semibold text-ink">{liability.name}</p>
						<p class="text-[14px] text-ink-muted-80">
							{liability.liabilityType} · 잔액 {privacyHidden
								? '••••••'
								: formatCurrency(liability.remainingAmount)}
							{#if liability.dueAt}
								· 만기 {formatDate(liability.dueAt)}
							{/if}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
