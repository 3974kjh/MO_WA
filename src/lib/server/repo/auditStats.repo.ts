/**
 * BE-11 settings: audit log rule_ids counts.
 */
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

export async function countAuditRuleIds(
	repo: RepoClient
): Promise<{ data: Record<string, number>; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'mcp_audit_log').select('rule_ids');
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: {}, error: error as Error };

	const counts: Record<string, number> = Object.create(null);
	for (const row of (data ?? []) as Array<{ rule_ids: string[] | null }>) {
		for (const id of row.rule_ids ?? []) {
			if (!id) continue;
			counts[id] = (counts[id] ?? 0) + 1;
		}
	}
	return { data: counts, error: null };
}
