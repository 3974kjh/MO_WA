import type { AssetCategory, AssetCurrency } from './types';

export const categoryLabels: Record<AssetCategory, string> = {
	real_estate: '부동산',
	investment: '투자',
	cash: '현금성',
	liability: '부채'
};

export function formatCurrency(value: number, currency: AssetCurrency = 'KRW') {
	return new Intl.NumberFormat('ko-KR', {
		style: 'currency',
		currency,
		maximumFractionDigits: currency === 'KRW' ? 0 : 2
	}).format(value);
}

export function formatPercent(value?: number) {
	if (value === undefined) return '-';
	return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatDate(value: string) {
	return new Intl.DateTimeFormat('ko-KR', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(value));
}
