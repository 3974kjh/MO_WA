/**
 * FE-09 설정 화면(client). 키 값은 명백한 더미 문자열.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

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
const PROFILE_SCOPES = {
	'finance-manager': ['read', 'positions:propose', 'principles:propose', 'journal:write'],
	'equity-analyst': ['read', 'valuations:write'],
	importer: ['import:all'],
	custom: ['read']
};

function makeData(over: Record<string, unknown> = {}) {
	return {
		title: '설정',
		ruleIdCounts: {},
		botClients: [BOT],
		profileScopes: PROFILE_SCOPES,
		error: null,
		...over
	} as never;
}
const text = (el: Element | null | undefined) => el?.textContent ?? '';
const btn = (label: string) =>
	[...document.querySelectorAll('button')].find((b) => text(b).trim() === label) as
		| HTMLButtonElement
		| undefined;

beforeEach(() => {
	document.body.style.overflow = '';
	localStorage.clear();
	sessionStorage.clear();
});

describe('FE-09 설정 화면', () => {
	it('화면 모드 3단 선택이 있고 마지막 사용 시각을 보여 준다', () => {
		const { container } = render(Page, { data: makeData() });
		const seg = container.querySelector('[data-testid="theme-setting"]')!;
		expect([...seg.querySelectorAll('button')].map((b) => text(b))).toEqual([
			'기기 설정 따름',
			'라이트',
			'다크'
		]);
		expect(text(container.querySelector('[data-testid="last-used"]'))).toMatch(
			/마지막 사용 11\/20 12:00 KST/
		);
	});

	it('테마 선택은 공통 themeState/localStorage 로직을 쓴다', () => {
		const { container } = render(Page, { data: makeData() });
		const seg = container.querySelector('[data-testid="theme-setting"]')!;
		(
			[...seg.querySelectorAll('button')].find((b) => text(b) === '다크') as HTMLButtonElement
		).click();
		flushSync();
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(localStorage.getItem('mowa-theme')).toBe('dark');
		(
			[...seg.querySelectorAll('button')].find(
				(b) => text(b) === '기기 설정 따름'
			) as HTMLButtonElement
		).click();
		flushSync();
		expect(document.documentElement.getAttribute('data-theme')).toBeNull();
	});

	it('importer 프로필은 만료 필수, 제안 권한은 선택지에서 빠진다', () => {
		const { container } = render(Page, { data: makeData() });
		const sel = container.querySelector('[data-testid="issue-profile"]') as HTMLSelectElement;
		const expiry = container.querySelector('[data-testid="issue-expiry"]') as HTMLInputElement;
		const scopes = () =>
			[
				...container.querySelectorAll<HTMLInputElement>(
					'[data-testid="issue-scopes"] input[type="checkbox"]'
				)
			].map((c) => c.value);
		expect(expiry.required).toBe(false);
		expect(scopes()).toContain('positions:propose');
		expect(scopes()).toContain('principles:propose');

		sel.value = 'importer';
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(expiry.required).toBe(true);

		sel.value = 'equity-analyst';
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(scopes()).toEqual(['read', 'valuations:write']);
		expect(text(container.querySelector('[data-testid="propose-note"]'))).toContain(
			'재무 관리 봇에서만'
		);
		const hidden = container.querySelector('input[name="scopes"]') as HTMLInputElement;
		expect(JSON.parse(hidden.value)).toEqual(['read', 'valuations:write']);
	});

	it('발급 성공 응답에서만 키 원문을 한 번 보여 주고, 폼이 없으면 어디에도 없다', () => {
		const KEY = 'mowa_dummydummy_DUMMYDUMMYDUMMYDUMMYDUMMYDUMMYDUMMYDUMMY1';
		const issued = render(Page, {
			data: makeData(),
			form: { ok: true, apiKey: KEY, botClient: BOT } as never
		});
		expect(text(issued.container.querySelector('[data-testid="issued-api-key"]'))).toContain(KEY);
		expect(btn('복사')).toBeTruthy();
		issued.unmount();

		// 새로고침 = form 없이 다시 렌더
		const { container } = render(Page, { data: makeData() });
		expect(container.querySelector('[data-testid="issued-api-key"]')).toBeNull();
		expect(document.body.innerHTML).not.toContain(KEY);
		expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
		expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
		expect(document.cookie).not.toContain(KEY);
	});

	it('폐기는 확인 시트를 거쳐야 제출된다', () => {
		const { container } = render(Page, { data: makeData() });
		const form = document.getElementById('revoke-form') as HTMLFormElement;
		const submit = vi.fn((e: Event) => e.preventDefault());
		form.addEventListener('submit', submit);
		expect((form.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('');
		btn('폐기')!.click();
		flushSync();
		expect(submit).not.toHaveBeenCalled();
		expect(text(document.body)).toContain('키를 폐기할까요?');
		expect(text(document.querySelector('[data-testid="revoke-confirm"]'))).toContain('더미봇');
		expect((form.querySelector('input[name="id"]') as HTMLInputElement).value).toBe(BOT.id);
		const confirm = [
			...document.querySelectorAll('button[form="revoke-form"]')
		][0] as HTMLButtonElement;
		confirm.click();
		expect(submit).toHaveBeenCalledTimes(1);
		expect(container).toBeTruthy();
	});

	it('오류는 한글로, 규칙 ID는 화면에 없다', () => {
		const { container } = render(Page, {
			data: makeData(),
			form: {
				ok: false,
				message: '[R-PERM-10] importer keys require an expiry date (expires_at)',
				ruleIds: ['R-PERM-10']
			} as never
		});
		const t = text(container.querySelector('[data-testid="bot-action-error"]'));
		expect(t).toContain('만료일');
		expect(text(container)).not.toMatch(/R-[A-Z]+-\d+/);
		expect(text(container)).not.toContain('expires_at');
	});

	it('키가 없으면 안내(샘플 채우기 없음)', () => {
		const { container } = render(Page, { data: makeData({ botClients: [] }) });
		expect(text(container)).toContain('발급한 키가 없어요');
		expect(container.querySelector('[data-testid="bot-clients-list"]')).toBeNull();
	});
});
