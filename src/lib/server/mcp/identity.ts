import { DANGEROUS_KEYS, toSnakeLower } from './audit';
import type { McpContext } from './types';

/**
 * Canonical snake_lower identity keys (R-PERM-03).
 * Matching uses toSnakeLower so ownerId / owner-id / owner_id all hit.
 */
const IDENTITY_CANONICAL = new Set([
	'owner_id',
	'user_id',
	'source_bot_id',
	'bot_client_id',
	'created_by',
	'proposed_by',
	'proposed_by_type',
	'proposed_by_user',
	'proposed_by_user_id',
	'proposed_by_bot_id',
	'proposer_type'
]);

/** Public list of common aliases (docs / tests). Matching is via toSnakeLower. */
export const IMPERSONATION_KEYS = [
	'owner_id',
	'ownerId',
	'owner-id',
	'user_id',
	'userId',
	'source_bot_id',
	'sourceBotId',
	'bot_client_id',
	'botClientId',
	'created_by',
	'createdBy',
	'proposed_by',
	'proposedBy',
	'proposed_by_type',
	'proposedByType',
	'proposed_by_user',
	'proposedByUser',
	'proposed_by_user_id',
	'proposedByUserId',
	'proposed_by_bot_id',
	'proposedByBotId',
	'proposer_type',
	'proposerType'
] as const;

export type ImpersonationKey = (typeof IMPERSONATION_KEYS)[number];

export type SanitizeIdentityResult = {
	args: Record<string, unknown>;
	identityMismatch: boolean;
	ruleIds: string[];
};

export function botProposalIdentity(ctx: Pick<McpContext, 'botClientId'>): {
	proposed_by: string;
	proposed_by_type: 'bot';
	proposed_by_user: null;
} {
	return {
		proposed_by: ctx.botClientId,
		proposed_by_type: 'bot',
		proposed_by_user: null
	};
}

export function isIdentityKey(key: string): boolean {
	if (DANGEROUS_KEYS.has(key)) return false;
	return IDENTITY_CANONICAL.has(toSnakeLower(key));
}

function expectedForCanonical(
	canonical: string,
	ctx: Pick<McpContext, 'ownerId' | 'botClientId'>
): unknown {
	switch (canonical) {
		case 'owner_id':
			return ctx.ownerId;
		case 'source_bot_id':
		case 'bot_client_id':
		case 'proposed_by':
		case 'proposed_by_bot_id':
		case 'created_by':
			return ctx.botClientId;
		case 'proposed_by_type':
		case 'proposer_type':
			return 'bot';
		case 'proposed_by_user':
		case 'proposed_by_user_id':
		case 'user_id':
			return null;
		default:
			return undefined;
	}
}

/** UUID-aware compare (case-insensitive for strings). */
export function identityValuesDiffer(sent: unknown, expected: unknown): boolean {
	if (expected === null) {
		return sent !== null && sent !== undefined;
	}
	if (typeof sent === 'string' && typeof expected === 'string') {
		return sent.toLowerCase() !== expected.toLowerCase();
	}
	return sent !== expected;
}

/**
 * Strip identity fields recursively. R-PERM-03 only when a sent value differs from ctx.
 */
export function sanitizeIdentityFields(
	args: Record<string, unknown>,
	ctx: Pick<McpContext, 'ownerId' | 'botClientId'>
): SanitizeIdentityResult {
	let identityMismatch = false;

	const walk = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value.map((item) => walk(item));
		}
		if (typeof value !== 'object' || value === null) {
			return value;
		}
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = Object.create(null);
		for (const [key, child] of Object.entries(obj)) {
			if (DANGEROUS_KEYS.has(key)) continue;
			if (isIdentityKey(key)) {
				const canonical = toSnakeLower(key);
				const expected = expectedForCanonical(canonical, ctx);
				if (identityValuesDiffer(child, expected)) {
					identityMismatch = true;
				}
				continue;
			}
			out[key] = walk(child);
		}
		return out;
	};

	const stripped = walk(args) as Record<string, unknown>;
	return {
		args: stripped,
		identityMismatch,
		ruleIds: identityMismatch ? ['R-PERM-03'] : []
	};
}
