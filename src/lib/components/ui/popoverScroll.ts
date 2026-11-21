/** 정확값 팝오버가 스크롤에 어떻게 반응할지. 포커스 이동이 일으킨 스크롤은 닫지 않고 위치만 다시 맞춘다. */
export const POPOVER_FOCUS_SCROLL_GRACE_MS = 250;

export type PopoverScrollAction = 'ignore' | 'reposition' | 'close';

export function popoverScrollAction(opts: {
	/** 스크롤한 대상이 문서(페이지)이거나 앵커를 품은 컨테이너(표 등)인가. 무관한 컨테이너면 false */
	affectsAnchor: boolean;
	/** 팝오버가 열린 뒤 경과 시간(ms) */
	sinceOpenMs: number;
}): PopoverScrollAction {
	if (!opts.affectsAnchor) return 'ignore';
	if (opts.sinceOpenMs < POPOVER_FOCUS_SCROLL_GRACE_MS) return 'reposition';
	return 'close';
}
