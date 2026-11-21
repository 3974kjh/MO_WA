/**
 * Owner-scoped display IDs (PM 2026-11-21).
 * Mirrors DB `mowa_display_id(prefix, n)`: 4-digit zero-pad until 10000, then natural width.
 * Only `P-` (position_proposals) and `R-` (principle_proposals). No `PP-`, no global identity.
 */

export type DisplayIdPrefix = 'P' | 'R';

export function mowaDisplayId(prefix: DisplayIdPrefix, n: number): string {
	if (prefix !== 'P' && prefix !== 'R') {
		throw new Error('mowa_display_id: prefix must be P or R');
	}
	if (!Number.isInteger(n) || n < 1) {
		throw new Error('mowa_display_id: n must be a positive integer');
	}
	const body = n < 10_000 ? String(n).padStart(4, '0') : String(n);
	return `${prefix}-${body}`;
}

/**
 * True only for owner-scoped P-/R- display ids produced by mowaDisplayId.
 * Rejects `P-0000` and 5+ digit forms with a leading zero (`P-01234`).
 * Allows `P-0412` (4-digit pad) and `P-10000`.
 */
export function isOwnerScopedDisplayId(value: string): boolean {
	if (value.startsWith('PP-')) return false;
	const m = /^(P|R)-(\d+)$/.exec(value);
	if (!m) return false;
	const digits = m[2];
	if (digits.length === 4) {
		return digits !== '0000';
	}
	if (digits.length >= 5) {
		return digits[0] !== '0';
	}
	return false;
}
