/**
 * 사용 중지 확인 시트 버튼 크기 (DS v1.7.2): 두 버튼은 주 행동이라 compact/btn-sm 금지.
 * btn + btn-primary-m → PC·태블릿 40, 모바일(<640) 44·16px.
 */
import '../../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import Page from './+page.svelte';

const BOT = {
	id: '11111111-1111-4111-8111-111111111111',
	owner_id: 'u1',
	name: '더미봇',
	profile: 'finance-manager',
	description: null,
	key_prefix: 'dummyprfx1',
	scopes: ['read'],
	rate_limit_per_min: 60,
	expires_at: null,
	revoked_at: null,
	revoked_reason: null,
	last_used_at: '2026-11-20T03:00:00Z',
	created_at: '2026-11-01T00:00:00Z',
	updated_at: '2026-11-01T00:00:00Z'
};

const data = {
	title: '설정',
	ruleIdCounts: {},
	botClients: [BOT],
	profileScopes: { 'finance-manager': ['read'] },
	error: null
} as never;

const footerBtns = () => {
	const dlg = document.querySelector('[role="dialog"]')!;
	const cancel = [...dlg.querySelectorAll('button')].find((b) => b.textContent?.trim() === '취소')!;
	const confirm = dlg.querySelector('button[form="revoke-form"]') as HTMLButtonElement;
	return { cancel, confirm };
};

const openSheet = () => {
	const { container } = render(Page, { data });
	const list = [...container.querySelectorAll('button')].find(
		(b) => b.textContent?.trim() === '사용 중지'
	)!;
	list.click();
	flushSync();
	return { container, list };
};

afterEach(async () => {
	await page.viewport(414, 896);
});

describe('사용 중지 확인 시트 버튼 크기 (DS v1.7.2)', () => {
	it('≥640: 취소·사용 중지 모두 높이 40, btn-primary-m, btn-sm 없음', async () => {
		await page.viewport(1280, 900);
		openSheet();
		const { cancel, confirm } = footerBtns();
		expect(cancel.getBoundingClientRect().height).toBe(40);
		expect(confirm.getBoundingClientRect().height).toBe(40);
		for (const b of [cancel, confirm]) {
			expect(b.className).toContain('btn-primary-m');
			expect(b.className).not.toContain('btn-sm');
		}
	});

	it('768(태블릿)도 높이 40', async () => {
		await page.viewport(768, 900);
		openSheet();
		const { cancel, confirm } = footerBtns();
		expect(cancel.getBoundingClientRect().height).toBe(40);
		expect(confirm.getBoundingClientRect().height).toBe(40);
	});

	it('<640: 두 버튼 높이 44, 글자 16px', async () => {
		await page.viewport(390, 844);
		openSheet();
		const { cancel, confirm } = footerBtns();
		for (const b of [cancel, confirm]) {
			expect(b.getBoundingClientRect().height).toBe(44);
			expect(getComputedStyle(b).fontSize).toBe('16px');
		}
	});

	it('목록의 사용 중지는 그대로 compact(보이는 높이 32) — 확인 시트만 커진다', async () => {
		await page.viewport(390, 844);
		const { list } = openSheet();
		expect(list.className).toContain('btn-sm');
		expect(list.getBoundingClientRect().height).toBe(32);
	});
});
