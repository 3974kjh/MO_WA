/**
 * 열린 시트 스택. document 캡처 Esc는 맨 위 시트만 닫는다.
 * 시트마다 리스너를 달면 stopPropagation으로 같은 document의 다른 리스너가 막히지 않는다.
 */
export type OpenSheet = { close: () => void };

const stack: OpenSheet[] = [];
let listening = false;

function onDocKey(e: KeyboardEvent) {
	if (e.key !== 'Escape') return;
	const top = stack[stack.length - 1];
	if (!top) return;
	e.preventDefault();
	e.stopPropagation();
	e.stopImmediatePropagation();
	top.close();
}

export function isTopEntry(entry: OpenSheet | undefined): boolean {
	return !!entry && stack.length > 0 && stack[stack.length - 1] === entry;
}

/** 열린 시트를 등록한다. 정리 함수는 닫힐 때 꼭 호출한다. */
export function registerOpenSheet(close: () => void): { entry: OpenSheet; unregister: () => void } {
	const entry: OpenSheet = { close };
	stack.push(entry);
	if (!listening && typeof document !== 'undefined') {
		document.addEventListener('keydown', onDocKey, true);
		listening = true;
	}
	const unregister = () => {
		const i = stack.lastIndexOf(entry);
		if (i >= 0) stack.splice(i, 1);
		if (stack.length === 0 && listening && typeof document !== 'undefined') {
			document.removeEventListener('keydown', onDocKey, true);
			listening = false;
		}
	};
	return { entry, unregister };
}

/** 테스트용 */
export function openSheetCount(): number {
	return stack.length;
}

/** 테스트용: 스택과 공유 리스너를 비운다. */
export function resetOpenSheets(): void {
	stack.length = 0;
	if (listening && typeof document !== 'undefined') {
		document.removeEventListener('keydown', onDocKey, true);
		listening = false;
	}
}
