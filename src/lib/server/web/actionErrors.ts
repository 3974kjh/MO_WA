import { fail } from '@sveltejs/kit';
import { mapDbErrorToRuleIds, UNMAPPED_MARKER } from '$lib/server/domain/validation/mapDbError';

/** DB 오류 원문 대신 내보내는 일반 문구(원문은 서버 로그). */
export const ACTION_FAILED_MESSAGE = '요청을 처리하지 못했어요.';

/** 용어집 v1.3 conflict 라벨(StatusBadge)과 같은 문구. */
export const ACTION_CONFLICT_MESSAGE = '반영 안 됨(보유가 달라짐)';

/** 다른 세션에서 새 요청으로 바뀐(superseded) 요청을 처리하려 한 경우. 오류가 아니라 중립 안내. */
export const ACTION_SUPERSEDED_MESSAGE = '이미 새 요청으로 바뀌었어요. 새 요청을 확인해 주세요';

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
	const superseded = !conflict && isSupersededDbError(err);
	console.error('[action] db error', {
		code: err.code ?? undefined,
		message: err.message ?? undefined,
		constraint: err.constraint ?? undefined,
		ruleIds: all
	});
	if (superseded) {
		return fail(httpStatus, {
			ok: false as const,
			message: ACTION_SUPERSEDED_MESSAGE,
			ruleIds,
			code: 'SUPERSEDED',
			status: 'superseded',
			...extra
		});
	}
	return fail(httpStatus, {
		ok: false as const,
		message: conflict ? ACTION_CONFLICT_MESSAGE : ACTION_FAILED_MESSAGE,
		ruleIds,
		...(conflict ? { code: 'CONFLICT' } : {}),
		...extra
	});
}

/**
 * approve_proposal·approve_principle_proposal·decide_principle_proposal이 종결 상태에서 내는
 * `raise exception 'proposal is already %'`(P0001) 중 superseded만. 다른 상태·다른 코드는 아니다.
 * 거절·보류·확인했어요는 DB가 P0002 not found를 반환하므로 superseded 안내가 아니라 일반 오류로 실패한다(의도된 안전 실패).
 */
export function isSupersededDbError(err: {
	code?: string | null;
	message?: string | null;
}): boolean {
	return err.code === 'P0001' && err.message === 'proposal is already superseded';
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

/**
 * CONFLICT(반영 안 됨·보유가 달라짐)는 아래만이다. 메시지 단어(conflict)로는 판별하지 않는다.
 * 1. 40001 (serialization failure)
 * 2. 명시적 버전 충돌: 앱 code가 정확히 'CONFLICT', 또는 R-PERM-13 매핑
 * 3. R-PERM-11 client_ref 키 충돌
 * 도메인 unique 위반(R-VAL-P03·I01·R03 등 23505)과 그 외 23505는 충돌이 아니다.
 */
export function isConflictDbError(err: {
	code?: string | null;
	message?: string | null;
	details?: string | null;
	hint?: string | null;
	constraint?: string | null;
}): boolean {
	if (err.code === '40001' || err.code === 'CONFLICT') return true;
	const ids = mapDbErrorToRuleIds(err);
	return ids.includes('R-PERM-13') || ids.includes('R-PERM-11');
}
