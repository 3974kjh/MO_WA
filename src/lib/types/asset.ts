import type { AssetCategory, AssetCurrency, AssetGridRow } from '$lib/components/datagrid/types';
import type { Database } from './database.types';

export const assetCategoryOptions = [
	{ label: '부동산', value: 'real_estate' },
	{ label: '투자', value: 'investment' },
	{ label: '현금성', value: 'cash' },
	{ label: '부채', value: 'liability' }
] satisfies Array<{ label: string; value: AssetCategory }>;

export const assetCurrencyOptions = [
	{ label: 'KRW', value: 'KRW' },
	{ label: 'USD', value: 'USD' },
	{ label: 'BTC', value: 'BTC' },
	{ label: 'ETH', value: 'ETH' },
	{ label: '금', value: 'XAU' },
	{ label: '은', value: 'XAG' }
] satisfies Array<{ label: string; value: AssetCurrency }>;

export const presetSubcategories: Record<AssetCategory, string[]> = {
	real_estate: ['아파트', '오피스텔', '토지', '상가', '전세보증금', '기타'],
	investment: [
		'국내 주식',
		'해외 주식',
		'ETF',
		'비트코인',
		'기타 가상자산',
		'채권',
		'어음',
		'금',
		'은',
		'기타'
	],
	cash: ['입출금', '예금', '적금', '파킹통장', 'CMA', 'MMF', '현금', '기타'],
	liability: [
		'주택담보대출',
		'전세대출',
		'신용대출',
		'카드대금',
		'마이너스통장',
		'투자 관련 대출',
		'기타'
	]
};

export const presetCategoryRows = Object.entries(presetSubcategories).flatMap(([category, names]) =>
	names.map((name) => ({ category: category as AssetCategory, name }))
);

export type AssetRow = Database['public']['Tables']['assets']['Row'];

export type AssetFormValues = {
	category: AssetCategory;
	subcategory: string;
	name: string;
	institution: string | null;
	principalAmount: number;
	currentValue: number;
	currency: AssetCurrency;
	valuationDate: string;
	annualRate: number | null;
	memo: string | null;
	tags: string[];
	maturityDate: string | null;
	monthlyContribution: number | null;
	contributionEndDate: string | null;
};

export function toAssetGridRow(row: AssetRow): AssetGridRow {
	return {
		id: row.id,
		category: row.category,
		subcategory: row.subcategory,
		name: row.name,
		institution: row.institution ?? undefined,
		principalAmount: Number(row.principal_amount),
		currentValue: Number(row.current_value),
		currency: row.currency,
		valuationDate: row.valuation_date,
		annualRate: row.annual_rate === null ? undefined : Number(row.annual_rate),
		memo: row.memo ?? undefined,
		tags: row.tags ?? [],
		maturityDate: row.maturity_date ?? undefined,
		monthlyContribution:
			row.monthly_contribution === null ? undefined : Number(row.monthly_contribution),
		contributionEndDate: row.contribution_end_date ?? undefined
	};
}
