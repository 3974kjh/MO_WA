import { describe, expect, it } from 'vitest';
import {
	buildComplexMapModel,
	coordKey,
	isAllowedMapLink,
	isLocated,
	latestSnapshots,
	naverSearchUrl,
	tierOf,
	TIER_LABEL,
	TIER_ORDER,
	validCoord,
	type ComplexRow
} from './points';

const row = (o: Partial<ComplexRow> = {}): ComplexRow => ({
	id: 'c1',
	name: '샘플단지',
	sido: '경기도',
	sigungu: '파주시',
	address: '경기도 파주시 샘플로 1',
	lat: 37.71,
	lng: 126.73,
	households: 1000,
	built_year: 2020,
	main_type: '59㎡대',
	total_score: 70,
	rating: 3.5,
	is_target: true,
	roles: ['target'],
	...o
});

describe('지도 데이터 매핑(points)', () => {
	it('좌표 범위(R-VAL-M07) 안의 유한수만 쓴다 · 숫자 문자열(numeric) 허용', () => {
		expect(validCoord(37.5, 127)).toEqual({ lat: 37.5, lng: 127 });
		expect(validCoord('37.500000', '127.000000')).toEqual({ lat: 37.5, lng: 127 });
		expect(validCoord(null, 127)).toBeNull();
		expect(validCoord(37.5, null)).toBeNull();
		expect(validCoord(32.9, 127)).toBeNull();
		expect(validCoord(37.5, 132.1)).toBeNull();
		expect(validCoord(Number.NaN, 127)).toBeNull();
		expect(validCoord('', 127)).toBeNull();
	});

	it('좌표 없는 행은 지도 핀에서 빠지고 목록에는 위치 없음으로 남는다', () => {
		const m = buildComplexMapModel([
			row({ id: 'a', total_score: 80 }),
			row({
				id: 'b',
				lat: null,
				lng: null,
				total_score: 90,
				is_target: false,
				roles: ['candidate']
			}),
			row({ id: 'c', lat: 40, total_score: 10 })
		]);
		expect(m.items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
		expect(m.located).toBe(1);
		expect(m.missing).toBe(2);
		expect(m.items.filter(isLocated).map((i) => i.id)).toEqual(['a']);
		const b = m.items.find((i) => i.id === 'b')!;
		expect(b.lat).toBeNull();
		expect(b.lng).toBeNull();
	});

	it('구분(시안 v1.7.8): 최우선(관심·총점 75↑) · 관심 · 후보 · 참고(secondary)', () => {
		expect(tierOf({ is_target: true, total_score: 75, roles: [] })).toBe('top');
		expect(tierOf({ is_target: true, total_score: '78.60', roles: [] })).toBe('top');
		expect(tierOf({ is_target: true, total_score: 74.9, roles: [] })).toBe('target');
		expect(tierOf({ is_target: true, total_score: null, roles: [] })).toBe('target');
		expect(tierOf({ is_target: false, total_score: null, roles: ['secondary', 'candidate'] })).toBe(
			'ref'
		);
		expect(tierOf({ is_target: false, total_score: null, roles: ['candidate'] })).toBe('cand');
		expect(tierOf({ is_target: false, total_score: null, roles: 'x' })).toBe('cand');
		expect(TIER_ORDER.map((t) => TIER_LABEL[t])).toEqual(['최우선', '관심', '후보', '참고']);
	});

	it('순서: 구분(최우선→관심→후보→참고) → 총점 높은 순(없으면 뒤) → 이름, rank는 1부터', () => {
		const m = buildComplexMapModel([
			row({ id: 'n', name: '나', total_score: null, is_target: false, roles: ['secondary'] }),
			row({ id: 'g', name: '가', total_score: null, is_target: false, roles: ['secondary'] }),
			row({ id: 'c', total_score: 61.5, is_target: false, roles: ['candidate'] }),
			row({ id: 't', total_score: '61.5' })
		]);
		expect(m.items.map((i) => [i.id, i.rank])).toEqual([
			['t', 1],
			['c', 2],
			['g', 3],
			['n', 4]
		]);
		expect(m.items[0].score).toBe(61.5);
		expect(m.items.map((i) => i.tier)).toEqual(['target', 'cand', 'ref', 'ref']);
	});

	it('최신 스냅샷의 중앙값(만 원 정수)만 싣는다', () => {
		const snaps = [
			{ complex_id: 'c1', as_of: '2026-11-04', med_price: 59600 },
			{ complex_id: 'c1', as_of: '2026-10-01', med_price: 50000 },
			{ complex_id: 'c2', as_of: '2026-11-04', med_price: null }
		];
		expect(latestSnapshots(snaps).get('c1')?.as_of).toBe('2026-11-04');
		const m = buildComplexMapModel([row(), row({ id: 'c2' }), row({ id: 'c3' })], snaps);
		const by = Object.fromEntries(m.items.map((i) => [i.id, i]));
		expect(by.c1.medPrice).toBe(59600);
		expect(by.c1.priceAsOf).toBe('2026-11-04');
		expect(by.c2.medPrice).toBeNull();
		expect(by.c3.medPrice).toBeNull();
		expect(m.priceAsOf).toBe('2026-11-04');
	});

	it('네이버 지도 검색 링크: 이름+시군구, 인코딩, 허용 도메인만', () => {
		const u = naverSearchUrl('A&B 단지', '파주시');
		expect(u).toBe('https://map.naver.com/p/search/' + encodeURIComponent('A&B 단지 파주시'));
		expect(naverSearchUrl('단지', null)).toBe(
			'https://map.naver.com/p/search/' + encodeURIComponent('단지')
		);
		expect(isAllowedMapLink(u)).toBe(true);
		expect(isAllowedMapLink('javascript:alert(1)')).toBe(false);
		expect(isAllowedMapLink('https://evil.example/https://map.naver.com/p/search/')).toBe(false);
	});

	it('같은 위치 키는 소수 4자리', () => {
		expect(coordKey(37.123449, 127.000049)).toBe('37.1234,127.0000');
	});
});
