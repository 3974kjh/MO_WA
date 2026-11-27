/**
 * 실패한 동적 import()는 브라우저가 거절을 캐시해서, 같은 specifier를 다시 불러도
 * 네트워크 요청이 나가지 않는다. 캐시 버스트는 importUrl 훅으로 URL에 t= 쿼리를
 * 붙여 다시 불러오는 방식이다.
 *
 * 프로덕션 ToastHost는 import(가변 URL)을 쓰지 않는다(eslint L6: 동적 import
 * 보간 금지). 재시도는 loader()를 한 번 더 호출하는 데 그친다. 실제 청크 URL을
 * 바꿔 다시 받는 경로는 테스트에서 importUrl 훅으로만 검증한다.
 */
export function failedImportUrl(err: unknown): string | null {
	const msg =
		err instanceof Error
			? `${err.message} ${err.stack ?? ''} ${(err as Error).cause ?? ''}`
			: String(err);
	const m =
		msg.match(/Failed to fetch dynamically imported module:\s+(\S+)/i) ??
		msg.match(/error loading dynamically imported module:\s+(\S+)/i) ??
		msg.match(/from ['"](https?:\/\/[^'"]+|\/_app\/immutable\/[^'"]+)['"]/);
	if (!m) return null;
	return m[1].replace(/[.)]+$/, '');
}

export function bustImportUrl(url: string, token: string | number = Date.now()): string {
	const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://local.invalid/');
	u.searchParams.set('t', String(token));
	return u.href;
}

/**
 * loader()를 한 번 호출한다. 재시도(retry)이고 importUrl 훅과 모듈 URL이 있으면
 * 캐시 버스트 쿼리를 붙여 다시 불러온다. 훅이 없으면(프로덕션) 오류를 그대로 던진다.
 * 호스트가 다음 시도에서 loader()를 다시 부르면 커스텀 loader는 그때 성공할 수 있다.
 */
export async function loadWithRetry<T>(
	loader: () => Promise<T>,
	opts: { retry: boolean; now?: number; importUrl?: (href: string) => Promise<T> } = {
		retry: false
	}
): Promise<T> {
	try {
		return await loader();
	} catch (err) {
		if (!opts.retry) throw err;
		const raw = failedImportUrl(err);
		if (!raw || !opts.importUrl) throw err;
		return opts.importUrl(bustImportUrl(raw, opts.now ?? Date.now()));
	}
}
