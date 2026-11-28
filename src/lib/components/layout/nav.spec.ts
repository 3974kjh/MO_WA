import { describe, expect, it } from 'vitest';
import {
	ACCOUNT_NAV,
	backHrefFromPath,
	INVEST_NAV,
	LOGOUT_PATH,
	PRIMARY_NAV,
	sectionFromPath,
	SOON_NAV
} from './nav';

describe('FE-01 내비 정의', () => {
	it('1차 4개(하단 탭과 같음), 포트폴리오에만 대기 pill', () => {
		expect(PRIMARY_NAV.map((n) => n.label)).toEqual(['홈', '브리핑', '포트폴리오', '매매일지']);
		expect(PRIMARY_NAV.filter((n) => n.pendingBadge).map((n) => n.id)).toEqual(['portfolio']);
	});
	it("FE-11 '투자' 묶음: 종목 열림, 부동산은 FE-12 전까지 준비 중(href 없음), 기업분석 메뉴 없음", () => {
		expect(INVEST_NAV.map((n) => [n.label, n.href])).toEqual([
			['종목', '/stocks'],
			['부동산', undefined]
		]);
		expect(SOON_NAV.map((n) => [n.label, n.href])).toEqual([['투자 원칙', undefined]]);
		expect(sectionFromPath('/stocks')).toBe('stocks');
		expect(sectionFromPath('/stocks/005930')).toBe('stocks');
		expect(sectionFromPath('/analyses/plan-108490')).toBe('stocks');
	});
	it('경로 → 현재 섹션', () => {
		expect(sectionFromPath('/')).toBe('dashboard');
		expect(sectionFromPath('/briefings')).toBe('briefings');
		expect(sectionFromPath('/briefings/2026-11-20')).toBe('briefings');
		expect(sectionFromPath('/journal/abc')).toBe('journal');
		expect(sectionFromPath('/login')).toBeNull();
	});
	it('로그아웃은 `/` 위치와 무관한 전용 경로', () => {
		expect(LOGOUT_PATH).toBe('/logout');
	});
	it('상세 화면만 뒤로 경로를 가진다', () => {
		expect(backHrefFromPath('/briefings')).toBeNull();
		expect(backHrefFromPath('/briefings/2026-11-20')).toBe('/briefings');
		expect(backHrefFromPath('/')).toBeNull();
	});
});

describe('FE-08·FE-11 관리 그룹', () => {
	it('보관함 /archive, 설정 /settings 모두 열림', () => {
		expect(ACCOUNT_NAV.find((n) => n.id === 'archive')?.href).toBe('/archive');
		expect(ACCOUNT_NAV.find((n) => n.id === 'settings')?.href).toBe('/settings');
		expect(sectionFromPath('/archive')).toBe('archive');
		expect(sectionFromPath('/settings')).toBe('settings');
	});
});
