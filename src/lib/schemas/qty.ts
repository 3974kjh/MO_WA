import { z } from 'zod';

export type AssetType = 'stock' | 'etf' | 'bond' | 'cash';
export type PositionStatus = 'holding' | 'planned' | 'closed';

/** Cash qty: >0 and at most 2 decimal places (R-VAL-M03 / Q-31). */
export function hasAtMostTwoDecimals(value: number): boolean {
	if (!Number.isFinite(value)) return false;
	const scaled = value * 100;
	return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/**
 * R-VAL-M03 — qty by asset_type (DB `mowa_check_qty` + zod).
 *
 * L1: planned rows may omit qty (null); closed may be 0 — do not false-positive with
 * `positive()`. Cash must be >0 with ≤2 decimals when present. Stock/etf disallow
 * fractional qty. Bond matches DB (mowa_check_qty performs no bond-specific check).
 */
export function parseQty(
	assetType: AssetType,
	qty: number | null | undefined,
	status?: PositionStatus
): { success: true; data: number | null } | { success: false; message: string } {
	if (qty == null) {
		if (status === 'planned' || status === undefined) {
			return { success: true, data: null };
		}
		return { success: false, message: '[R-VAL-M03] qty is required' };
	}
	if (!Number.isFinite(qty)) {
		return { success: false, message: '[R-VAL-M03] qty must be a finite number' };
	}
	if (qty < 0) {
		return { success: false, message: '[R-VAL-M03] qty must be >= 0' };
	}
	if (status === 'closed' && qty === 0) {
		return { success: true, data: 0 };
	}
	if (status === 'planned' && qty === 0) {
		return { success: true, data: 0 };
	}

	if (assetType === 'stock' || assetType === 'etf') {
		if (qty === 0 && status !== 'holding') return { success: true, data: 0 };
		if (qty <= 0) {
			return { success: false, message: '[R-VAL-M03] stock/etf qty must be > 0 when set' };
		}
		if (!Number.isInteger(qty)) {
			return {
				success: false,
				message: `[R-VAL-M03] fractional qty not allowed for ${assetType}`
			};
		}
		return { success: true, data: qty };
	}

	if (assetType === 'cash') {
		if (!(qty > 0)) {
			return { success: false, message: '[R-VAL-M03] cash qty must be > 0' };
		}
		if (!hasAtMostTwoDecimals(qty)) {
			return {
				success: false,
				message: '[R-VAL-M03] cash qty allows at most 2 decimal places'
			};
		}
		return { success: true, data: qty };
	}

	// bond: DB mowa_check_qty has no extra rule (face-value unit, v0.1)
	return { success: true, data: qty };
}

/** Zod helper for cash/stock create paths that always send a number. */
export function qtySchemaFor(assetType: AssetType) {
	return z.number().superRefine((n, ctx) => {
		const parsed = parseQty(assetType, n, 'holding');
		if (!parsed.success) {
			ctx.addIssue({ code: 'custom', message: parsed.message });
		}
	});
}
