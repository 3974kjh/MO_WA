import { describe, expect, it } from 'vitest';
import { chromeForPath, isMenuNavigation } from './navTarget';

const nav = (from: string, to: string, type: string | null = 'link') => ({
	from: { url: new URL(from, 'https://x.test') },
	to: { url: new URL(to, 'https://x.test'), route: { id: '/(app)/stocks' } },
	type
});

describe('isMenuNavigation', () => {
	it('경로가 바뀌면 패널 대상', () => {
		expect(isMenuNavigation(nav('/', '/stocks'))).toBe(true);
		expect(isMenuNavigation(nav('/stocks', '/stocks/005930'))).toBe(true);
		expect(isMenuNavigation(nav('/stocks/005930', '/stocks/000660'))).toBe(true);
		expect(isMenuNavigation(nav('/stocks', '/', 'popstate'))).toBe(true);
	});
	it('쿼리·해시만 바뀌면 대상 아님(필터·쪽 바꾸기)', () => {
		expect(isMenuNavigation(nav('/stocks', '/stocks?f=hold'))).toBe(false);
		expect(isMenuNavigation(nav('/briefings?page=1', '/briefings?page=2'))).toBe(false);
	});
	it('to 또는 from이 없거나 leave·form이면 대상 아님', () => {
		expect(isMenuNavigation({ from: null, to: null })).toBe(false);
		expect(isMenuNavigation({ ...nav('/', '/stocks'), from: null })).toBe(false);
		expect(isMenuNavigation(nav('/', '/stocks', 'leave'))).toBe(false);
		expect(isMenuNavigation(nav('/', '/stocks', 'form'))).toBe(false);
	});
});

describe('chromeForPath (이동 중 셸 표시)', () => {
	it('메뉴 경로는 그 섹션이 활성이고 제목은 메뉴 이름', () => {
		expect(chromeForPath('/portfolio')).toMatchObject({
			current: 'portfolio',
			title: '포트폴리오'
		});
		expect(chromeForPath('/')).toMatchObject({ current: 'dashboard', title: '홈', backHref: null });
	});
	it('상세는 상위 섹션 활성, 뒤로는 상위 경로', () => {
		expect(chromeForPath('/stocks/005930')).toEqual({
			current: 'stocks',
			title: '종목',
			backHref: '/stocks'
		});
	});
	it('분석 리포트는 뒤로를 비운다(들어온 화면은 데이터가 와야 안다)', () => {
		expect(chromeForPath('/analyses/abc')).toMatchObject({ current: 'stocks', backHref: null });
	});
});
