/** 첫 화면 페인트 뒤에 무거운 모듈을 미리 받아 둔다(초기 번들에는 넣지 않음). 실패는 삼킨다: 사용자가 쓸 때 다시 시도하고 안내한다. */
export function idleImport(load: () => Promise<unknown>): void {
	const run = () => {
		try {
			void load().catch(() => {});
		} catch {
			/* 동기 예외도 삼킨다 */
		}
	};
	if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
	else setTimeout(run, 1);
}
