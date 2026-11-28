import { describe, expect, it } from 'vitest';
import { COMPLEX_TABS, parseRealestateQuery, RE_TABS } from './view';

const q = (s: string) => parseRealestateQuery(new URLSearchParams(s));

describe('FE-12 /realestate 주소', () => {
	it('확정 5탭 순서(시안 realestate.html)', () => {
		expect(RE_TABS.map((t) => t.id)).toEqual(['brief', 'trend', 'subs', 'watch', 'map']);
		expect(RE_TABS.map((t) => t.label)).toEqual([
			'오늘 브리핑',
			'시세 동향',
			'청약',
			'관심 단지',
			'지도'
		]);
	});
	it('다섯 탭이 모두 열린다 · 없거나 모르는 값은 첫 탭(오늘 브리핑)', () => {
		expect(q('').tab).toBe('brief');
		expect(q('tab=zzz').tab).toBe('brief');
		for (const t of RE_TABS) expect(q(`tab=${t.id}`).tab).toBe(t.id);
	});
	it('단지 자료는 관심 단지·지도 탭만 읽는다', () => {
		expect([...COMPLEX_TABS].sort()).toEqual(['map', 'watch']);
	});
	it('c는 uuid 형식만', () => {
		expect(q('c=0A1B2C3D-0000-4000-8000-000000000001').c).toBe(
			'0a1b2c3d-0000-4000-8000-000000000001'
		);
		expect(q('c=../x').c).toBeNull();
		expect(q('').c).toBeNull();
	});
});
