/**
 * Production AuditSink → mcp_audit_log (service_role).
 * Import via `$lib/server/repo` only (admin client stays under repo/**).
 */
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Json } from '$lib/types/database.types';
import type { AuditSink, McpAuditLogRow } from '$lib/server/mcp/types';

export function createRepoAuditSink(): AuditSink {
	return {
		async insert(row: McpAuditLogRow) {
			const db = createSupabaseAdminClient();
			const { error } = await db.from('mcp_audit_log').insert({
				owner_id: row.owner_id,
				actor_type: row.actor_type,
				bot_client_id: row.bot_client_id,
				user_id: row.user_id,
				tool: row.tool,
				request_id: row.request_id,
				args_digest: row.args_digest,
				args_preview: row.args_preview as NonNullable<Json>,
				result: row.result,
				error_code: row.error_code,
				rule_ids: row.rule_ids,
				warnings: row.warnings as unknown as NonNullable<Json>,
				affected_ids: row.affected_ids as unknown as NonNullable<Json>,
				duration_ms: row.duration_ms,
				ip: row.ip,
				user_agent: row.user_agent
			});
			if (error) throw error;
		}
	};
}
