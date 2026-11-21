import { describe, expect, it } from 'vitest';
import { parsePageParams, toPageResult } from './pagination';

describe('BE-11 server pagination', () => {
	it('parses page/pageSize with defaults and caps', () => {
		const p = parsePageParams(new URL('https://x.test/j?page=2&pageSize=50'));
		expect(p).toEqual({ page: 2, pageSize: 50, offset: 50, limit: 50 });
		const capped = parsePageParams(new URL('https://x.test/?pageSize=999'), { maxSize: 100 });
		expect(capped.pageSize).toBe(100);
	});

	it('builds page result totals', () => {
		const params = parsePageParams(new URL('https://x.test/?page=1&pageSize=10'));
		expect(toPageResult([1, 2], 25, params).totalPages).toBe(3);
	});
});
