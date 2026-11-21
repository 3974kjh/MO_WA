import { fail } from '@sveltejs/kit';
import { mapDbErrorToRuleIds } from '$lib/server/domain/validation/mapDbError';

/** DB 오류 원문 대신 내보내는 일반 문구(원문은 서버 로그). */
export const ACTION_FAILED_MESSAGE = '요청을 처리하지 못했어요.';

export type ActionErrorBody = {
	ok: false;
	message: string;
	ruleIds: string[];
	code?: string;
	status?: string;
};

export function failFromDbError(
	httpStatus: number,
	err: { message?: string | null; code?: string | null; details?: string | null },
	extra: Partial<ActionErrorBody> = {}
) {
	const ruleIds = mapDbErrorToRuleIds(err);
	console.error('[action] db error', {
		code: err.code ?? undefined,
		message: err.message ?? undefined
	});
	return fail(httpStatus, {
		ok: false as const,
		message: ACTION_FAILED_MESSAGE,
		ruleIds,
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
