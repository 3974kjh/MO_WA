import { describe, expect, it } from 'vitest';
import { currentSection, dotHeight, moreEdges, overflows } from './sheetScroll';

describe('sheetScroll (DS v1.7.6)', () => {
	it('넘침: scrollHeight 가 clientHeight+1 보다 클 때만', () => {
		expect(overflows(300, 300)).toBe(false);
		expect(overflows(300, 301)).toBe(false);
		expect(overflows(300, 302)).toBe(true);
	});
	it('가장자리 단서: 위=scrollTop>1, 아래=남은 내용>1', () => {
		expect(moreEdges(0, 300, 600)).toEqual({ up: false, down: true });
		expect(moreEdges(1, 300, 600)).toEqual({ up: false, down: true });
		expect(moreEdges(2, 300, 600)).toEqual({ up: true, down: true });
		expect(moreEdges(300, 300, 600)).toEqual({ up: true, down: false });
		expect(moreEdges(0, 300, 300)).toEqual({ up: false, down: false });
	});
	it('현재 구역: 맨 위=첫째, 맨 아래=마지막, 중간=위 24px 선을 지난 마지막 머리글', () => {
		const offs = [0, 200, 400, 600];
		expect(currentSection(0, 300, 900, offs)).toBe(0);
		expect(currentSection(600, 300, 900, offs)).toBe(3);
		expect(currentSection(400, 300, 900, [-400, -200, 0, 200])).toBe(2);
		expect(currentSection(100, 300, 900, [-100, 100, 300, 500])).toBe(0);
		expect(currentSection(100, 300, 900, [-100, 24, 300, 500])).toBe(1);
		expect(currentSection(100, 300, 900, [-100, 25, 300, 500])).toBe(0);
	});
	it('점 높이: 32 ≤ h ≤ 40|44, 모자라면 32 에서 멈춘다', () => {
		expect(dotHeight(500, 5, 40)).toBe(40);
		expect(dotHeight(500, 10, 44)).toBe(44);
		expect(dotHeight(304, 10, 44)).toBe(32);
		expect(dotHeight(316, 7, 40)).toBe(40);
		expect(dotHeight(316, 22, 44)).toBe(32);
		expect(dotHeight(0, 3, 44)).toBe(32);
	});
});
