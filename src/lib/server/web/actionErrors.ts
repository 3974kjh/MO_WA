import { fail } from '@sveltejs/kit';
import { mapDbErrorToRuleIds, UNMAPPED_MARKER } from '$lib/server/domain/validation/mapDbError';

/** DB 오류 원문 대신 내보내는 일반 문구(원문은 서버 로그). */
export const ACTION_FAILED_MESSAGE = '요청을 처리하지 못했어요.';

/** 용어집 v1.3 conflict 라벨(StatusBadge)과 같은 문구. */
export const ACTION_CONFLICT_MESSAGE = '반영 안 됨(기록 달라짐)';

export type ActionErrorBody = {
	ok: false;
	message: string;
	ruleIds: string[];
	code?: string;
	status?: string;
};

export function failFromDbError(
	httpStatus: number,
	err: {
		message?: string | null;
		code?: string | null;
		details?: string | null;
		hint?: string | null;
		constraint?: string | null;
	},
	extra: Partial<ActionErrorBody> = {}
) {
	const all = mapDbErrorToRuleIds(err);
	// 클라이언트에는 매핑된 규칙 ID만. 매핑 안 된 오류는 'UNMAPPED'만(pgcode·constraint는 서버 로그).
	const mapped = all.filter((id) => !id.startsWith(UNMAPPED_MARKER));
	const ruleIds = mapped.length > 0 ? mapped : [UNMAPPED_MARKER];
	const conflict = isConflictDbError(err);
	console.error('[action] db error', {
		code: err.code ?? undefined,
		message: err.message ?? undefined,
		constraint: err.constraint ?? undefined,
		ruleIds: all
	});
	return fail(httpStatus, {
		ok: false as const,
		message: conflict ? ACTION_CONFLICT_MESSAGE : ACTION_FAILED_MESSAGE,
		ruleIds,
		...(conflict ? { code: 'CONFLICT' } : {}),
		...extra
	});
}

export function failValidation(
	httpStatus: number,
	ruleId: string,
	message: string,
	extra: Record<string, unknown> = {}
) {
	return fail(httpStatus, {
		ok: false as const,
		message,
		ruleIds: [ruleId],
		...extra
	});
}

/** PostgREST / Postgres conflict (serialization / version mismatch). */
export function isConflictDbError(err: { code?: string | null; message?: string | null }): boolean {
	if (err.code === '40001' || err.code === '23505') return true;
	const msg = err.message ?? '';
	return /CONFLICT|conflict/i.test(msg);
}
