/**
 * BE-11 / BE-19 authenticated RPCs via user-session RepoClient.
 * Audit rows are written inside the SQL functions (actor_type=user).
 */
import type { Json } from '$lib/types/database.types';
import type { RepoClient } from './client';
import { rpcFromRepo } from './db';

export type ProposalRpcRow = {
	id: string;
	status: string;
	display_id: string | null;
	base_version: number | null;
	applied_values: Json | null;
	proposed_values: Json;
	change_type: string;
	attention_started_at: string | null;
	acknowledged_at: string | null;
	[key: string]: unknown;
};

type RpcResult = { data: ProposalRpcRow | null; error: Error | null };

function mapRpc(result: {
	data: unknown;
	error: { message: string; code?: string; details?: string } | null;
}): RpcResult {
	if (result.error) {
		const err = new Error(result.error.message) as Error & {
			code?: string;
			details?: string;
		};
		err.code = result.error.code;
		err.details = result.error.details;
		return { data: null, error: err };
	}
	return { data: (result.data as ProposalRpcRow | null) ?? null, error: null };
}

export async function approveProposalRpc(
	repo: RepoClient,
	args: { id: string; overrides?: Record<string, unknown>; note?: string | null }
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] approve requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'approve_proposal', {
		p_id: args.id,
		p_overrides: (args.overrides ?? {}) as Json,
		p_note: args.note ?? null
	});
	return mapRpc(result);
}

export async function rejectProposalRpc(
	repo: RepoClient,
	args: { id: string; note?: string | null }
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] reject requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'reject_proposal', {
		p_id: args.id,
		p_note: args.note ?? null
	});
	return mapRpc(result);
}

export async function holdProposalRpc(
	repo: RepoClient,
	args: { id: string; hold?: boolean; note?: string | null }
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] hold requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'hold_proposal', {
		p_id: args.id,
		p_hold: args.hold ?? true,
		p_note: args.note ?? null
	});
	return mapRpc(result);
}

/** BE-19: acknowledge_proposal — status unchanged; leaves '확인 필요' group. */
export async function acknowledgeProposalRpc(
	repo: RepoClient,
	args: { id: string }
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] acknowledge requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'acknowledge_proposal', { p_id: args.id });
	return mapRpc(result);
}

/** BE-17: approve_principle_proposal — user session only; bots rejected in SQL + here. */
export async function approvePrincipleProposalRpc(
	repo: RepoClient,
	args: { id: string; finalBodyMd?: string | null; summary?: string | null; note?: string | null }
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] approve requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'approve_principle_proposal', {
		p_id: args.id,
		p_final_body_md: args.finalBodyMd ?? null,
		p_summary: args.summary ?? null,
		p_note: args.note ?? null
	});
	return mapRpc(result);
}

export type PrincipleDecideAction = 'reject' | 'hold' | 'unhold' | 'cancel' | 'ack';

/** BE-17: decide_principle_proposal — user session only (reject|hold|unhold|cancel|ack). */
export async function decidePrincipleProposalRpc(
	repo: RepoClient,
	args: { id: string; action: PrincipleDecideAction; note?: string | null }
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] decide requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'decide_principle_proposal', {
		p_id: args.id,
		p_action: args.action,
		p_note: args.note ?? null
	});
	return mapRpc(result);
}

/** BE-19: decide_principle_proposal('ack'). */
export async function acknowledgePrincipleProposalRpc(
	repo: RepoClient,
	args: { id: string }
): Promise<RpcResult> {
	return decidePrincipleProposalRpc(repo, { id: args.id, action: 'ack' });
}

/** BE-19: apply_user_correction — create+approve+apply+audit in one TX (R-VAL-P11). */
export async function applyUserCorrectionRpc(
	repo: RepoClient,
	args: {
		positionId: string;
		qty: number;
		currency: string;
		avgPrice: number;
		reason: string;
		clientRef?: string | null;
		baseVersion?: number | null;
	}
): Promise<RpcResult> {
	if (repo.actor.kind !== 'user') {
		return {
			data: null,
			error: new Error('[R-VAL-P11] user corrections require a web session')
		};
	}
	const result = await rpcFromRepo(repo, 'apply_user_correction', {
		p_position_id: args.positionId,
		p_qty: args.qty,
		p_currency: args.currency,
		p_avg_price: args.avgPrice,
		p_reason: args.reason,
		p_client_ref: args.clientRef ?? null,
		p_base_version: args.baseVersion ?? null
	});
	return mapRpc(result);
}
