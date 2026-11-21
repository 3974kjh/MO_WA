import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

describe('대비비 계산 (DS §2 표와 일치)', () => {
	it('text on surface 라이트 18.13', () => {
		expect(contrastRatio('#12161D', '#FFFFFF')?.toFixed(2)).toBe('18.13');
	});
	it('up on up-soft 라이트 4.81', () => {
		expect(contrastRatio('#C7251A', '#FCE8E6')?.toFixed(2)).toBe('4.81');
	});
});
