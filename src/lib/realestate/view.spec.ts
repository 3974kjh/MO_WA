import { describe, expect, it } from 'vitest';
import { parseRealestateQuery, RE_TABS } from './view';

const q = (s: string) => parseRealestateQuery(new URLSearchParams(s));

describe('FE-12 /realestate 주소', () => {
	it('확정 5탭 순서, 지금은 지도만 열림', () => {
		expect(RE_TABS.map((t) => t.id)).toEqual(['brief', 'trend', 'subs', 'watch', 'map']);
		expect(RE_TABS.filter((t) => t.ready).map((t) => t.id)).toEqual(['map']);
	});
	it('모르는 탭·준비 중 탭·없음은 지도', () => {
		expect(q('').tab).toBe('map');
		expect(q('tab=brief').tab).toBe('map');
		expect(q('tab=zzz').tab).toBe('map');
		expect(q('tab=map').tab).toBe('map');
	});
	it('c는 uuid 형식만', () => {
		expect(q('c=0A1B2C3D-0000-4000-8000-000000000001').c).toBe(
			'0a1b2c3d-0000-4000-8000-000000000001'
		);
		expect(q('c=../x').c).toBeNull();
		expect(q('').c).toBeNull();
	});
});
