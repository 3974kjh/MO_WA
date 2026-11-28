/**
 * FE-11 종목명 글자 링크(v1.6.3): stock·etf만 /stocks/[ticker], bond·cash·코드 없음은 글자만(결정 3).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StockNameLink from './StockNameLink.svelte';

describe('StockNameLink', () => {
	it('stock·etf는 이름 글자 링크(+스크린리더 문구)', () => {
		const r = render(StockNameLink, {
			name: 'SGOV',
			ticker: 'SGOV',
			assetType: 'etf',
			srText: '종목 화면'
		});
		const a = document.querySelector('a.stk-link');
		expect(a?.getAttribute('href')).toBe('/stocks/SGOV');
		expect(a?.textContent).toBe('SGOV 종목 화면');
		r.unmount();
	});
	it('bond·cash·코드 없음은 링크 없이 글자만', () => {
		for (const [ticker, assetType] of [
			['UST_30Y', 'bond'],
			['CASH_KRW', 'cash'],
			[null, 'stock']
		] as const) {
			const r = render(StockNameLink, { name: '이름', ticker, assetType });
			expect(document.querySelector('a')).toBeNull();
			expect(document.body.textContent).toContain('이름');
			r.unmount();
		}
	});
});
