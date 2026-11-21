/**
 * BE-11 / G-7 evidence chips for proposal cards.
 * Allowed keys: report_id, journal_entry_id, url, user_statement (correction).
 */

export type EvidenceChip =
	| { kind: 'report'; report_id: string }
	| { kind: 'journal'; journal_entry_id: string }
	| { kind: 'url'; url: string }
	| { kind: 'user_statement'; text: string };

export function evidenceChips(evidence: unknown): EvidenceChip[] {
	if (!Array.isArray(evidence)) return [];
	const out: EvidenceChip[] = [];
	for (const item of evidence) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
		const row = item as Record<string, unknown>;
		if (typeof row.report_id === 'string' && row.report_id) {
			out.push({ kind: 'report', report_id: row.report_id });
		} else if (typeof row.journal_entry_id === 'string' && row.journal_entry_id) {
			out.push({ kind: 'journal', journal_entry_id: row.journal_entry_id });
		} else if (typeof row.url === 'string' && row.url) {
			out.push({ kind: 'url', url: row.url });
		} else if (typeof row.user_statement === 'string' && row.user_statement) {
			out.push({ kind: 'user_statement', text: row.user_statement });
		}
	}
	return out;
}

/** Proposer display name: bot_clients.name or '나' for user (BE-11). */
export function proposerDisplayName(input: {
	proposed_by_type: string;
	botName?: string | null;
}): string {
	if (input.proposed_by_type === 'user') return '나';
	return input.botName?.trim() || '봇';
}
