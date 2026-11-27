/**
 * Nit-2: 포트폴리오 표 nowrap·stickyFirst, 거절 확인 버튼 btn-primary-m (살아남던 변이).
 */
import '../../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';

vi.mock('$app/navigation', () => ({
	beforeNavigate: () => {},
	invalidateAll: vi.fn(async () => {})
}));
vi.mock('$app/forms', () => ({ deserialize: (t: string) => JSON.parse(t) }));

import Page from './+page.svelte';
import { makeItem } from '../../../../tests/queue/testItem';
import { makeRow } from '../../../../tests/portfolio/testRow';

const base = {
	title: '포트폴리오',
	pendingCount: 0,
	userEmail: null,
	queue: { items: [], total: 0 },
	queueError: null,
	history: { items: [], total: 0 },
	historyError: null,
	holdings: [],
	positionsError: null,
	portfolio: { rows: [], totalKrw: null, usdkrw: null, holdCount: 0 },
	portfolioError: null,
	valuationError: null,
	attentionNeeded: [],
	attentionLimit: 50,
	attentionError: null
};

afterEach(async () => {
	await page.viewport(414, 896);
});

describe('포트폴리오 표 nowrap·첫 열 고정 (Nit-2)', () => {
	it('≥640: 표에 nowrap·sticky-first가 붙고, 첫 열은 sticky', async () => {
		await page.viewport(768, 900);
		const rows = [
			makeRow({ id: 'a', name: '종목하나', ticker: '000111' }),
			makeRow({ id: 'b', name: '종목둘', ticker: '000222' })
		];
		const { container } = render(Page, {
			data: { ...base, portfolio: { rows, totalKrw: 1, usdkrw: null, holdCount: 0 } } as never
		});
		flushSync();
		const tbl = container.querySelector(
			'[data-testid="portfolio-table"] table'
		) as HTMLTableElement;
		expect(tbl).toBeTruthy();
		expect(tbl.classList.contains('nowrap')).toBe(true);
		expect(tbl.classList.contains('sticky-first')).toBe(true);
		const wrap = container.querySelector('[data-testid="portfolio-table"] .tbl-outer');
		expect(wrap?.hasAttribute('data-nowrap')).toBe(true);
		const first = tbl.querySelector('th') as HTMLElement;
		expect(getComputedStyle(first).position).toBe('sticky');
	});
});

describe('거절 확인 버튼 (Nit-2)', () => {
	const openReject = async (width: number, height: number) => {
		await page.viewport(width, height);
		const item = makeItem({ status: 'pending' });
		render(Page, {
			data: { ...base, queue: { items: [item], total: 1 }, pendingCount: 1 } as never
		});
		flushSync();
		const reject = document.querySelector<HTMLElement>('[data-action="reject"]')!;
		reject.click();
		flushSync();
		const confirm = document.querySelector<HTMLElement>('[data-action="reject-confirm"]')!;
		const cancel = [...document.querySelectorAll('[role="dialog"] button')].find(
			(b) => b.textContent?.trim() === '취소'
		) as HTMLElement;
		return { confirm, cancel };
	};

	it('1280: 거절 확인·취소 모두 btn-primary-m, 높이 40, btn-sm 없음', async () => {
		const { confirm, cancel } = await openReject(1280, 900);
		for (const b of [confirm, cancel]) {
			expect(b.className).toContain('btn-primary-m');
			expect(b.className).not.toContain('btn-sm');
			expect(b.getBoundingClientRect().height).toBe(40);
		}
	});

	it('<640: 거절 확인·취소 높이 44, 글자 16px, btn-primary-m', async () => {
		const { confirm, cancel } = await openReject(390, 844);
		for (const b of [confirm, cancel]) {
			expect(b.className).toContain('btn-primary-m');
			expect(b.getBoundingClientRect().height).toBe(44);
			expect(parseFloat(getComputedStyle(b).fontSize)).toBe(16);
		}
	});
});
