/**
 * BE-11 settings: audit log rule_ids counts.
 *
 * PostgREST는 한 응답을 max_rows(1000행)로 조용히 자른다. 한 번에 읽으면 1000행 넘는 감사 기록의
 * 규칙 건수가 적게 나오므로, 규칙 ID가 있는 행만 id 순으로 페이지(1000행)씩 읽는다.
 * 요청 수를 묶기 위해 AUDIT_RULE_COUNT_MAX_PAGES 페이지까지만 읽고, 더 있으면 truncated=true.
 */
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

/** PostgREST max_rows와 같은 페이지 크기. */
export const AUDIT_RULE_COUNT_PAGE = 1000;
/** 최대 페이지 수(= 최대 20,000행). */
export const AUDIT_RULE_COUNT_MAX_PAGES = 20;

export async function countAuditRuleIds(
	repo: RepoClient
): Promise<{ data: Record<string, number>; error: Error | null; truncated: boolean }> {
	const ownerId = requireOwnerId(repo);
	const counts: Record<string, number> = Object.create(null);

	for (let page = 0; page < AUDIT_RULE_COUNT_MAX_PAGES; page++) {
		const from = page * AUDIT_RULE_COUNT_PAGE;
		// 빈 배열·null 행은 건너뛴다(neq '{}'는 null도 제외).
		let q = fromRepo(repo, 'mcp_audit_log').select('id, rule_ids').neq('rule_ids', '{}');
		q = withOwnerFilter(q, ownerId);
		const { data, error } = await q
			.order('id', { ascending: true })
			.range(from, from + AUDIT_RULE_COUNT_PAGE - 1);
		if (error) return { data: {}, error: error as Error, truncated: false };

		const rows = (data ?? []) as Array<{ rule_ids: string[] | null }>;
		for (const row of rows) {
			for (const id of row.rule_ids ?? []) {
				if (!id) continue;
				counts[id] = (counts[id] ?? 0) + 1;
			}
		}
		if (rows.length < AUDIT_RULE_COUNT_PAGE) return { data: counts, error: null, truncated: false };
	}
	return { data: counts, error: null, truncated: true };
}
