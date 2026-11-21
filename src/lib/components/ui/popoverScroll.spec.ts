import { describe, expect, it } from 'vitest';
import { popoverScrollAction, POPOVER_FOCUS_SCROLL_GRACE_MS } from './popoverScroll';

describe('popoverScrollAction', () => {
	it('열린 직후(포커스 스크롤)에는 닫지 않고 위치만 맞춘다', () => {
		expect(popoverScrollAction({ affectsAnchor: true, sinceOpenMs: 10 })).toBe('reposition');
	});
	it('그 뒤 페이지·표 스크롤은 닫는다', () => {
		expect(
			popoverScrollAction({ affectsAnchor: true, sinceOpenMs: POPOVER_FOCUS_SCROLL_GRACE_MS })
		).toBe('close');
	});
	it('앵커와 무관한 컨테이너 스크롤은 무시한다', () => {
		expect(popoverScrollAction({ affectsAnchor: false, sinceOpenMs: 1000 })).toBe('ignore');
	});
});
