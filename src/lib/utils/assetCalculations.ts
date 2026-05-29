import { categoryLabels } from '$lib/components/datagrid/formatters';
import type { AssetCategory, AssetGridRow } from '$lib/components/datagrid/types';
import type { LiabilityGridRow } from '$lib/types/liability';

export type DashboardPeriod = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export type DashboardSummary = {
	totalAssets: number;
	totalLiabilities: number;
	netWorth: number;
	monthlyChange: number;
	monthlyChangeRate: number;
	liquidityRatio: number;
};

export type ChartPoint = {
	x: string;
	y: number;
	label?: string;
	category?: string;
};

export type ChartSeries = {
	id: string;
	name: string;
	type?: 'line' | 'bar' | 'area';
	colorToken?: string;
	points: ChartPoint[];
};

export type CashflowItem = {
	id: string;
	name: string;
	direction: 'income' | 'expense';
	cadence: 'monthly' | 'yearly';
	amount: number;
	category?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	memo?: string | null;
};

export type FutureProjectionInput = {
	rows: AssetGridRow[];
	liabilities?: LiabilityGridRow[];
	cashflows?: CashflowItem[];
	years?: number;
	now?: Date;
};

export type FutureProjectionSummary = {
	startNetWorth: number;
	projectedNetWorth: number;
	growthAmount: number;
	monthlyNetCashflow: number;
	yearlyNetCashflow: number;
	compoundGain: number;
	horizonYears: number;
};

export type FutureProjection = {
	series: ChartSeries[];
	summary: FutureProjectionSummary;
};

export type HierarchyNode = {
	id: string;
	name: string;
	value: number;
	kind: 'asset' | 'liability' | 'category' | 'account';
	children?: HierarchyNode[];
};

export type NetworkNode = {
	id: string;
	label: string;
	group: string;
	value?: number;
};

export type NetworkEdge = {
	source: string;
	target: string;
	value?: number;
	label?: string;
};

export type ValuationRecord = {
	asset_id: string;
	value: number;
	valued_at: string;
};

export type MaturityAlert = {
	id: string;
	name: string;
	kind: 'asset' | 'liability';
	dueAt: string;
	daysLeft: number;
};

export type RebalancingItem = {
	category: AssetCategory;
	label: string;
	currentRatio: number;
	targetRatio: number;
	gap: number;
};

export type DashboardSummaryOptions = {
	valuations?: ValuationRecord[];
	liabilities?: LiabilityGridRow[];
	now?: Date;
};

const categoryOrder: AssetCategory[] = ['real_estate', 'investment', 'cash', 'liability'];
const LIQUIDITY_WARNING_THRESHOLD = 15;
const MATURITY_ALERT_DAYS = 60;
const DEFAULT_TARGET_ALLOCATION: Record<AssetCategory, number> = {
	real_estate: 40,
	investment: 35,
	cash: 25,
	liability: 0
};

export function buildDashboardSummary(
	rows: AssetGridRow[],
	options: DashboardSummaryOptions = {}
): DashboardSummary {
	const liabilities = options.liabilities ?? [];
	const totalAssets = rows
		.filter((row) => row.category !== 'liability')
		.reduce((sum, row) => sum + row.currentValue, 0);
	const legacyLiabilities = rows
		.filter((row) => row.category === 'liability')
		.reduce((sum, row) => sum + row.currentValue, 0);
	const tableLiabilities = liabilities.reduce((sum, row) => sum + row.remainingAmount, 0);
	const totalLiabilities = legacyLiabilities + tableLiabilities;
	const cash = rows
		.filter((row) => row.category === 'cash')
		.reduce((sum, row) => sum + row.currentValue, 0);
	const netWorth = totalAssets - totalLiabilities;
	const now = options.now ?? new Date();
	const { monthlyChange, monthlyChangeRate } = computeMonthlyChange(
		rows,
		liabilities,
		options.valuations ?? [],
		netWorth,
		now
	);

	return {
		totalAssets,
		totalLiabilities,
		netWorth,
		monthlyChange,
		monthlyChangeRate,
		liquidityRatio: totalAssets > 0 ? Math.round((cash / totalAssets) * 100) : 0
	};
}

export function computeMonthlyChange(
	rows: AssetGridRow[],
	liabilities: LiabilityGridRow[],
	valuations: ValuationRecord[],
	currentNetWorth: number,
	now: Date
) {
	const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
	const previousNetWorth = computeNetWorthAtDate(
		rows,
		liabilities,
		valuations,
		prevMonthEnd.toISOString().slice(0, 10)
	);

	const monthlyChange = currentNetWorth - previousNetWorth;
	const monthlyChangeRate =
		previousNetWorth !== 0
			? Math.round((monthlyChange / Math.abs(previousNetWorth)) * 1000) / 10
			: 0;

	return { monthlyChange, monthlyChangeRate };
}

export function computeNetWorthAtDate(
	rows: AssetGridRow[],
	liabilities: LiabilityGridRow[],
	valuations: ValuationRecord[],
	asOfDate: string
) {
	let totalAssets = 0;
	let totalLiabilities = 0;

	for (const row of rows) {
		const value = resolveAssetValueAtDate(row, valuations, asOfDate);
		if (row.category === 'liability') {
			totalLiabilities += value;
		} else {
			totalAssets += value;
		}
	}

	totalLiabilities += liabilities.reduce((sum, row) => sum + row.remainingAmount, 0);
	return totalAssets - totalLiabilities;
}

function resolveAssetValueAtDate(
	row: AssetGridRow,
	valuations: ValuationRecord[],
	asOfDate: string
) {
	const history = valuations
		.filter((valuation) => valuation.asset_id === row.id && valuation.valued_at <= asOfDate)
		.sort((left, right) => right.valued_at.localeCompare(left.valued_at));

	if (history.length > 0) return Number(history[0].value);
	if (row.valuationDate <= asOfDate) return row.currentValue;
	return 0;
}

export function buildTreemapRoot(rows: AssetGridRow[]): HierarchyNode {
	const children = categoryOrder
		.map((category) => {
			const categoryRows = rows.filter((row) => row.category === category);
			const value = categoryRows.reduce((sum, row) => sum + row.currentValue, 0);

			return {
				id: category,
				name: categoryLabels[category],
				value,
				kind: category === 'liability' ? 'liability' : 'category',
				children: categoryRows.map((row) => ({
					id: row.id,
					name: row.name,
					value: row.currentValue,
					kind: category === 'liability' ? 'liability' : 'asset'
				}))
			} satisfies HierarchyNode;
		})
		.filter((node) => node.value > 0);

	return {
		id: 'net-worth-root',
		name: '전체 자산',
		value: children.reduce((sum, child) => sum + child.value, 0),
		kind: 'category',
		children
	};
}

export function filterRowsByPeriod(
	rows: AssetGridRow[],
	period: DashboardPeriod,
	now = new Date()
): AssetGridRow[] {
	if (period === 'ALL') return rows;

	const start = new Date(now);
	if (period === 'YTD') {
		start.setMonth(0, 1);
		start.setHours(0, 0, 0, 0);
	} else {
		const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period];
		start.setMonth(start.getMonth() - months);
	}

	return rows.filter((row) => new Date(`${row.valuationDate}T00:00:00`) >= start);
}

export function filterRowsByChartSelection(
	rows: AssetGridRow[],
	selection: { category?: AssetCategory; assetId?: string } | null
) {
	if (!selection) return rows;
	if (selection.assetId) {
		return rows.filter((row) => row.id === selection.assetId);
	}
	if (selection.category) {
		return rows.filter((row) => row.category === selection.category);
	}
	return rows;
}

export function buildValuationSeries(rows: AssetGridRow[]): ChartSeries[] {
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		type: 'line',
		points: [
			{
				x: row.valuationDate,
				y: row.currentValue,
				label: row.name,
				category: row.category
			}
		]
	}));
}

export function buildCashFlowSeries(rows: AssetGridRow[]): ChartSeries[] {
	const sorted = [...rows].sort((a, b) => a.valuationDate.localeCompare(b.valuationDate));
	let runningNetWorth = 0;

	return [
		{
			id: 'monthly-change',
			name: '월별 자산 변화',
			type: 'bar',
			points: sorted.map((row) => ({
				x: row.valuationDate,
				y: row.category === 'liability' ? -row.currentValue : row.currentValue,
				label: row.name,
				category: row.category
			}))
		},
		{
			id: 'net-worth',
			name: '누적 순자산',
			type: 'line',
			points: sorted.map((row) => {
				runningNetWorth += row.category === 'liability' ? -row.currentValue : row.currentValue;
				return {
					x: row.valuationDate,
					y: runningNetWorth,
					label: '순자산',
					category: row.category
				};
			})
		}
	];
}

export function normalizeMonthlyCashflow(cashflows: CashflowItem[], date = new Date()): number {
	return cashflows
		.filter((item) => isCashflowActive(item, date))
		.reduce((sum, item) => {
			const normalizedAmount = item.cadence === 'yearly' ? item.amount / 12 : item.amount;
			return sum + (item.direction === 'income' ? normalizedAmount : -normalizedAmount);
		}, 0);
}

export function buildFutureAssetProjection(input: FutureProjectionInput): FutureProjection {
	const years = Math.max(1, Math.round(input.years ?? 5));
	const now = input.now ?? new Date();
	const liabilities = input.liabilities ?? [];
	const cashflows = input.cashflows ?? [];
	const balances = input.rows
		.filter((row) => row.category !== 'liability')
		.map((row) => ({
			row,
			value: row.currentValue,
			contributions: 0
		}));
	const legacyLiabilityTotal = input.rows
		.filter((row) => row.category === 'liability')
		.reduce((sum, row) => sum + row.currentValue, 0);
	const liabilityTotal =
		legacyLiabilityTotal + liabilities.reduce((sum, row) => sum + row.remainingAmount, 0);
	const startAssets = balances.reduce((sum, item) => sum + item.value, 0);
	const startNetWorth = startAssets - liabilityTotal;
	const projectedNetWorthPoints: ChartPoint[] = [
		{
			x: String(now.getFullYear()),
			y: roundMoney(startNetWorth),
			label: '현재 순자산'
		}
	];
	const assetGrowthPoints: ChartPoint[] = [
		{
			x: String(now.getFullYear()),
			y: roundMoney(startAssets),
			label: '현재 자산'
		}
	];
	const cashflowPoints: ChartPoint[] = [
		{
			x: String(now.getFullYear()),
			y: 0,
			label: '고정 현금흐름'
		}
	];
	let accumulatedCashflow = 0;
	let accumulatedContributions = 0;

	for (let month = 1; month <= years * 12; month += 1) {
		const projectedDate = addMonths(now, month);
		const monthlyCashflow = normalizeMonthlyCashflow(cashflows, projectedDate);
		accumulatedCashflow += monthlyCashflow;

		for (const balance of balances) {
			const monthlyRate = annualRateToMonthlyRate(balance.row.annualRate ?? 0);
			balance.value *= 1 + monthlyRate;

			if (isContributionActive(balance.row, projectedDate)) {
				const contribution = balance.row.monthlyContribution ?? 0;
				balance.value += contribution;
				balance.contributions += contribution;
				accumulatedContributions += contribution;
			}
		}

		if (month % 12 === 0) {
			const assetTotal = balances.reduce((sum, item) => sum + item.value, 0);
			const netWorth = assetTotal + accumulatedCashflow - liabilityTotal;
			const yearLabel = String(now.getFullYear() + month / 12);
			projectedNetWorthPoints.push({
				x: yearLabel,
				y: roundMoney(netWorth),
				label: `${yearLabel} 예상 순자산`
			});
			assetGrowthPoints.push({
				x: yearLabel,
				y: roundMoney(assetTotal),
				label: `${yearLabel} 자산 성장`
			});
			cashflowPoints.push({
				x: yearLabel,
				y: roundMoney(accumulatedCashflow),
				label: `${yearLabel} 누적 고정 현금흐름`
			});
		}
	}

	const projectedNetWorth = projectedNetWorthPoints.at(-1)?.y ?? startNetWorth;
	const assetTotal = balances.reduce((sum, item) => sum + item.value, 0);
	const compoundGain = assetTotal - startAssets - accumulatedContributions;
	const monthlyNetCashflow = normalizeMonthlyCashflow(cashflows, now);

	return {
		series: [
			{
				id: 'projected-net-worth',
				name: '예상 순자산',
				type: 'line',
				points: projectedNetWorthPoints
			},
			{
				id: 'projected-assets',
				name: '자산 성장',
				type: 'area',
				points: assetGrowthPoints
			},
			{
				id: 'fixed-cashflow',
				name: '고정 현금흐름',
				type: 'bar',
				points: cashflowPoints
			}
		],
		summary: {
			startNetWorth: roundMoney(startNetWorth),
			projectedNetWorth: roundMoney(projectedNetWorth),
			growthAmount: roundMoney(projectedNetWorth - startNetWorth),
			monthlyNetCashflow: roundMoney(monthlyNetCashflow),
			yearlyNetCashflow: roundMoney(monthlyNetCashflow * 12),
			compoundGain: roundMoney(compoundGain),
			horizonYears: years
		}
	};
}

export function buildRadarSeries(rows: AssetGridRow[]): ChartSeries[] {
	const totalAssets = rows
		.filter((row) => row.category !== 'liability')
		.reduce((sum, row) => sum + row.currentValue, 0);

	return categoryOrder
		.filter((category) => category !== 'liability')
		.map((category) => {
			const value = rows
				.filter((row) => row.category === category)
				.reduce((sum, row) => sum + row.currentValue, 0);
			const ratio = totalAssets > 0 ? Math.round((value / totalAssets) * 100) : 0;

			return {
				id: category,
				name: categoryLabels[category],
				type: 'line' as const,
				points: [
					{ x: '현재', y: ratio, category },
					{ x: '목표', y: DEFAULT_TARGET_ALLOCATION[category], category }
				]
			};
		});
}

export function buildNetworkGraph(
	rows: AssetGridRow[],
	liabilities: LiabilityGridRow[]
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
	const nodes: NetworkNode[] = rows
		.filter((row) => row.category !== 'liability')
		.map((row) => ({
			id: row.id,
			label: row.name,
			group: row.category,
			value: row.currentValue
		}));

	const edges: NetworkEdge[] = liabilities
		.filter((liability) => liability.assetId)
		.map((liability) => ({
			source: liability.assetId!,
			target: liability.id,
			value: liability.remainingAmount,
			label: liability.name
		}));

	for (const liability of liabilities) {
		nodes.push({
			id: liability.id,
			label: liability.name,
			group: 'liability',
			value: liability.remainingAmount
		});
	}

	return { nodes, edges };
}

export function buildMaturityAlerts(
	rows: AssetGridRow[],
	liabilities: LiabilityGridRow[],
	now = new Date()
): MaturityAlert[] {
	const alerts: MaturityAlert[] = [];

	for (const row of rows) {
		if (!row.maturityDate) continue;
		const daysLeft = daysUntil(row.maturityDate, now);
		if (daysLeft <= MATURITY_ALERT_DAYS) {
			alerts.push({
				id: row.id,
				name: row.name,
				kind: 'asset',
				dueAt: row.maturityDate,
				daysLeft
			});
		}
	}

	for (const liability of liabilities) {
		if (!liability.dueAt) continue;
		const daysLeft = daysUntil(liability.dueAt, now);
		if (daysLeft <= MATURITY_ALERT_DAYS) {
			alerts.push({
				id: liability.id,
				name: liability.name,
				kind: 'liability',
				dueAt: liability.dueAt,
				daysLeft
			});
		}
	}

	return alerts.sort((left, right) => left.daysLeft - right.daysLeft);
}

export function buildRebalancingItems(rows: AssetGridRow[]): RebalancingItem[] {
	const totalAssets = rows
		.filter((row) => row.category !== 'liability')
		.reduce((sum, row) => sum + row.currentValue, 0);

	return (['real_estate', 'investment', 'cash'] as AssetCategory[]).map((category) => {
		const value = rows
			.filter((row) => row.category === category)
			.reduce((sum, row) => sum + row.currentValue, 0);
		const currentRatio = totalAssets > 0 ? Math.round((value / totalAssets) * 10) / 10 : 0;
		const targetRatio = DEFAULT_TARGET_ALLOCATION[category];

		return {
			category,
			label: categoryLabels[category],
			currentRatio,
			targetRatio,
			gap: Math.round((currentRatio - targetRatio) * 10) / 10
		};
	});
}

export function hasLiquidityWarning(summary: DashboardSummary) {
	return summary.liquidityRatio < LIQUIDITY_WARNING_THRESHOLD;
}

export function formatChangeRate(rate: number) {
	const sign = rate > 0 ? '+' : '';
	return `${sign}${rate}%`;
}

export function serializeRowsToCsv(rows: AssetGridRow[]): string {
	const headers = [
		'id',
		'category',
		'subcategory',
		'name',
		'institution',
		'principalAmount',
		'currentValue',
		'currency',
		'valuationDate',
		'annualRate',
		'maturityDate',
		'monthlyContribution',
		'contributionEndDate',
		'tags',
		'memo'
	];

	return [
		headers.join(','),
		...rows.map((row) =>
			headers
				.map((header) => {
					if (header === 'tags') return escapeCsvValue((row.tags ?? []).join('|'));
					return escapeCsvValue(row[header as keyof AssetGridRow] ?? '');
				})
				.join(',')
		)
	].join('\n');
}

function daysUntil(date: string, now: Date) {
	const target = new Date(`${date}T00:00:00`);
	const diff = target.getTime() - now.getTime();
	return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function annualRateToMonthlyRate(annualRate: number) {
	if (!Number.isFinite(annualRate)) return 0;
	const normalizedRate = Math.max(-99.999, annualRate) / 100;
	return Math.pow(1 + normalizedRate, 1 / 12) - 1;
}

function isCashflowActive(item: CashflowItem, date: Date) {
	const dateKey = toDateKey(date);
	return (
		(!item.startDate || item.startDate <= dateKey) && (!item.endDate || item.endDate >= dateKey)
	);
}

function isContributionActive(row: AssetGridRow, date: Date) {
	const contribution = row.monthlyContribution ?? 0;
	if (contribution <= 0) return false;
	return !row.contributionEndDate || row.contributionEndDate >= toDateKey(date);
}

function addMonths(date: Date, months: number) {
	const next = new Date(date);
	next.setMonth(next.getMonth() + months);
	return next;
}

function toDateKey(date: Date) {
	return date.toISOString().slice(0, 10);
}

function roundMoney(value: number) {
	return Math.round(value * 100) / 100;
}

function escapeCsvValue(value: string | number | string[]): string {
	const raw = String(value);
	if (!/[",\n]/.test(raw)) return raw;
	return `"${raw.replaceAll('"', '""')}"`;
}
