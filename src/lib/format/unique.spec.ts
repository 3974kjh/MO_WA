import { describe, expect, it } from 'vitest';
import { uniqueValues } from './unique';

describe('uniqueValues (값-키 each 중복 제거)', () => {
	it('처음 나온 순서대로 한 번씩', () => {
		expect(uniqueValues(['금리', '환율', '금리', '반도체', '환율'])).toEqual([
			'금리',
			'환율',
			'반도체'
		]);
	});
	it('null·빈 배열은 빈 배열, 원본은 그대로', () => {
		const src = ['a', 'a'];
		expect(uniqueValues(null)).toEqual([]);
		expect(uniqueValues([])).toEqual([]);
		uniqueValues(src);
		expect(src).toEqual(['a', 'a']);
	});
});
