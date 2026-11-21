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

/** True only for owner-scoped P-/R- display ids produced by mowaDisplayId. */
export function isOwnerScopedDisplayId(value: string): boolean {
	return /^(P|R)-(\d{4}|\d{5,})$/.test(value) && !value.startsWith('PP-');
}
