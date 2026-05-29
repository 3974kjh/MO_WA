import type { Database } from './database.types';

export type CashflowRow = Database['public']['Tables']['cashflow_items']['Row'];
export type CashflowDirection = CashflowRow['direction'];
export type CashflowCadence = CashflowRow['cadence'];

export type CashflowFormValues = {
	name: string;
	direction: CashflowDirection;
	cadence: CashflowCadence;
	amount: number;
	category: string | null;
	startDate: string | null;
	endDate: string | null;
	memo: string | null;
};

export type CashflowGridItem = {
	id: string;
	name: string;
	direction: CashflowDirection;
	cadence: CashflowCadence;
	amount: number;
	category: string | null;
	startDate: string | null;
	endDate: string | null;
	memo: string | null;
};

export function toCashflowGridItem(row: CashflowRow): CashflowGridItem {
	return {
		id: row.id,
		name: row.name,
		direction: row.direction,
		cadence: row.cadence,
		amount: Number(row.amount),
		category: row.category,
		startDate: row.start_date,
		endDate: row.end_date,
		memo: row.memo
	};
}
