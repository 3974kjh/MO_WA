<script lang="ts">
	import DashboardCard from './DashboardCard.svelte';

	let {
		totalAssets,
		totalLiabilities,
		netWorth,
		monthlyChange,
		monthlyChangeRate,
		liquidityRatio,
		goalProgress = null
	}: {
		totalAssets: string;
		totalLiabilities: string;
		netWorth: string;
		monthlyChange: string;
		monthlyChangeRate: string;
		liquidityRatio: string;
		goalProgress?: number | null;
	} = $props();
</script>

<div class="grid gap-md md:grid-cols-2 xl:grid-cols-5">
	<DashboardCard label="총자산" value={totalAssets} delta={monthlyChangeRate}>
		실물과 금융 자산을 합산한 현재 평가액
	</DashboardCard>
	<DashboardCard label="총부채" value={totalLiabilities} tone="parchment">
		담보대출과 신용부채를 분리해 추적
	</DashboardCard>
	<DashboardCard
		label="순자산"
		value={netWorth}
		tone="dark"
		delta={goalProgress !== null ? `목표 ${goalProgress}%` : undefined}
	>
		총자산에서 부채를 차감한 핵심 지표
	</DashboardCard>
	<DashboardCard label="월간 변화" value={monthlyChange}>
		최근 평가일 기준 전월 대비 증감
	</DashboardCard>
	<DashboardCard label="유동성 비율" value={liquidityRatio} tone="parchment">
		현금성 자산과 단기 운용 자산 기준
	</DashboardCard>
</div>
