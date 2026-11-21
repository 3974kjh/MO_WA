/**
 * Shared form-action handlers for portfolio approve/reject/hold/archive (BE-11)
 * and correct/ack (BE-19).
 */
import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	validateCorrectionInput,
	validateOverrides,
	type ProposalChangeType
} from '$lib/server/domain/proposals';
import { mapDbErrorToRuleIds } from '$lib/server/domain/validation/mapDbError';
import {
	acknowledgePrincipleProposalRpc,
	acknowledgeProposalRpc,
	applyUserCorrectionRpc,
	approveProposalRpc,
	archiveRow,
	holdProposalRpc,
	rejectProposalRpc,
	restoreRow,
	forUser,
	type ArchivableTable
} from '$lib/server/repo';
import type { Database } from '$lib/types/database.types';
import { failFromDbError, failValidation, isConflictDbError } from './actionErrors';

function parseOverrides(raw: FormDataEntryValue | null): Record<string, unknown> {
	if (raw == null || raw === '') return {};
	if (typeof raw !== 'string') return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		/* fall through */
	}
	return {};
}

async function loadProposalMeta(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	id: string
): Promise<{
	change_type: ProposalChangeType;
	proposed_by_type: 'bot' | 'user';
	asset_type: string | null;
} | null> {
	const { data } = await supabase
		.from('position_proposals')
		.select('change_type, proposed_by_type, instrument_id')
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
		asset_type
	};
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
	const overrides = parseOverrides(form.get('overrides'));

	const meta = await loadProposalMeta(supabase, ownerId, id);
	if (!meta) return fail(404, { ok: false as const, message: 'proposal not found', ruleIds: [] });

	const validated = validateOverrides({
		changeType: meta.change_type,
		proposedByType: meta.proposed_by_type,
		overrides,
		assetType: meta.asset_type as 'stock' | 'etf' | 'bond' | 'cash' | null
	});
	if (!validated.ok) {
		return failValidation(400, validated.ruleId, validated.message, { key: validated.key });
	}

	const repo = forUser(supabase, ownerId);
	const { data, error } = await approveProposalRpc(repo, {
		id,
		overrides: validated.overrides,
		note
	});
	if (error) {
		const status = isConflictDbError(error) ? 409 : 400;
		return failFromDbError(status, error);
	}
	if (data?.status === 'conflict') {
		return fail(409, {
			ok: false as const,
			message: '승인 버전이 맞지 않습니다. 포지션이 변경되었습니다.',
			ruleIds: ['R-PERM-13'],
			code: 'conflict',
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
		const status = isConflictDbError(error) ? 409 : 400;
		const ruleIds = mapDbErrorToRuleIds(error);
		return fail(status, {
			ok: false as const,
			message: error.message,
			ruleIds,
			code: isConflictDbError(error) ? 'CONFLICT' : undefined
		});
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
