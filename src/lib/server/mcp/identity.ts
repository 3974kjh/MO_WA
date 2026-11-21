import type { McpContext } from './types';

/**
 * Client identity / proposer fields that must never be trusted (R-PERM-03).
 * Snake + camel; stripped recursively including nested objects and array items.
 */
export const IMPERSONATION_KEYS = [
	'owner_id',
	'ownerId',
	'user_id',
	'userId',
	'source_bot_id',
	'sourceBotId',
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

const IDENTITY_KEY_SET = new Set<string>(IMPERSONATION_KEYS);

export type SanitizeIdentityResult = {
	/** Args with all identity fields stripped (handlers use ctx only). */
	args: Record<string, unknown>;
	/**
	 * True when a sent identity value differed from ctx (design §5-6).
	 * Same-as-ctx values are stripped without logging R-PERM-03.
	 */
	identityMismatch: boolean;
	/** Rule ids when identityMismatch — `{R-PERM-03}`. */
	ruleIds: string[];
};

/**
 * PR #7 / position_proposals_prepare stamp for bot inserts.
 * Handlers must pick fields explicitly — do not spread client args into inserts.
 */
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

function expectedForKey(
	key: string,
	ctx: Pick<McpContext, 'ownerId' | 'botClientId'>
): unknown {
	switch (key) {
		case 'owner_id':
		case 'ownerId':
			return ctx.ownerId;
		case 'source_bot_id':
		case 'sourceBotId':
		case 'proposed_by':
		case 'proposedBy':
		case 'proposed_by_bot_id':
		case 'proposedByBotId':
			return ctx.botClientId;
		case 'proposed_by_type':
		case 'proposedByType':
		case 'proposer_type':
		case 'proposerType':
			return 'bot';
		case 'proposed_by_user':
		case 'proposedByUser':
		case 'proposed_by_user_id':
		case 'proposedByUserId':
		case 'user_id':
		case 'userId':
			return null;
		default:
			return undefined;
	}
}

function valuesDiffer(sent: unknown, expected: unknown): boolean {
	if (expected === null) {
		return sent !== null && sent !== undefined;
	}
	return sent !== expected;
}

/**
 * Strip identity fields recursively. Record R-PERM-03 only when a sent value
 * differs from authenticated ctx (same owner_id as ctx → strip only).
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
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(obj)) {
			if (IDENTITY_KEY_SET.has(key)) {
				const expected = expectedForKey(key, ctx);
				if (valuesDiffer(child, expected)) {
					identityMismatch = true;
				}
				continue; // strip — handlers read identity from ctx
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
