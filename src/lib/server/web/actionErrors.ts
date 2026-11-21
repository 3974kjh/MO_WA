import { fail } from '@sveltejs/kit';
import { mapDbErrorToRuleIds } from '$lib/server/domain/validation/mapDbError';

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
	return fail(httpStatus, {
		ok: false as const,
		message: err.message ?? 'request failed',
		ruleIds,
		code: err.code ?? undefined,
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
