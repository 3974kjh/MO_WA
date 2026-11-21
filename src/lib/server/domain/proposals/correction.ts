/**
 * BE-19 user correction reason (R-VAL-P11).
 * One line, 1–120 chars. 121+ ERROR. Newline ERROR.
 * Distinct from calc_note ≤200.
 */
import { charLength } from '$lib/schemas/charLength';
import { parseQty, type AssetType } from '$lib/schemas/qty';

export const CORRECTION_REASON_MAX = 120;

export type CorrectionReasonOk = { ok: true; reason: string };
export type CorrectionReasonErr = {
	ok: false;
	ruleId: 'R-VAL-P11';
	message: string;
};

export function validateCorrectionReason(
	raw: string | null | undefined
): CorrectionReasonOk | CorrectionReasonErr {
	if (raw == null) {
		return {
			ok: false,
			ruleId: 'R-VAL-P11',
			message: '[R-VAL-P11] reason must be one line, 1-120 chars'
		};
	}
	if (/[\r\n]/.test(raw)) {
		return {
			ok: false,
			ruleId: 'R-VAL-P11',
			message: '[R-VAL-P11] reason must be one line, 1-120 chars'
		};
	}
	const trimmed = raw.trim();
	const len = charLength(trimmed);
	if (len < 1 || len > CORRECTION_REASON_MAX) {
		return {
			ok: false,
			ruleId: 'R-VAL-P11',
			message: '[R-VAL-P11] reason must be one line, 1-120 chars'
		};
	}
	return { ok: true, reason: trimmed };
}

export type CorrectionInputOk = {
	ok: true;
	qty: number;
	currency: 'KRW' | 'USD';
	avg_price: number;
	reason: string;
	client_ref: string | null;
	base_version: number | null;
};

export type CorrectionInputErr = {
	ok: false;
	ruleId: string;
	message: string;
};

/**
 * Validate apply_user_correction args before RPC.
 * D-4: keep avg_price up to 4 decimals (no write-side rounding to 2).
 */
export function validateCorrectionInput(input: {
	qty: unknown;
	currency: unknown;
	avg_price: unknown;
	reason: unknown;
	client_ref?: unknown;
	base_version?: unknown;
	assetType?: AssetType | null;
}): CorrectionInputOk | CorrectionInputErr {
	const reason = validateCorrectionReason(typeof input.reason === 'string' ? input.reason : null);
	if (!reason.ok) return reason;

	const qty = typeof input.qty === 'number' ? input.qty : Number(input.qty);
	if (!Number.isFinite(qty) || !(qty > 0)) {
		return {
			ok: false,
			ruleId: 'R-VAL-M02',
			message: '[R-VAL-M02] qty, avg_price (>0) and currency are required'
		};
	}
	if (input.assetType) {
		const parsed = parseQty(input.assetType, qty, 'holding');
		if (!parsed.success) {
			return { ok: false, ruleId: 'R-VAL-M03', message: parsed.message };
		}
	}

	const avg = typeof input.avg_price === 'number' ? input.avg_price : Number(input.avg_price);
	if (!Number.isFinite(avg) || !(avg > 0)) {
		return {
			ok: false,
			ruleId: 'R-VAL-M02',
			message: '[R-VAL-M02] qty, avg_price (>0) and currency are required'
		};
	}

	if (input.currency !== 'KRW' && input.currency !== 'USD') {
		return {
			ok: false,
			ruleId: 'R-VAL-M02',
			message: '[R-VAL-M02] qty, avg_price (>0) and currency are required'
		};
	}

	let base_version: number | null = null;
	if (input.base_version != null && input.base_version !== '') {
		const bv =
			typeof input.base_version === 'number' ? input.base_version : Number(input.base_version);
		if (!Number.isInteger(bv)) {
			return {
				ok: false,
				ruleId: 'R-PERM-13',
				message: '[R-PERM-13] base_version must be an integer'
			};
		}
		base_version = bv;
	}

	const client_ref =
		typeof input.client_ref === 'string' && input.client_ref.trim()
			? input.client_ref.trim()
			: null;

	return {
		ok: true,
		qty,
		currency: input.currency,
		avg_price: avg,
		reason: reason.reason,
		client_ref,
		base_version
	};
}
