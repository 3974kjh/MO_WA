<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';
	import AssetDetail from '$lib/components/asset/AssetDetail.svelte';
	import AssetForm from '$lib/components/asset/AssetForm.svelte';
	import LiabilityForm from '$lib/components/asset/LiabilityForm.svelte';
	import MoWaLogo from '$lib/components/brand/MoWaLogo.svelte';
	import CashflowForm from '$lib/components/cashflow/CashflowForm.svelte';
	import CashflowList from '$lib/components/cashflow/CashflowList.svelte';
	import ComboChart from '$lib/components/dashboard/charts/ComboChart.svelte';
	import MultiLineChart from '$lib/components/dashboard/charts/MultiLineChart.svelte';
	import NetworkChart from '$lib/components/dashboard/charts/NetworkChart.svelte';
	import RadarChart from '$lib/components/dashboard/charts/RadarChart.svelte';
	import TreemapChart from '$lib/components/dashboard/charts/TreemapChart.svelte';
	import ChartShell from '$lib/components/dashboard/ChartShell.svelte';
	import PeriodRangeSlider from '$lib/components/dashboard/PeriodRangeSlider.svelte';
	import ProjectionChart from '$lib/components/dashboard/ProjectionChart.svelte';
	import ScenarioLab from '$lib/components/dashboard/ScenarioLab.svelte';
	import SummaryCards from '$lib/components/dashboard/SummaryCards.svelte';
	import DataGrid from '$lib/components/datagrid/DataGrid.svelte';
	import { formatCurrency } from '$lib/components/datagrid/formatters';
	import type { AssetCategory, AssetGridRow } from '$lib/components/datagrid/types';
	import ConfirmModal from '$lib/components/modal/ConfirmModal.svelte';
	import FormModal from '$lib/components/modal/FormModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import type { CashflowGridItem } from '$lib/types/cashflow';
	import type { LiabilityGridRow } from '$lib/types/liability';
	import {
		buildCashFlowSeries,
		buildDashboardSummary,
		buildFutureAssetProjection,
		buildMaturityAlerts,
		buildNetworkGraph,
		buildRadarSeries,
		buildRebalancingItems,
		buildTreemapRoot,
		filterRowsByChartSelection,
		filterRowsByPeriod,
		formatChangeRate,
		hasLiquidityWarning,
		type DashboardPeriod
	} from '$lib/utils/assetCalculations';

	type PageForm = { message?: string } | null;
	type ChartFilter = { category?: AssetCategory; assetId?: string } | null;

	let { data, form }: { data: PageData; form: PageForm } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let detailOpen = $state(false);
	let deleteOpen = $state(false);
	let goalOpen = $state(false);
	let liabilityOpen = $state(false);
	let liabilityDeleteOpen = $state(false);
	let cashflowOpen = $state(false);
	let cashflowEditOpen = $state(false);
	let cashflowDeleteOpen = $state(false);
	let selectedAsset = $state<AssetGridRow | null>(null);
	let selectedLiability = $state<LiabilityGridRow | null>(null);
	let selectedCashflow = $state<CashflowGridItem | null>(null);
	let privacyHidden = $state(false);
	let saving = $state(false);
	let period = $state<DashboardPeriod>('ALL');
	let chartFilter = $state<ChartFilter>(null);

	const assetRows = $derived(data.assetRows ?? []);
	const liabilities = $derived(data.liabilities ?? []);
	const cashflows = $derived(data.cashflows ?? []);
	const periodRows = $derived(filterRowsByPeriod(assetRows, period));
	const filteredRows = $derived(filterRowsByChartSelection(periodRows, chartFilter));
	const summary = $derived(
		buildDashboardSummary(filteredRows, {
			valuations: data.valuations ?? [],
			liabilities
		})
	);
	const treemapRoot = $derived(buildTreemapRoot(filteredRows));
	const valuationSeries = $derived(
		(data.valuationSeries ?? []).filter((series) =>
			filteredRows.some((row) => row.id === series.id)
		)
	);
	const cashFlowSeries = $derived(buildCashFlowSeries(filteredRows));
	const futureProjection = $derived(
		buildFutureAssetProjection({
			rows: assetRows,
			liabilities,
			cashflows,
			years: 5
		})
	);
	const maturityAlerts = $derived(buildMaturityAlerts(filteredRows, liabilities));
	const rebalancingItems = $derived(buildRebalancingItems(filteredRows));
	const radarSeries = $derived(buildRadarSeries(filteredRows));
	const networkGraph = $derived(buildNetworkGraph(filteredRows, liabilities));
	const liquidityWarning = $derived(hasLiquidityWarning(summary));
	const goalProgress = $derived(
		data.goal?.target_net_worth
			? Math.min(100, Math.round((summary.netWorth / Number(data.goal.target_net_worth)) * 100))
			: null
	);
	const linkedLiabilities = $derived(
		selectedAsset ? liabilities.filter((liability) => liability.assetId === selectedAsset?.id) : []
	);
	const selectedChartId = $derived(chartFilter?.assetId ?? chartFilter?.category ?? null);

	const closeOnSuccess: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			await update();
			saving = false;
			if (result.type === 'success' || result.type === 'redirect') {
				addOpen = false;
				editOpen = false;
				deleteOpen = false;
				goalOpen = false;
				liabilityOpen = false;
				liabilityDeleteOpen = false;
				cashflowOpen = false;
				cashflowEditOpen = false;
				cashflowDeleteOpen = false;
			}
		};
	};

	function amount(value: number) {
		return privacyHidden ? '••••••' : formatCurrency(value);
	}

	function openDetail(row: AssetGridRow) {
		selectedAsset = row;
		detailOpen = true;
	}

	function openDelete(row: AssetGridRow) {
		selectedAsset = row;
		deleteOpen = true;
	}

	function openCashflowEdit(item: CashflowGridItem) {
		selectedCashflow = item;
		cashflowEditOpen = true;
	}

	function openCashflowDelete(item: CashflowGridItem) {
		selectedCashflow = item;
		cashflowDeleteOpen = true;
	}

	function handleChartSelect(selection: ChartFilter) {
		chartFilter = selection;
	}

	function handleSeriesSelect(assetId: string | null) {
		if (!assetId) {
			chartFilter = null;
			return;
		}
		chartFilter = chartFilter?.assetId === assetId ? null : { assetId };
	}
</script>

<svelte:head>
	<title>MO_WA Dashboard</title>
	<meta
		name="description"
		content="MO_WA personal asset dashboard UI foundation based on DESIGN-apple."
	/>
</svelte:head>

<div class="min-h-screen bg-canvas-parchment text-ink">
	<header class="sticky top-0 z-30 border-b border-hairline bg-surface-black text-on-dark">
		<div class="mx-auto flex h-9 max-w-[1440px] items-center justify-between gap-sm px-md sm:px-lg">
			<MoWaLogo variant="on-dark" size={24} />
			<nav
				class="hidden items-center gap-md text-[11px] leading-none tracking-[-0.11px] text-on-dark/80 md:flex"
				aria-label="Dashboard navigation"
			>
				<a class="hover:text-on-dark" href="#scenario-lab">Scenario</a>
				<a class="hover:text-on-dark" href="#charts">Forecast</a>
				<a class="hover:text-on-dark" href="#assets">Assets</a>
			</nav>
			<form method="POST" action="?/logout">
				<button
					type="submit"
					class="inline-flex h-9 w-9 items-center justify-center rounded-pill bg-transparent text-on-dark transition-colors hover:bg-on-dark/10 active:scale-95"
					aria-label="로그아웃"
				>
					<Icon name="logout" size={18} />
				</button>
			</form>
		</div>
	</header>

	<div class="sticky top-9 z-20 border-b border-hairline bg-canvas-parchment/90 backdrop-blur-md">
		<div
			class="mx-auto flex max-w-[1440px] items-center gap-sm px-md py-1.5 sm:gap-md sm:px-lg"
		>
			<PeriodRangeSlider bind:value={period} />
			<div class="flex shrink-0 items-center gap-xxs">
				<button
					type="button"
					class="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-divider-soft bg-surface-pearl text-ink-muted-80 transition-colors hover:bg-canvas active:scale-95 {privacyHidden
						? 'border-primary/30 bg-primary/10 text-primary'
						: ''}"
					aria-label={privacyHidden ? '금액 표시' : '금액 숨김'}
					aria-pressed={privacyHidden}
					onclick={() => (privacyHidden = !privacyHidden)}
				>
					<Icon name={privacyHidden ? 'eye' : 'eye-off'} size={18} />
				</button>
				<button
					type="button"
					class="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-primary bg-canvas text-primary transition-colors hover:bg-canvas-parchment active:scale-95"
					aria-label="부채 추가"
					onclick={() => (liabilityOpen = true)}
				>
					<Icon name="liability" size={18} />
				</button>
				<button
					type="button"
					class="inline-flex h-9 w-9 items-center justify-center rounded-pill bg-primary text-on-primary transition-colors hover:bg-primary-focus active:scale-95"
					aria-label="자산 추가"
					onclick={() => (addOpen = true)}
				>
					<Icon name="asset" size={18} />
				</button>
			</div>
		</div>
	</div>

	<main class="mx-auto grid max-w-[1440px] gap-xl px-md py-xl sm:px-lg lg:px-xl">
		{#if form?.message || data.loadError}
			<p
				class="rounded-md bg-canvas p-md text-[14px] leading-[1.43] text-ink-muted-80"
				aria-live="polite"
			>
				{form?.message ?? data.loadError}
			</p>
		{/if}

		{#if liquidityWarning}
			<p class="rounded-md border border-hairline bg-canvas p-md text-[14px] text-ink">
				유동성 비율이 {summary.liquidityRatio}%로 낮습니다. 현금성 자산 비중을 확인해 주세요.
			</p>
		{/if}

		<ScenarioLab
			{summary}
			projection={futureProjection.summary}
			{privacyHidden}
			{goalProgress}
			onAddCashflow={() => (cashflowOpen = true)}
			onAddAsset={() => (addOpen = true)}
			onSetGoal={() => (goalOpen = true)}
		/>

		<SummaryCards
			totalAssets={amount(summary.totalAssets)}
			totalLiabilities={amount(summary.totalLiabilities)}
			netWorth={amount(summary.netWorth)}
			monthlyChange={amount(summary.monthlyChange)}
			monthlyChangeRate={formatChangeRate(summary.monthlyChangeRate)}
			liquidityRatio={`${summary.liquidityRatio}%`}
			{goalProgress}
		/>

		<section class="grid gap-md lg:grid-cols-12" id="charts">
			<div class="h-full lg:col-span-8">
				<ChartShell
					title="미래 자산 흐름 예측"
					description="월 단위 복리 계산을 연 단위 시계열로 요약합니다."
					valueLabel={amount(futureProjection.summary.projectedNetWorth)}
					periodLabel={`${futureProjection.summary.horizonYears}Y`}
				>
					<ProjectionChart series={futureProjection.series} {privacyHidden} />
				</ChartShell>
			</div>

			<div class="h-full lg:col-span-4">
				<ChartShell
					title="시나리오 입력"
					description="저장된 고정 수입·지출은 예측 엔진에 반영됩니다."
				>
					<CashflowList
						{cashflows}
						{privacyHidden}
						onAdd={() => (cashflowOpen = true)}
						onEdit={openCashflowEdit}
						onDelete={openCashflowDelete}
					/>
				</ChartShell>
			</div>

			<div class="h-full lg:col-span-8">
				<ChartShell
					title="현재 자산 Treemap"
					description="카테고리를 클릭하면 DataGrid 필터와 연동됩니다."
					valueLabel={amount(summary.totalAssets)}
					periodLabel={period}
				>
					<TreemapChart
						root={treemapRoot}
						{privacyHidden}
						selectedId={selectedChartId}
						onSelect={handleChartSelect}
					/>
				</ChartShell>
			</div>

			<div class="grid h-full gap-md lg:col-span-4">
				<ChartShell
					title="목표 순자산"
					description="최근 저장한 목표 대비 현재 순자산 진행률"
					valueLabel={`${goalProgress ?? 0}%`}
				>
					<div class="grid min-h-[180px] place-items-center rounded-lg bg-canvas-parchment p-lg">
						<div class="h-3 w-full overflow-hidden rounded-pill bg-canvas">
							<div
								class="h-full rounded-pill bg-primary"
								style={`width: ${goalProgress ?? 0}%`}
							></div>
						</div>
						<Button variant="pearl-capsule" label="목표 설정" onclick={() => (goalOpen = true)} />
					</div>
				</ChartShell>
				<ChartShell title="알림" description="60일 이내 만기 항목">
					<ul class="grid gap-sm text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-80">
						{#each maturityAlerts.slice(0, 4) as alert (alert.id)}
							<li class="rounded-md bg-surface-pearl p-sm">
								{alert.name} · {alert.daysLeft}일 후 만기 ({alert.dueAt})
							</li>
						{:else}
							<li class="rounded-md bg-surface-pearl p-sm">임박한 만기 항목이 없습니다.</li>
						{/each}
					</ul>
				</ChartShell>
			</div>

			<div class="lg:col-span-12">
				<ChartShell
					title="자산 상승 추이"
					description="legend 클릭 시 해당 자산으로 DataGrid가 필터됩니다."
					periodLabel={period}
				>
					<MultiLineChart series={valuationSeries} onSeriesSelect={handleSeriesSelect} />
				</ChartShell>
			</div>

			<div class="lg:col-span-12">
				<ChartShell
					title="월별 변화와 누적 순자산"
					description="자산 변화는 bar, 누적 순자산은 line으로 표시합니다."
					periodLabel={period}
				>
					<ComboChart series={cashFlowSeries} />
				</ChartShell>
			</div>

			<div class="h-full lg:col-span-6">
				<ChartShell title="리밸런싱 비율" description="현재 vs 기본 목표 비중">
					<ul class="grid gap-sm text-[14px] text-ink-muted-80">
						{#each rebalancingItems as item (item.category)}
							<li class="rounded-md bg-canvas-parchment p-sm">
								{item.label}: 현재 {item.currentRatio}% / 목표 {item.targetRatio}% (차이 {item.gap}%p)
							</li>
						{/each}
					</ul>
				</ChartShell>
			</div>

			<div class="h-full lg:col-span-6">
				<ChartShell title="자산 배분 Radar" description="카테고리별 현재·목표 비율">
					<RadarChart series={radarSeries} />
				</ChartShell>
			</div>

			<div class="lg:col-span-12">
				<ChartShell title="자산-부채 관계" description="담보 자산과 연결 부채 네트워크">
					<NetworkChart nodes={networkGraph.nodes} edges={networkGraph.edges} {privacyHidden} />
				</ChartShell>
			</div>
		</section>

		<section id="assets">
			{#if chartFilter}
				<p class="mb-sm text-[14px] text-ink-muted-80">
					차트 필터 적용 중
					<button type="button" class="text-primary" onclick={() => (chartFilter = null)}>
						필터 해제
					</button>
				</p>
			{/if}
			<DataGrid
				rows={filteredRows}
				onAdd={() => (addOpen = true)}
				onEdit={openDetail}
				onDelete={openDelete}
			/>
		</section>

		{#if liabilities.length > 0}
			<section class="grid gap-sm rounded-lg border border-hairline bg-canvas p-lg">
				<h2 class="font-display text-[21px] font-semibold">연결 부채 목록</h2>
				<ul class="grid gap-sm md:grid-cols-2">
					{#each liabilities as liability (liability.id)}
						<li class="rounded-md bg-canvas-parchment p-sm">
							<p class="font-semibold text-ink">{liability.name}</p>
							<p class="text-[14px] text-ink-muted-80">
								{liability.liabilityType} · 잔액 {amount(liability.remainingAmount)}
								{#if liability.dueAt}
									· 만기 {liability.dueAt}
								{/if}
							</p>
							<button
								type="button"
								class="mt-xs text-[14px] text-primary"
								onclick={() => {
									selectedLiability = liability;
									liabilityDeleteOpen = true;
								}}
							>
								삭제
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</main>
</div>

<FormModal
	open={addOpen}
	title="자산 추가"
	description="Supabase form action으로 실제 자산을 저장합니다."
	formId="asset-create-form"
	{saving}
	onClose={() => (addOpen = false)}
>
	<form id="asset-create-form" method="POST" action="?/createAsset" use:enhance={closeOnSuccess}>
		<AssetForm customCategories={data.customCategories ?? []} />
	</form>
</FormModal>

<FormModal
	open={detailOpen}
	title={selectedAsset ? selectedAsset.name : '자산 상세'}
	description="자산, 부채, 평가액이 순자산에 미치는 영향을 확인합니다."
	saveLabel="편집"
	onClose={() => (detailOpen = false)}
	onSave={() => {
		detailOpen = false;
		editOpen = true;
	}}
>
	{#if selectedAsset}
		<AssetDetail asset={selectedAsset} {linkedLiabilities} {privacyHidden} />
	{/if}
</FormModal>

<FormModal
	open={editOpen}
	title={selectedAsset ? `${selectedAsset.name} 수정` : '자산 수정'}
	description="수정 시 asset_valuations에도 새 평가 이력이 추가됩니다."
	formId="asset-update-form"
	{saving}
	onClose={() => (editOpen = false)}
>
	{#if selectedAsset}
		<form id="asset-update-form" method="POST" action="?/updateAsset" use:enhance={closeOnSuccess}>
			<AssetForm asset={selectedAsset} customCategories={data.customCategories ?? []} />
		</form>
	{/if}
</FormModal>

<ConfirmModal
	open={deleteOpen}
	title={selectedAsset ? `${selectedAsset.name} 삭제` : '자산 삭제'}
	description="삭제하면 연결된 평가 이력도 함께 삭제됩니다."
	confirmLabel="삭제"
	formId="asset-delete-form"
	onClose={() => (deleteOpen = false)}
/>

<form id="asset-delete-form" method="POST" action="?/deleteAsset" use:enhance={closeOnSuccess}>
	<input type="hidden" name="id" value={selectedAsset?.id ?? ''} />
</form>

<FormModal
	open={liabilityOpen}
	title="부채 추가"
	description="담보 자산과 연결해 부채를 추적합니다."
	formId="liability-create-form"
	{saving}
	onClose={() => (liabilityOpen = false)}
>
	<form
		id="liability-create-form"
		method="POST"
		action="?/createLiability"
		use:enhance={closeOnSuccess}
	>
		<LiabilityForm assets={assetRows} />
	</form>
</FormModal>

<ConfirmModal
	open={liabilityDeleteOpen}
	title={selectedLiability ? `${selectedLiability.name} 삭제` : '부채 삭제'}
	description="연결된 상환 내역도 함께 삭제됩니다."
	confirmLabel="삭제"
	formId="liability-delete-form"
	onClose={() => (liabilityDeleteOpen = false)}
/>

<form
	id="liability-delete-form"
	method="POST"
	action="?/deleteLiability"
	use:enhance={closeOnSuccess}
>
	<input type="hidden" name="id" value={selectedLiability?.id ?? ''} />
</form>

<FormModal
	open={cashflowOpen}
	title="고정 수입·지출 추가"
	description="월/년 반복 항목을 저장해 미래 자산 예측에 반영합니다."
	formId="cashflow-create-form"
	{saving}
	onClose={() => (cashflowOpen = false)}
>
	<form
		id="cashflow-create-form"
		method="POST"
		action="?/createCashflow"
		use:enhance={closeOnSuccess}
	>
		<CashflowForm />
	</form>
</FormModal>

<FormModal
	open={cashflowEditOpen}
	title={selectedCashflow ? `${selectedCashflow.name} 수정` : '고정 수입·지출 수정'}
	description="수정 즉시 Scenario Lab 예측에 반영됩니다."
	formId="cashflow-update-form"
	{saving}
	onClose={() => (cashflowEditOpen = false)}
>
	{#if selectedCashflow}
		<form
			id="cashflow-update-form"
			method="POST"
			action="?/updateCashflow"
			use:enhance={closeOnSuccess}
		>
			<CashflowForm cashflow={selectedCashflow} />
		</form>
	{/if}
</FormModal>

<ConfirmModal
	open={cashflowDeleteOpen}
	title={selectedCashflow ? `${selectedCashflow.name} 삭제` : '고정 수입·지출 삭제'}
	description="삭제하면 미래 예측 시나리오에서 해당 반복 현금흐름이 제외됩니다."
	confirmLabel="삭제"
	formId="cashflow-delete-form"
	onClose={() => (cashflowDeleteOpen = false)}
/>

<form
	id="cashflow-delete-form"
	method="POST"
	action="?/deleteCashflow"
	use:enhance={closeOnSuccess}
>
	<input type="hidden" name="id" value={selectedCashflow?.id ?? ''} />
</form>

<FormModal
	open={goalOpen}
	title="목표 순자산"
	description="목표를 저장하면 대시보드 진행률에 반영됩니다."
	formId="goal-form"
	{saving}
	onClose={() => (goalOpen = false)}
>
	<form id="goal-form" method="POST" action="?/updateGoal" use:enhance={closeOnSuccess}>
		<div class="grid gap-md md:grid-cols-2">
			<Input
				id="targetNetWorth"
				label="목표 순자산"
				type="number"
				value={String(data.goal?.target_net_worth ?? '')}
				required
			/>
			<Input id="targetDate" label="목표일" type="date" value={data.goal?.target_date ?? ''} />
		</div>
	</form>
</FormModal>

