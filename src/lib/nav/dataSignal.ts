/**
 * 목적지 데이터 응답 관측 (클라이언트 전용).
 * SvelteKit은 서버 load가 있는 목적지를 `<경로>/__data.json`으로 받는다. 그 요청이 끝나면 브라우저가
 * resource timing 항목을 만든다. 이동을 시작한 뒤 이 항목이 나타나면 "응답을 받았다"는 실제 신호다.
 * PerformanceObserver가 없거나 관측에 실패하면 아무 일도 하지 않는다(퍼센트는 요청 단계 상한에서 기다림).
 */
export const DATA_SUFFIX = '/__data.json';

export function dataPathFor(pathname: string): string {
	return pathname.replace(/\/$/, '') + DATA_SUFFIX;
}

export function observeDataResponse(pathname: string, onResponse: () => void): () => void {
	if (typeof PerformanceObserver === 'undefined') return () => {};
	const want = dataPathFor(pathname);
	let observer: PerformanceObserver;
	try {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				let path: string;
				try {
					path = new URL(entry.name, location.href).pathname;
				} catch {
					continue;
				}
				if (path === want) {
					onResponse();
					return;
				}
			}
		});
		observer.observe({ type: 'resource' });
	} catch {
		return () => {};
	}
	return () => observer.disconnect();
}
