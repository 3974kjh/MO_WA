/**
 * FE-10 Low-2: 목록 load 오류를 화면으로 넘길 때 DB·PostgREST 오류 원문을 보내지 않는다.
 * 원문은 서버 로그에만 남기고, 페이지 데이터에는 일반 문구만 싣는다.
 */
export const LIST_LOAD_ERROR = '목록을 불러오지 못했어요.';

export function publicListError(scope: string, error: unknown): string | null {
	if (!error) return null;
	const e = (typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown };
	console.error(`[${scope}] list load failed`, {
		code: e.code == null ? undefined : String(e.code),
		message: e.message == null ? String(error) : String(e.message)
	});
	return LIST_LOAD_ERROR;
}
