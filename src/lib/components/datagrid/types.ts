export type AssetCategory = 'real_estate' | 'investment' | 'cash' | 'liability';
export type AssetCurrency = 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';

export type DataGridColumn<T> = {
	id: keyof T & string;
	header: string;
	width?: string;
	align?: 'left' | 'center' | 'right';
	sortable?: boolean;
	format?: (value: T[keyof T], row: T) => string;
};

export type AssetGridRow = {
	id: string;
	category: AssetCategory;
	subcategory: string;
	name: string;
	institution?: string;
	principalAmount: number;
	currentValue: number;
	currency: AssetCurrency;
	valuationDate: string;
	annualRate?: number;
	memo?: string;
	tags?: string[];
	maturityDate?: string;
	monthlyContribution?: number;
	contributionEndDate?: string;
};
