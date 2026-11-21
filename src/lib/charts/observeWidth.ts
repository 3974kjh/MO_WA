/**
 * 컨테이너 폭 관찰 attachment (FE-14, DS §7-4 '컨테이너 너비를 관찰해 다시 그린다').
 * `{@attach observeWidth((w) => (width = w))}`. 폭이 실제로 바뀔 때만 콜백한다(높이 변화로 다시 그리지 않음).
 */
import type { Attachment } from 'svelte/attachments';

export function observeWidth(onWidth: (width: number) => void): Attachment<HTMLElement> {
	return (el) => {
		let last = -1;
		const report = (w: number) => {
			const r = Math.round(w);
			if (r !== last) {
				last = r;
				onWidth(r);
			}
		};
		report(el.clientWidth);
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) report(e.contentRect.width);
		});
		ro.observe(el);
		return () => ro.disconnect();
	};
}
