import { describe, expect, it } from 'vitest';
import { resolveMobileMode } from './dataTableMode';

describe('DataTable 모바일 모드 (DS §7-3)', () => {
	it('열 ≥5 & 행 ≤10 → 카드형', () => {
		expect(resolveMobileMode('auto', 5, 10)).toBe('cards');
		expect(resolveMobileMode('auto', 6, 3)).toBe('cards');
	});
	it('그 밖에는 가로 스크롤', () => {
		expect(resolveMobileMode('auto', 4, 3)).toBe('scroll');
		expect(resolveMobileMode('auto', 5, 11)).toBe('scroll');
	});
	it('명시값이 우선', () => {
		expect(resolveMobileMode('scroll', 6, 3)).toBe('scroll');
		expect(resolveMobileMode('cards', 2, 50)).toBe('cards');
	});
});
