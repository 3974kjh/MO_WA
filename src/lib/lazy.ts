/** 첫 화면 페인트 뒤에 무거운 모듈을 미리 받아 둔다(초기 번들에는 넣지 않음). */
export function idleImport(load: () => Promise<unknown>): void {
	const run = () => {
		void load();
	};
	if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
	else setTimeout(run, 1);
}
