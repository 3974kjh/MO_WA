/**
 * BE-19 '확인 필요' group window (R-PERM-13 v0.5).
 *
 * Group = status in (conflict, expired)
 *       AND acknowledged_at is null
 *       AND attention_started_at > now() - 14 days
 *
 * Computing the 14 days from decided_at or expires_at is a DEFECT.
 */
export const ATTENTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type AttentionLike = {
	status: string;
	acknowledged_at?: string | null;
	attention_started_at?: string | null;
	/** Must NEVER be used for the 14-day window. */
	decided_at?: string | null;
	/** Must NEVER be used for the 14-day window. */
	expires_at?: string | null;
};

export function isInAttentionGroup(row: AttentionLike, now: Date = new Date()): boolean {
	if (row.status !== 'conflict' && row.status !== 'expired') return false;
	if (row.acknowledged_at != null) return false;
	if (row.attention_started_at == null) return false;
	const started = Date.parse(row.attention_started_at);
	if (!Number.isFinite(started)) return false;
	return started > now.getTime() - ATTENTION_WINDOW_MS;
}

/**
 * Filter to '확인 필요' items. Intentionally ignores decided_at / expires_at
 * even if present on the row (R-PERM-13).
 */
export function filterAttentionNeeded<T extends AttentionLike>(
	rows: readonly T[],
	now: Date = new Date()
): T[] {
	return rows.filter((r) => isInAttentionGroup(r, now));
}

/** SQL-shaped filter params for PostgREST (attention_started_at only). */
export function attentionNeededFilter(now: Date = new Date()): {
	statuses: readonly ['conflict', 'expired'];
	acknowledgedAtIs: null;
	attentionStartedAfter: string;
} {
	const cutoff = new Date(now.getTime() - ATTENTION_WINDOW_MS);
	return {
		statuses: ['conflict', 'expired'],
		acknowledgedAtIs: null,
		attentionStartedAfter: cutoff.toISOString()
	};
}
