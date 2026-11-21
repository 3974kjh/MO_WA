/**
 * Owner-scoped display IDs (PM 2026-11-21): server string only.
 * `mowa_display_id` produces `P-0412` / `R-0001` (4-digit zero-pad; grows after 9999).
 * FE/repo must not invent `PP-` or global identity; treat `display_id` as opaque server string.
 */

const DISPLAY_ID_RE = /^(P|R)-(\d{4}|\d{5,})$/;

export type DisplayIdPrefix = 'P' | 'R';

/** Validate a server-issued display_id string. */
export function isOwnerDisplayId(value: unknown): value is string {
	return typeof value === 'string' && DISPLAY_ID_RE.test(value);
}

/**
 * Format like DB `mowa_display_id(prefix, n)` for tests / fixtures.
 * Production rows come from `display_sequences` + trigger — do not call to mint IDs client-side.
 */
export function formatOwnerDisplayId(prefix: DisplayIdPrefix, n: number): string {
	if (!Number.isInteger(n) || n < 1) {
		throw new Error('display_no must be a positive integer');
	}
	const body = n < 10000 ? String(n).padStart(4, '0') : String(n);
	return `${prefix}-${body}`;
}

export function parseOwnerDisplayId(
	value: string
): { prefix: DisplayIdPrefix; displayNo: number } | null {
	const m = DISPLAY_ID_RE.exec(value);
	if (!m) return null;
	return { prefix: m[1] as DisplayIdPrefix, displayNo: Number(m[2]) };
}
