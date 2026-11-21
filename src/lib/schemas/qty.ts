import { z } from 'zod';

export type AssetType = 'stock' | 'etf' | 'bond' | 'cash';

/** Cash qty: >0 and at most 2 decimal places (R-VAL-M03 / Q-31). */
export function hasAtMostTwoDecimals(value: number): boolean {
	if (!Number.isFinite(value)) return false;
	const scaled = value * 100;
	return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/** R-VAL-M03 — qty by asset_type (DB mowa_check_qty + zod). */
export function qtySchemaFor(assetType: AssetType) {
	if (assetType === 'stock' || assetType === 'etf') {
		return z
			.number()
			.positive()
			.refine((n) => Number.isInteger(n), { message: '[R-VAL-M03] stock/etf qty must be an integer' });
	}
	if (assetType === 'cash') {
		return z
			.number()
			.positive()
			.refine(hasAtMostTwoDecimals, {
				message: '[R-VAL-M03] cash qty allows at most 2 decimal places'
			});
	}
	// bond: face-value unit — positive number (v0.1 wording)
	return z.number().positive();
}

export function parseQty(assetType: AssetType, qty: unknown) {
	return qtySchemaFor(assetType).safeParse(qty);
}
