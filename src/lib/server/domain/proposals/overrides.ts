/**
 * BE-11 approval override allowlist (matches approve_proposal SQL).
 * Direct-write fields → R-VAL-P07 ERROR. Qty → R-VAL-M03.
 * D-4: USD unit prices keep up to 4 decimals — never round on write.
 */
import { parseQty, type AssetType } from '$lib/schemas/qty';
import type { PositionProposalRow } from '$lib/types/mowa.contract';

/** 계약 타입에서 파생(손복사 금지) — view.ts PositionChangeType과 같은 출처. */
export type ProposalChangeType = PositionProposalRow['change_type'];
export type ProposedByType = PositionProposalRow['proposed_by_type'];

/** Fields bots/users may never override (direct-write via update_position_reference). */
export const DIRECT_WRITE_OVERRIDE_KEYS = [
	'trigger_price',
	'trigger_direction',
	'breakeven',
	'watch_only'
] as const;

export type OverrideKey = 'qty' | 'avg_price' | 'currency';

export function allowedOverrideKeys(
	changeType: ProposalChangeType,
	proposedByType: ProposedByType = 'bot'
): readonly OverrideKey[] {
	switch (changeType) {
		case 'open_holding':
			return ['qty', 'avg_price', 'currency'];
		case 'set_qty_avg':
			return proposedByType === 'user' ? ['qty', 'avg_price', 'currency'] : ['qty', 'avg_price'];
		case 'close':
			return [];
		default:
			return [];
	}
}

export type OverrideValidationOk = {
	ok: true;
	overrides: Record<string, unknown>;
};

export type OverrideValidationErr = {
	ok: false;
	ruleId: 'R-VAL-P07' | 'R-PERM-13' | 'R-VAL-M03' | 'R-VAL-M02' | 'R-FMT-13';
	message: string;
	key?: string;
};

/**
 * Validate p_overrides before calling approve_proposal.
 * Unknown / direct-write keys → ERROR. Qty checked with R-VAL-M03 when asset_type given.
 */
export function validateOverrides(input: {
	changeType: ProposalChangeType;
	proposedByType?: ProposedByType;
	overrides: Record<string, unknown> | null | undefined;
	assetType?: AssetType | null;
}): OverrideValidationOk | OverrideValidationErr {
	const raw = input.overrides ?? {};
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, ruleId: 'R-PERM-13', message: '[R-PERM-13] overrides must be an object' };
	}

	const allowed = new Set(allowedOverrideKeys(input.changeType, input.proposedByType ?? 'bot'));
	const out: Record<string, unknown> = Object.create(null);

	for (const [key, value] of Object.entries(raw)) {
		if ((DIRECT_WRITE_OVERRIDE_KEYS as readonly string[]).includes(key)) {
			return {
				ok: false,
				ruleId: 'R-VAL-P07',
				key,
				message: `[R-VAL-P07] ${key} is a direct-write field and cannot be overridden`
			};
		}
		if (!allowed.has(key as OverrideKey)) {
			return {
				ok: false,
				ruleId: 'R-PERM-13',
				key,
				message: `[R-PERM-13] override field ${key} not allowed`
			};
		}

		if (key === 'qty') {
			const qty = typeof value === 'number' ? value : Number(value);
			if (!Number.isFinite(qty)) {
				return {
					ok: false,
					ruleId: 'R-VAL-M03',
					key: 'qty',
					message: '[R-VAL-M03] qty must be a finite number'
				};
			}
			if (input.assetType) {
				const parsed = parseQty(input.assetType, qty, 'holding');
				if (!parsed.success) {
					return { ok: false, ruleId: 'R-VAL-M03', key: 'qty', message: parsed.message };
				}
			}
			out.qty = qty;
			continue;
		}

		if (key === 'avg_price') {
			const price = typeof value === 'number' ? value : Number(value);
			if (!Number.isFinite(price) || !(price > 0)) {
				return {
					ok: false,
					ruleId: 'R-VAL-M02',
					key: 'avg_price',
					message: '[R-VAL-M02] avg_price must be > 0'
				};
			}
			// D-4 / R-FMT-13: keep up to 4 decimals; do not round to 2 on write.
			if (!hasAtMostNDecimals(price, 4)) {
				return {
					ok: false,
					ruleId: 'R-FMT-13',
					key: 'avg_price',
					message: '[R-FMT-13] USD/KRW unit prices keep at most 4 decimals on write'
				};
			}
			out.avg_price = price;
			continue;
		}

		if (key === 'currency') {
			if (value !== 'KRW' && value !== 'USD') {
				return {
					ok: false,
					ruleId: 'R-VAL-M02',
					key: 'currency',
					message: '[R-VAL-M02] currency must be KRW or USD'
				};
			}
			out.currency = value;
			continue;
		}
	}

	return { ok: true, overrides: out };
}

/** Merge overrides into proposed_values (same as approve_proposal SQL). */
export function mergeAppliedValues(
	proposedValues: Record<string, unknown>,
	overrides: Record<string, unknown>
): Record<string, unknown> {
	return { ...proposedValues, ...overrides };
}

/** FE "approved (edited)" compares applied_values with proposed_values. */
export function isApprovedEdited(
	proposedValues: Record<string, unknown> | null | undefined,
	appliedValues: Record<string, unknown> | null | undefined
): boolean {
	if (!appliedValues || !proposedValues) return false;
	return JSON.stringify(appliedValues) !== JSON.stringify(proposedValues);
}

function hasAtMostNDecimals(value: number, n: number): boolean {
	if (!Number.isFinite(value)) return false;
	const scaled = value * 10 ** n;
	return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/** Reject remaining-days style fields if a caller tries to invent them (BE-11). */
export function assertNoRemainingDaysField(payload: Record<string, unknown>): void {
	for (const key of Object.keys(payload)) {
		if (/remaining|days_left|d_day|dday/i.test(key)) {
			throw new Error(`[BE-11] remaining-days field "${key}" must not be exposed`);
		}
	}
}
