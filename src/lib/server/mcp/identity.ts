import type { McpContext } from './types';

/**
 * Client fields that must never be trusted (R-PERM-03).
 * Server overwrites with authenticated context values.
 */
export const IMPERSONATION_KEYS = [
	'owner_id',
	'source_bot_id',
	'proposed_by',
	'proposed_by_type',
	'proposed_by_user',
	'proposed_by_user_id',
	'proposed_by_bot_id',
	'proposer_type'
] as const;

export type ImpersonationKey = (typeof IMPERSONATION_KEYS)[number];

export type SanitizeIdentityResult = {
	/** Args with impersonation fields overwritten by server values. */
	args: Record<string, unknown>;
	/** True when the client attempted to set any impersonation field. */
	impersonationAttempted: boolean;
	/** Rule ids to attach to the audit row when an attempt was rewritten. */
	ruleIds: string[];
};

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Overwrite identity / proposer fields with server context (R-PERM-03).
 * Client-supplied values are discarded; attempt is recorded via ruleIds.
 */
export function sanitizeIdentityFields(
	args: Record<string, unknown>,
	ctx: Pick<McpContext, 'ownerId' | 'botClientId'>
): SanitizeIdentityResult {
	const out: Record<string, unknown> = { ...args };
	let impersonationAttempted = false;

	for (const key of IMPERSONATION_KEYS) {
		if (hasOwn(args, key)) {
			impersonationAttempted = true;
		}
	}

	// Always stamp server identity on write-shaped payloads when any stamp key was present
	// or when callers pass through a full args object that may carry them later.
	if (impersonationAttempted || hasOwn(args, 'owner_id') || hasOwn(args, 'source_bot_id')) {
		out.owner_id = ctx.ownerId;
		out.source_bot_id = ctx.botClientId;
	}

	if (impersonationAttempted) {
		// Proposer claims from bot keys are ignored; server stamps bot identity (R-VAL-P11 / R-PERM-03).
		if (
			hasOwn(args, 'proposed_by') ||
			hasOwn(args, 'proposed_by_type') ||
			hasOwn(args, 'proposed_by_user') ||
			hasOwn(args, 'proposed_by_user_id') ||
			hasOwn(args, 'proposed_by_bot_id') ||
			hasOwn(args, 'proposer_type')
		) {
			out.proposed_by_type = 'bot';
			out.proposer_type = 'bot';
			out.proposed_by_bot_id = ctx.botClientId;
			delete out.proposed_by;
			delete out.proposed_by_user;
			delete out.proposed_by_user_id;
		}
	}

	return {
		args: out,
		impersonationAttempted,
		ruleIds: impersonationAttempted ? ['R-PERM-03'] : []
	};
}
