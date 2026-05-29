import { describe, expect, it } from 'vitest';
import type { AssetGridRow } from '$lib/components/datagrid/types';
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
	computeMonthlyChange,
	computeNetWorthAtDate,
	filterRowsByChartSelection,
	filterRowsByPeriod,
	formatChangeRate,
	hasLiquidityWarning,
	normalizeMonthlyCashflow,
	serializeRowsToCsv,
	type CashflowItem,
	type ValuationRecord
} from './assetCalculations';

const rows: AssetGridRow[] = [
	{
		id: 'apt',
		category: 'real_estate',
		subcategory: '아파트',
		name: '아파트',
		institution: 'KB',
		principalAmount: 100,
		currentValue: 150,
		currency: 'KRW',
		valuationDate: '2026-05-01',
		annualRate: 50,
		memo: 'home',
		maturityDate: '2026-06-15'
	},
	{
		id: 'cash',
		category: 'cash',
		subcategory: '예금',
		name: '예금',
		institution: 'Bank',
		principalAmount: 50,
		currentValue: 60,
		currency: 'KRW',
		valuationDate: '2026-05-02',
		annualRate: 20
	},
	{
		id: 'loan',
		category: 'liability',
		subcategory: '주택담보대출',
		name: '대출',
		institution: 'Bank',
		principalAmount: 80,
		currentValue: 70,
		currency: 'KRW',
		valuationDate: '2026-05-03',
		annualRate: -3
	}
];

const valuations: ValuationRecord[] = [
	{ asset_id: 'apt', value: 120, valued_at: '2026-04-01' },
	{ asset_id: 'apt', value: 150, valued_at: '2026-05-01' },
	{ asset_id: 'cash', value: 55, valued_at: '2026-04-01' },
	{ asset_id: 'cash', value: 60, valued_at: '2026-05-02' }
];

const liabilities: LiabilityGridRow[] = [
	{
		id: 'mortgage',
		assetId: 'apt',
		name: '주담대',
		liabilityType: '주택담보대출',
		principalAmount: 100,
		remainingAmount: 40,
		interestRate: 3.5,
		startedAt: '2024-01-01',
		dueAt: '2026-06-20',
		memo: null
	}
];

describe('assetCalculations', () => {
	it('builds dashboard summary with liabilities from table and monthly change', () => {
		expect.assertions(3);

		const summary = buildDashboardSummary(rows, {
			valuations,
			liabilities,
			now: new Date('2026-05-29')
		});

		expect(summary.totalLiabilities).toBe(110);
		expect(summary.netWorth).toBe(100);
		expect(summary.monthlyChange).toBe(-35);
	});

	it('computes net worth at a historical date from valuations', () => {
		expect.assertions(1);

		expect(computeNetWorthAtDate(rows, liabilities, valuations, '2026-04-30')).toBe(135);
	});

	it('computes monthly change rate from valuations', () => {
		expect.assertions(1);

		const result = computeMonthlyChange(
			rows,
			liabilities,
			valuations,
			140,
			new Date('2026-05-29')
		);

		expect(result.monthlyChange).toBe(5);
	});

	it('builds a treemap hierarchy grouped by asset category', () => {
		expect.assertions(2);

		const root = buildTreemapRoot(rows);

		expect(root.value).toBe(280);
		expect(root.children?.map((child) => [child.id, child.value])).toEqual([
			['real_estate', 150],
			['cash', 60],
			['liability', 70]
		]);
	});

	it('filters rows by supported dashboard periods', () => {
		expect.assertions(2);

		expect(filterRowsByPeriod(rows, '1M', new Date('2026-05-29')).map((row) => row.id)).toEqual([
			'apt',
			'cash',
			'loan'
		]);
		expect(filterRowsByPeriod(rows, '1M', new Date('2026-07-01'))).toEqual([]);
	});

	it('filters rows by chart selection', () => {
		expect.assertions(2);

		expect(filterRowsByChartSelection(rows, { category: 'cash' }).map((row) => row.id)).toEqual([
			'cash'
		]);
		expect(filterRowsByChartSelection(rows, { assetId: 'apt' })).toHaveLength(1);
	});

	it('builds valuation and cash-flow chart series from rows', () => {
		expect.assertions(2);

		expect(buildRadarSeries(rows)).toHaveLength(3);
		expect(buildCashFlowSeries(rows).map((series) => series.name)).toEqual([
			'월별 자산 변화',
			'누적 순자산'
		]);
	});

	it('builds maturity alerts and network graph', () => {
		expect.assertions(3);

		const alerts = buildMaturityAlerts(rows, liabilities, new Date('2026-05-29'));
		const graph = buildNetworkGraph(rows, liabilities);

		expect(alerts.length).toBeGreaterThan(0);
		expect(graph.edges).toHaveLength(1);
		expect(buildRebalancingItems(rows)).toHaveLength(3);
	});

	it('warns when liquidity ratio is low', () => {
		expect.assertions(2);

		const summary = buildDashboardSummary([
			{
				id: 'stock',
				category: 'investment',
				subcategory: 'ETF',
				name: 'ETF',
				principalAmount: 1000,
				currentValue: 1000,
				currency: 'KRW',
				valuationDate: '2026-05-01'
			}
		]);

		expect(hasLiquidityWarning(summary)).toBe(true);
		expect(formatChangeRate(4.5)).toBe('+4.5%');
	});

	it('serializes rows to CSV with escaped values', () => {
		expect.assertions(1);

		expect(serializeRowsToCsv([{ ...rows[0], memo: 'comma, memo', tags: ['core'] }])).toContain(
			'"comma, memo"'
		);
	});

	it('normalizes fixed monthly and yearly cashflows into monthly net flow', () => {
		expect.assertions(1);

		const cashflows: CashflowItem[] = [
			{
				id: 'salary',
				name: '월급',
				direction: 'income',
				cadence: 'monthly',
				amount: 300
			},
			{
				id: 'insurance',
				name: '연 보험료',
				direction: 'expense',
				cadence: 'yearly',
				amount: 1200
			}
		];

		expect(normalizeMonthlyCashflow(cashflows, new Date('2026-06-01'))).toBe(200);
	});

	it('builds yearly compound future asset projection from assets and fixed cashflows', () => {
		expect.assertions(4);

		const projection = buildFutureAssetProjection({
			rows: [
				{
					id: 'deposit',
					category: 'cash',
					subcategory: '적금',
					name: '정기 적금',
					principalAmount: 1000,
					currentValue: 1000,
					currency: 'KRW',
					valuationDate: '2026-05-01',
					annualRate: 12,
					monthlyContribution: 100
				},
				{
					id: 'stock',
					category: 'investment',
					subcategory: '국내 주식',
					name: '주식',
					principalAmount: 1000,
					currentValue: 1000,
					currency: 'KRW',
					valuationDate: '2026-05-01',
					annualRate: 0
				}
			],
			liabilities: [{ ...liabilities[0], remainingAmount: 500 }],
			cashflows: [
				{
					id: 'salary',
					name: '월급',
					direction: 'income',
					cadence: 'monthly',
					amount: 300
				},
				{
					id: 'insurance',
					name: '연 보험료',
					direction: 'expense',
					cadence: 'yearly',
					amount: 1200
				}
			],
			years: 2,
			now: new Date('2026-05-29')
		});

		expect(projection.series).toHaveLength(3);
		expect(projection.series[0].points).toHaveLength(3);
		expect(projection.summary.projectedNetWorth).toBeGreaterThan(projection.summary.startNetWorth);
		expect(projection.series[0].points[1].y).toBeCloseTo(5284.64, 1);
	});
});
