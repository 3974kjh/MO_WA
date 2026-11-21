/** FE-10: 마지막 호출 뒤 `ms`만큼 조용하면 한 번 실행한다(검색 입력 → URL 반영). */
export type Debounced<A extends unknown[]> = {
	(...args: A): void;
	cancel(): void;
	/** 대기 중인 호출을 즉시 실행한다(Enter 등). 대기 중이 아니면 아무것도 하지 않는다. */
	flush(): void;
};

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: A | null = null;
	const run = () => {
		timer = undefined;
		const args = pending;
		pending = null;
		if (args) fn(...args);
	};
	const d = ((...args: A) => {
		pending = args;
		clearTimeout(timer);
		timer = setTimeout(run, ms);
	}) as Debounced<A>;
	d.cancel = () => {
		clearTimeout(timer);
		timer = undefined;
		pending = null;
	};
	d.flush = () => {
		if (!pending) return;
		clearTimeout(timer);
		run();
	};
	return d;
}
