/** tabindex=-1 컨트롤(목차 점 roving)은 제외. 포함되면 last가 마지막 점이 되어 Tab이 시트를 나간다. */
const FOCUSABLE =
	'a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),input:not([disabled]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]):not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hasAttribute('inert') && el.getClientRects().length > 0 && el.tabIndex >= 0
	);
}

/** Tab/Shift+Tab을 컨테이너 안에서 순환시킨다. */
export function trapTab(e: KeyboardEvent, root: HTMLElement) {
	if (e.key !== 'Tab') return;
	const items = focusableIn(root);
	if (items.length === 0) {
		e.preventDefault();
		root.focus();
		return;
	}
	const first = items[0];
	const last = items[items.length - 1];
	const active = document.activeElement;
	if (e.shiftKey && (active === first || active === root)) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && active === last) {
		e.preventDefault();
		first.focus();
	}
}
