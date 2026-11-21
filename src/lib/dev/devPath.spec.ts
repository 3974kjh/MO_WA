import { describe, expect, it } from 'vitest';
import { isDevPath } from './devPath';

describe('isDevPath', () => {
	it('/dev 와 /dev/* 만 허용', () => {
		expect(isDevPath('/dev')).toBe(true);
		expect(isDevPath('/dev/components')).toBe(true);
		expect(isDevPath('/dev/shell')).toBe(true);
	});
	it('/devices, /developer/x, /dev2, /portfolio 는 거짓', () => {
		for (const p of ['/devices', '/developer/x', '/dev2', '/portfolio', '/', '/login']) {
			expect(isDevPath(p)).toBe(false);
		}
	});
});
