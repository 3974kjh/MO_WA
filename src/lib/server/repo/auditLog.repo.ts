/**
 * FE-09 활동 기록 목록(읽기 전용). 사용자 세션 RLS 클라이언트 + owner 필터, 명시 열, limit+1로 잘림 판별.
 */
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

export const AUDIT_LIST_LIMIT = 100;

/** select('*') 금지: 화면이 쓰는 열만(ip·user_agent·warnings는 읽지 않는다). */
export const AUDIT_LIST_COLUMNS =
	'id, created_at, actor_type, bot_client_id, tool, result, error_code, rule_ids, args_preview, duration_ms' as const;

export type AuditLogListRow = {
	id: number;
	created_at: string;
	actor_type: string;
	bot_client_id: string | null;
	tool: string;
	result: string;
	error_code: string | null;
	rule_ids: string[];
	args_preview: unknown;
	duration_ms: number | null;
};

export type AuditLogFilter = {
	bot?: string;
	tool?: string;
	result?: string;
	warn?: boolean;
	rule?: string;
};

export async function listAuditLog(
	repo: RepoClient,
	filter: AuditLogFilter = {},
	limit: number = AUDIT_LIST_LIMIT
): Promise<{ data: AuditLogListRow[]; truncated: boolean; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'mcp_audit_log').select(AUDIT_LIST_COLUMNS);
	q = withOwnerFilter(q, ownerId);
	if (filter.bot) q = q.eq('bot_client_id', filter.bot);
	if (filter.tool) q = q.eq('tool', filter.tool);
	if (filter.result) q = q.eq('result', filter.result);
	if (filter.warn) q = q.neq('rule_ids', '{}');
	if (filter.rule) q = q.contains('rule_ids', [filter.rule]);
	const { data, error } = await q
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(limit + 1);
	if (error) return { data: [], truncated: false, error: error as Error };
	const rows = (data ?? []) as AuditLogListRow[];
	return { data: rows.slice(0, limit), truncated: rows.length > limit, error: null };
}
