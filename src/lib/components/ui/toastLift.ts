/**
 * 열린 시트와 토스트가 겹치면, 토스트를 시트 *실제* 윗선 위 12px로 올린다(DS §7-0).
 * 86dvh 같은 최대 높이는 쓰지 않는다. 자리가 없으면 상단바 바로 아래.
 * 가운데 모달처럼 겹치지 않으면 null(기본 위치 유지).
 */
export type Box = { top: number; right: number; bottom: number; left: number };

export type ToastLiftInput = {
	sheet: Box;
	viewportH: number;
	viewportW: number;
	toastH: number;
	toastW: number;
	defaultBottom: number;
	barBottom: number;
	gap?: number;
	barGap?: number;
};

function overlaps(a: Box, b: Box): boolean {
	return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
}

/** 기본 위치에서 시트와 겹치면 새 `--mw-toast-bottom`(px). 겹치지 않으면 null. */
export function toastBottomOffset(i: ToastLiftInput): number | null {
	const gap = i.gap ?? 12;
	const barGap = i.barGap ?? 8;
	const left = (i.viewportW - i.toastW) / 2;
	const toast: Box = {
		left,
		right: left + i.toastW,
		bottom: i.viewportH - i.defaultBottom,
		top: i.viewportH - i.defaultBottom - i.toastH
	};
	if (!overlaps(toast, i.sheet)) return null;
	const toastTopIfLifted = i.sheet.top - gap - i.toastH;
	const minTop = i.barBottom + barGap;
	if (toastTopIfLifted < minTop) return Math.max(0, i.viewportH - minTop - i.toastH);
	return i.viewportH - i.sheet.top + gap;
}
