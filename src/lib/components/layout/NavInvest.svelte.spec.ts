/**
 * FE-11 '투자' 메뉴(v1.6.2 B안, 결정 5): 종목 열림 · 펼침 상태 노출. FE-12 골격: 부동산 열림.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import NavInvest from './NavInvest.svelte';

describe('NavInvest', () => {
	it('버튼이 펼침 상태를 알리고, 종목·부동산은 링크', async () => {
		const r = render(NavInvest, { current: 'stocks' });
		const btn = document.querySelector('button.disc') as HTMLButtonElement;
		expect(btn.getAttribute('aria-controls')).toBe('inv-menu');
		expect(btn.getAttribute('aria-label')).toBe('투자 (현재 메뉴)');
		const before = btn.getAttribute('aria-expanded');
		btn.click();
		flushSync();
		expect(btn.getAttribute('aria-expanded')).toBe(before === 'true' ? 'false' : 'true');
		const menu = document.getElementById('inv-menu')!;
		const stocks = menu.querySelector('a[href="/stocks"]');
		expect(stocks?.getAttribute('aria-current')).toBe('page');
		const re = menu.querySelector('a[href="/realestate"]');
		expect(re?.textContent).toContain('부동산');
		expect(re?.getAttribute('aria-current')).toBeNull();
		expect(menu.querySelector('[aria-disabled="true"]')).toBeNull();
		r.unmount();
	});
	it('다른 화면이면 현재 표시 없음', () => {
		const r = render(NavInvest, { current: 'dashboard' });
		const btn = document.querySelector('button.disc')!;
		expect(btn.getAttribute('aria-label')).toBe('투자');
		expect(document.querySelector('#inv-menu [aria-current]')).toBeNull();
		r.unmount();
	});
});
