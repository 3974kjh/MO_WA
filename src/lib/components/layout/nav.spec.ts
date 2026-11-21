import { describe, expect, it } from 'vitest';
import { backHrefFromPath, LATER_NAV, PRIMARY_NAV, sectionFromPath } from './nav';

describe('FE-01 내비 정의', () => {
	it('1차 4개(하단 탭과 같음), 포트폴리오에만 대기 pill', () => {
		expect(PRIMARY_NAV.map((n) => n.label)).toEqual(['홈', '브리핑', '포트폴리오', '매매일지']);
		expect(PRIMARY_NAV.filter((n) => n.pendingBadge).map((n) => n.id)).toEqual(['portfolio']);
	});
	it('이후 섹션은 모두 disabled(href 없음)', () => {
		expect(LATER_NAV.map((n) => n.label)).toEqual(['종목', '기업분석', '부동산', '투자 원칙']);
		expect(LATER_NAV.every((n) => !n.href)).toBe(true);
	});
	it('경로 → 현재 섹션', () => {
		expect(sectionFromPath('/')).toBe('dashboard');
		expect(sectionFromPath('/briefings')).toBe('briefings');
		expect(sectionFromPath('/briefings/2026-11-20')).toBe('briefings');
		expect(sectionFromPath('/journal/abc')).toBe('journal');
		expect(sectionFromPath('/login')).toBeNull();
	});
	it('상세 화면만 뒤로 경로를 가진다', () => {
		expect(backHrefFromPath('/briefings')).toBeNull();
		expect(backHrefFromPath('/briefings/2026-11-20')).toBe('/briefings');
		expect(backHrefFromPath('/')).toBeNull();
	});
});
