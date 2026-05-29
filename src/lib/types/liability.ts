import type { Database } from './database.types';

export type LiabilityRow = Database['public']['Tables']['liabilities']['Row'];

export type LiabilityGridRow = {
	id: string;
	assetId: string | null;
	name: string;
	liabilityType: string;
	principalAmount: number;
	remainingAmount: number;
	interestRate: number | null;
	startedAt: string | null;
	dueAt: string | null;
	memo: string | null;
};

export type LiabilityFormValues = {
	assetId: string | null;
	name: string;
	liabilityType: string;
	principalAmount: number;
	remainingAmount: number;
	interestRate: number | null;
	startedAt: string | null;
	dueAt: string | null;
	memo: string | null;
};

export function toLiabilityGridRow(row: LiabilityRow): LiabilityGridRow {
	return {
		id: row.id,
		assetId: row.asset_id,
		name: row.name,
		liabilityType: row.liability_type,
		principalAmount: Number(row.principal_amount),
		remainingAmount: Number(row.remaining_amount),
		interestRate: row.interest_rate === null ? null : Number(row.interest_rate),
		startedAt: row.started_at,
		dueAt: row.due_at,
		memo: row.memo
	};
}
