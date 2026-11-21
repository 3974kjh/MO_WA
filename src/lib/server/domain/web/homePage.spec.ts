import { describe, expect, it } from 'vitest';
import { HOME_BRIEFINGS_PAGE, HOME_QUEUE_PAGE, HOME_SERIES_DAYS } from './homePage';
import { parsePageParams } from './pagination';

describe('L-8 home briefings pagination', () => {
	it('fixes page=1 size=5', () => {
		expect(HOME_BRIEFINGS_PAGE).toEqual({
			page: 1,
			pageSize: 5,
			offset: 0,
			limit: 5
		});
	});

	it('does not follow URL page/pageSize the way parsePageParams would', () => {
		const fromUrl = parsePageParams(new URL('https://example.test/?page=3&pageSize=50'), {
			defaultSize: 5
		});
		expect(fromUrl.page).toBe(3);
		expect(fromUrl.pageSize).toBe(50);
		expect(HOME_BRIEFINGS_PAGE.page).toBe(1);
		expect(HOME_BRIEFINGS_PAGE.pageSize).toBe(5);
	});
});

describe('FE-03 home queue / series', () => {
	it('queue card is fixed page=1 size=5, series 30 records', () => {
		expect(HOME_QUEUE_PAGE).toEqual({ page: 1, pageSize: 5, offset: 0, limit: 5 });
		expect(HOME_SERIES_DAYS).toBe(30);
	});
});
