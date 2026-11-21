import { mapDbErrorToRuleIds, type DbErrorLike } from '$lib/server/domain/validation/mapDbError';
import { McpToolError } from '../errors';
import type { McpErrorCode, McpRuleIssue } from '../types';

/** Rules whose violation is an ownership/uniqueness clash, not a bad input value. */
const CONFLICT_RULE_IDS = new Set(['R-PERM-16', 'R-VAL-R11', 'R-PERM-11']);

function toDbErrorLike(err: unknown): DbErrorLike | null {
	if (!err || typeof err !== 'object') return null;
	const e = err as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === 'string' ? v : null);
	const message = str(e.message);
	if (message === null && str(e.code) === null) return null;
	return {
		message,
		code: str(e.code),
		details: str(e.details),
		hint: str(e.hint),
		constraint: str(e.constraint)
	};
}

/**
 * Convert a PostgREST/DB error into a client-visible McpToolError.
 * Returns null when the error is not recognizably a DB error (caller rethrows → INTERNAL).
 * Unmapped DB errors yield null so raw constraint text never reaches the bot.
 */
export function dbErrorToMcpToolError(err: unknown): McpToolError | null {
	const like = toDbErrorLike(err);
	if (!like) return null;

	const ruleIds = mapDbErrorToRuleIds(like).filter((id) => !id.startsWith('UNMAPPED'));
	if (ruleIds.length === 0) return null;

	const conflict = ruleIds.some((id) => CONFLICT_RULE_IDS.has(id));
	const code: McpErrorCode = conflict ? 'CONFLICT' : 'VALIDATION';

	const errors: McpRuleIssue[] = ruleIds.map((rule) => ({
		rule,
		message:
			code === 'CONFLICT'
				? `Conflict (${rule}): key is owned by another writer or already exists`
				: `Validation failed (${rule})`
	}));
	return new McpToolError(code, errors);
}

/** Throw the mapped McpToolError, or rethrow the original (→ INTERNAL, redacted). */
export function throwMappedDbError(err: unknown): never {
	throw dbErrorToMcpToolError(err) ?? err;
}

/** Convenience for `{ data, error }` repo results. */
export function unwrapDb<T>(result: { data: T; error: Error | null }): T {
	if (result.error) throwMappedDbError(result.error);
	return result.data;
}
