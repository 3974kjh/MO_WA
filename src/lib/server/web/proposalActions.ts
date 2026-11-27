/**
 * Shared form-action handlers for portfolio approve/reject/hold/archive (BE-11)
 * and correct/ack (BE-19).
 */
import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	revalidateMergedForApprove,
	validateCorrectionInput,
	validateCorrectionReason,
	validateOverrides,
	type ProposalChangeType
} from '$lib/server/domain/proposals';
import {
	acknowledgePrincipleProposalRpc,
	acknowledgeProposalRpc,
	applyUserCorrectionRpc,
	approvePrincipleProposalRpc,
	approveProposalRpc,
	archiveRow,
	decidePrincipleProposalRpc,
	holdProposalRpc,
	rejectProposalRpc,
	restoreRow,
	forUser,
	type ArchivableTable,
	type PrincipleDecideAction
} from '$lib/server/repo';
import type { Database } from '$lib/types/database.types';
import {
	ACTION_CONFLICT_MESSAGE,
	failFromDbError,
	failValidation,
	isConflictDbError
} from './actionErrors';

/**
 * Parse form `overrides` for approve_proposal (H-2 / R-PERM-13).
 *
 * - Field omitted (`null` from FormData.get) → `{}` (no user edit intent).
 * - Any present value that is not a JSON object → 400 R-PERM-13.
 *   Rejects: empty string, File, broken JSON, arrays, numbers, booleans,
 *   JSON null / `"null"`, non-object strings. Never silently coerce to `{}`
 *   (that would approve the bot's proposed_values instead of the user's edits).
 * - `{}` and plain objects are allowed (further key checks in validateOverrides).
 */
export function parseOverrides(
	raw: FormDataEntryValue | null
):
	| { ok: true; overrides: Record<string, unknown> }
	| { ok: false; ruleId: 'R-PERM-13'; message: string } {
	// Omitted field only — empty string is a present-but-invalid value (H-2).
	if (raw == null) {
		return { ok: true, overrides: {} };
	}
	if (typeof raw !== 'string') {
		return {
			ok: false,
			ruleId: 'R-PERM-13',
			message: '[R-PERM-13] overrides must be a JSON object'
		};
	}
	if (raw === '') {
		return {
			ok: false,
			ruleId: 'R-PERM-13',
			message: '[R-PERM-13] overrides must be a JSON object'
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return {
			ok: false,
			ruleId: 'R-PERM-13',
			message: '[R-PERM-13] overrides must be a JSON object'
		};
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {
			ok: false,
			ruleId: 'R-PERM-13',
			message: '[R-PERM-13] overrides must be a JSON object'
		};
	}
	return { ok: true, overrides: parsed as Record<string, unknown> };
}

/** pending(만료 전)·on_hold 만 재검증 대상. 만료는 DB 시계가 최종이지만 이미 지난 건 여기서 RPC 로 넘긴다. */
function shouldRevalidate(meta: { status: string; expires_at: string | null }): boolean {
	if (meta.status === 'on_hold') return true;
	if (meta.status !== 'pending') return false;
	if (!meta.expires_at) return true;
	const t = Date.parse(meta.expires_at);
	return Number.isNaN(t) || t > Date.now();
}

async function loadProposalMeta(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	id: string
): Promise<{
	change_type: ProposalChangeType;
	proposed_by_type: 'bot' | 'user';
	asset_type: string | null;
	proposed_values: unknown;
	has_position: boolean;
	status: string;
	expires_at: string | null;
} | null> {
	const { data } = await supabase
		.from('position_proposals')
		.select(
			'change_type, proposed_by_type, instrument_id, position_id, proposed_values, status, expires_at'
		)
		.eq('id', id)
		.eq('owner_id', ownerId)
		.maybeSingle();
	if (!data) return null;
	let asset_type: string | null = null;
	if (data.instrument_id) {
		const { data: inst } = await supabase
			.from('instruments')
			.select('asset_type')
			.eq('id', data.instrument_id)
			.eq('owner_id', ownerId)
			.maybeSingle();
		asset_type = inst?.asset_type ?? null;
	}
	return {
		change_type: data.change_type as ProposalChangeType,
		proposed_by_type: data.proposed_by_type as 'bot' | 'user',
		asset_type,
		proposed_values: data.proposed_values,
		has_position: data.position_id != null,
		status: data.status,
		expires_at: data.expires_at
	};
}

/**
 * BE-17 Low-2: 동시 승인 교착(40P01)은 DB가 한쪽 트랜잭션을 통째로 되돌린 것이라(부분 반영 없음)
 * 같은 호출을 한 번만 다시 시도한다. 두 번째도 실패하면 그 오류를 그대로 돌려준다.
 */
export async function retryOnceOnDeadlock<T extends { error: unknown }>(
	call: () => PromiseLike<T>
): Promise<T> {
	const first = await call();
	if ((first.error as { code?: unknown } | null)?.code !== '40P01') return first;
	console.warn('[action] deadlock (40P01) — retrying once');
	return await call();
}

export async function handleApprove(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!id) return failValidation(400, 'R-PERM-13', 'proposal id is required');

	const noteRaw = form.get('note');
	const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
	// B1 L-5: 승인 note(=고친 이유)는 화면과 같이 한 줄·120자(R-VAL-P11). 비어 있으면 그대로 생략 가능.
	if (note !== null) {
		const checked = validateCorrectionReason(noteRaw as string);
		if (!checked.ok) return failValidation(400, checked.ruleId, checked.message);
	}
	const parsedOverrides = parseOverrides(form.get('overrides'));
	if (!parsedOverrides.ok) {
		return failValidation(400, parsedOverrides.ruleId, parsedOverrides.message);
	}

	const meta = await loadProposalMeta(supabase, ownerId, id);
	if (!meta) return fail(404, { ok: false as const, message: 'proposal not found', ruleIds: [] });

	const validated = validateOverrides({
		changeType: meta.change_type,
		proposedByType: meta.proposed_by_type,
		overrides: parsedOverrides.overrides,
		assetType: meta.asset_type as 'stock' | 'etf' | 'bond' | 'cash' | null
	});
	if (!validated.ok) {
		return failValidation(400, validated.ruleId, validated.message, { key: validated.key });
	}

	// 승인 시점 재검증: 고치지 않은 proposed_values 까지 합친 값을 propose 때와 같은 규칙으로 다시 본다(R-FMT-13 등).
	// 이미 읽은 행이 아직 처리 대기(pending·on_hold)이고 만료 전일 때만 본다. 만료·superseded·종결·버전 충돌은
	// RPC 가 먼저 가려야 하므로(L-2) 그대로 RPC 로 보낸다. RPC 도 같은 순서로 값을 다시 검사한다(G3).
	let merged: ReturnType<typeof revalidateMergedForApprove> = { ok: true, merged: {} };
	if (shouldRevalidate(meta)) {
		merged = revalidateMergedForApprove({
			changeType: meta.change_type,
			proposedByType: meta.proposed_by_type,
			proposedValues: meta.proposed_values,
			overrides: validated.overrides,
			assetType: meta.asset_type as 'stock' | 'etf' | 'bond' | 'cash' | null,
			hasPosition: meta.has_position
		});
	}
	if (!merged.ok) {
		return failValidation(400, merged.ruleId, merged.message, {
			key: merged.key,
			source: merged.source,
			asset: meta.asset_type,
			...(merged.missing ? { missing: true } : {})
		});
	}

	const repo = forUser(supabase, ownerId);
	const { data, error } = await retryOnceOnDeadlock(() =>
		approveProposalRpc(repo, {
			id,
			overrides: validated.overrides,
			note
		})
	);
	if (error) {
		const status = isConflictDbError(error) ? 409 : 400;
		return failFromDbError(status, error);
	}
	if (data?.status === 'conflict') {
		return fail(409, {
			ok: false as const,
			message: ACTION_CONFLICT_MESSAGE,
			ruleIds: ['R-PERM-13'],
			code: 'CONFLICT',
			status: 'conflict',
			proposal: data
		});
	}
	return { ok: true as const, proposal: data };
}

export async function handleReject(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!id) return failValidation(400, 'R-PERM-13', 'proposal id is required');
	const noteRaw = form.get('note');
	const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
	const repo = forUser(supabase, ownerId);
	const { data, error } = await rejectProposalRpc(repo, { id, note });
	if (error) return failFromDbError(400, error);
	return { ok: true as const, proposal: data };
}

export async function handleHold(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!id) return failValidation(400, 'R-PERM-13', 'proposal id is required');
	const holdRaw = String(form.get('hold') ?? 'true');
	const hold = holdRaw !== 'false' && holdRaw !== '0';
	const noteRaw = form.get('note');
	const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
	const repo = forUser(supabase, ownerId);
	const { data, error } = await holdProposalRpc(repo, { id, hold, note });
	if (error) return failFromDbError(400, error);
	return { ok: true as const, proposal: data };
}

export async function handleCorrect(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const positionId = String(form.get('position_id') ?? '').trim();
	if (!positionId) return failValidation(400, 'R-VAL-P11', 'position_id is required');

	const { data: pos } = await supabase
		.from('positions')
		.select('id, instrument_id, approval_version')
		.eq('id', positionId)
		.eq('owner_id', ownerId)
		.maybeSingle();
	if (!pos) return fail(404, { ok: false as const, message: 'position not found', ruleIds: [] });

	let assetType: string | null = null;
	if (pos.instrument_id) {
		const { data: inst } = await supabase
			.from('instruments')
			.select('asset_type')
			.eq('id', pos.instrument_id)
			.eq('owner_id', ownerId)
			.maybeSingle();
		assetType = inst?.asset_type ?? null;
	}

	const validated = validateCorrectionInput({
		qty: form.get('qty'),
		currency: form.get('currency'),
		avg_price: form.get('avg_price'),
		reason: form.get('reason'),
		client_ref: form.get('client_ref'),
		base_version: form.get('base_version'),
		assetType: assetType as 'stock' | 'etf' | 'bond' | 'cash' | null
	});
	if (!validated.ok) {
		return failValidation(400, validated.ruleId, validated.message);
	}

	const repo = forUser(supabase, ownerId);
	const { data, error } = await applyUserCorrectionRpc(repo, {
		positionId,
		qty: validated.qty,
		currency: validated.currency,
		avgPrice: validated.avg_price,
		reason: validated.reason,
		clientRef: validated.client_ref,
		baseVersion: validated.base_version
	});
	if (error) {
		return failFromDbError(isConflictDbError(error) ? 409 : 400, error);
	}
	return { ok: true as const, proposal: data };
}

export async function handleAck(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!id) return failValidation(400, 'R-PERM-13', 'proposal id is required');
	const kind = String(form.get('kind') ?? 'position');
	const repo = forUser(supabase, ownerId);
	const { data, error } =
		kind === 'principle'
			? await acknowledgePrincipleProposalRpc(repo, { id })
			: await acknowledgeProposalRpc(repo, { id });
	if (error) return failFromDbError(400, error);
	return { ok: true as const, proposal: data };
}

/** BE-17: approve_principle_proposal (user session). Optional final_body_md edits the new version. */
export async function handleApprovePrinciple(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!id) return failValidation(400, 'R-PERM-15', 'proposal id is required');
	const noteRaw = form.get('note');
	const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
	const bodyRaw = form.get('final_body_md');
	const finalBodyMd = typeof bodyRaw === 'string' && bodyRaw.trim() ? bodyRaw.trim() : null;
	const summaryRaw = form.get('summary');
	const summary = typeof summaryRaw === 'string' && summaryRaw.trim() ? summaryRaw.trim() : null;

	const repo = forUser(supabase, ownerId);
	const { data, error } = await retryOnceOnDeadlock(() =>
		approvePrincipleProposalRpc(repo, {
			id,
			finalBodyMd,
			summary,
			note
		})
	);
	if (error) {
		return failFromDbError(isConflictDbError(error) ? 409 : 400, error);
	}
	if (data?.status === 'conflict') {
		return fail(409, {
			ok: false as const,
			message: ACTION_CONFLICT_MESSAGE,
			ruleIds: ['R-PERM-13'],
			code: 'CONFLICT',
			status: 'conflict',
			proposal: data
		});
	}
	return { ok: true as const, proposal: data };
}

const PRINCIPLE_DECIDE_ACTIONS = new Set<PrincipleDecideAction>([
	'reject',
	'hold',
	'unhold',
	'cancel',
	'ack'
]);

/** BE-17: decide_principle_proposal (reject|hold|unhold|cancel|ack). No undo RPC. */
export async function handleDecidePrinciple(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!id) return failValidation(400, 'R-PERM-15', 'proposal id is required');
	const action = String(form.get('action') ?? '').trim() as PrincipleDecideAction;
	if (!PRINCIPLE_DECIDE_ACTIONS.has(action)) {
		return failValidation(400, 'R-PERM-13', 'action must be reject|hold|unhold|cancel|ack');
	}
	const noteRaw = form.get('note');
	const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
	const repo = forUser(supabase, ownerId);
	const { data, error } = await decidePrincipleProposalRpc(repo, { id, action, note });
	if (error) return failFromDbError(400, error);
	return { ok: true as const, proposal: data };
}

const ARCHIVE_TABLES = new Set<ArchivableTable>([
	'positions',
	'reports',
	'journal_entries',
	'instruments',
	'decisions',
	'events',
	're_complexes',
	're_subscriptions'
]);

export async function handleArchive(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	const table = String(form.get('table') ?? '').trim() as ArchivableTable;
	if (!id || !ARCHIVE_TABLES.has(table)) {
		return failValidation(400, 'R-SYS-03', 'archive requires id and table');
	}
	// Q-01: archive only — no permanent delete action.
	const repo = forUser(supabase, ownerId);
	const { error } = await archiveRow(repo, table, id);
	if (error) return failFromDbError(400, error);
	return { ok: true as const };
}

export async function handleRestore(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	const table = String(form.get('table') ?? '').trim() as ArchivableTable;
	if (!id || !ARCHIVE_TABLES.has(table)) {
		return failValidation(400, 'R-SYS-03', 'restore requires id and table');
	}
	const repo = forUser(supabase, ownerId);
	const { error } = await restoreRow(repo, table, id);
	if (error) return failFromDbError(400, error);
	return { ok: true as const };
}
