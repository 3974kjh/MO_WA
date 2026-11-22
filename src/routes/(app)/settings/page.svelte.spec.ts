/**
 * FE-09 설정 화면(client). 키 값은 명백한 더미 문자열.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

const { submitFns } = vi.hoisted(() => ({
	submitFns: new Map<string, (input: { formData: FormData }) => unknown>()
}));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit?: (input: { formData: FormData }) => unknown) => {
		if (submit) submitFns.set(node.getAttribute('action') ?? '', submit);
		return { destroy() {} };
	}
}));

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
		// L-2: 원문은 화면 전체 마크업에서 정확히 한 번(표시 영역)만. data-*·value 등 속성 사본도 잡는다.
		expect(document.body.innerHTML.split(KEY).length - 1).toBe(1);
		expect(document.documentElement.outerHTML.split(KEY).length - 1).toBe(1);
		issued.unmount();

		// 새로고침 = form 없이 다시 렌더
		const { container } = render(Page, { data: makeData() });
		expect(container.querySelector('[data-testid="issued-api-key"]')).toBeNull();
		expect(document.body.innerHTML).not.toContain(KEY);
		expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
		expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
		expect(document.cookie).not.toContain(KEY);
	});

	it('폐기는 확인 시트를 거쳐야 제출된다(폼은 시트 안에만 있다)', () => {
		const { container } = render(Page, { data: makeData() });
		// N-1: 대상 키를 고르기 전에는 폐기 폼이 아예 없다(id를 상시 들고 있지 않음).
		expect(document.getElementById('revoke-form')).toBeNull();
		btn('폐기')!.click();
		flushSync();
		expect(text(document.body)).toContain('키를 폐기할까요?');
		expect(text(document.querySelector('[data-testid="revoke-confirm"]'))).toContain('더미봇');
		const form = document.getElementById('revoke-form') as HTMLFormElement;
		expect(form).toBeTruthy();
		expect(form.closest('[role="dialog"]')).toBeTruthy();
		expect(form.getAttribute('method')?.toUpperCase()).toBe('POST');
		expect(form.getAttribute('action')).toBe('?/revoke');
		expect((form.querySelector('input[name="id"]') as HTMLInputElement).value).toBe(BOT.id);
		expect((form.querySelector('input[name="reason"]') as HTMLInputElement).value).toBe(
			'user_revoke'
		);
		const submit = vi.fn((e: Event) => e.preventDefault());
		form.addEventListener('submit', submit);
		const confirm = [
			...document.querySelectorAll('button[form="revoke-form"]')
		][0] as HTMLButtonElement;
		confirm.click();
		expect(submit).toHaveBeenCalledTimes(1);

		// 취소하면 시트가 닫히고 폼도 사라진다
		btn('취소')!.click();
		flushSync();
		expect(document.getElementById('revoke-form')).toBeNull();
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

	it('만료 시각: 제출 FormData에 +09:00을 붙이고 화면 값은 그대로 둔다(native·enhance)', () => {
		const { container } = render(Page, { data: makeData() });
		const issueForm = container.querySelector('[data-testid="bot-issue-form"]') as HTMLFormElement;
		const expiryForm = container.querySelector(
			'[data-testid="set-expiry-form"]'
		) as HTMLFormElement;
		for (const form of [issueForm, expiryForm]) {
			const input = form.querySelector('input[name="expires_at"]') as HTMLInputElement;
			expect(input.type).toBe('datetime-local');

			// 빈 값은 그대로
			input.value = '';
			expect(new FormData(form).get('expires_at')).toBe('');

			input.value = '2026-11-30T10:00';
			// native 제출 경로: formdata 이벤트(new FormData(form)도 같은 이벤트를 낸다)
			const posted = new FormData(form);
			expect(posted.get('expires_at')).toBe('2026-11-30T10:00+09:00');
			expect(input.value).toBe('2026-11-30T10:00');

			// enhance 경로: 콜백이 받은 FormData도 +09:00(이미 붙었으면 다시 붙이지 않음)
			const submit = submitFns.get(form.getAttribute('action') ?? '');
			expect(submit).toBeTypeOf('function');
			const raw = new FormData();
			raw.set('expires_at', '2026-11-30T10:00');
			submit!({ formData: raw });
			expect(raw.get('expires_at')).toBe('2026-11-30T10:00+09:00');
			submit!({ formData: posted });
			expect(posted.get('expires_at')).toBe('2026-11-30T10:00+09:00');
			expect(input.value).toBe('2026-11-30T10:00');
		}
	});

	it('만료 형식 오류는 한글로, 규칙 ID·필드명 비노출', () => {
		const { container } = render(Page, {
			data: makeData(),
			form: {
				ok: false,
				message: 'expires_at must be a valid ISO datetime',
				ruleIds: ['R-PERM-10']
			} as never
		});
		const t = text(container.querySelector('[data-testid="bot-action-error"]'));
		expect(t).toBe('만료 시각 형식이 올바르지 않아요.');
		expect(text(container)).not.toMatch(/R-[A-Z]+-\d+/);
		expect(text(container)).not.toContain('expires_at');
	});

	it('키가 없으면 안내(샘플 채우기 없음)', () => {
		const { container } = render(Page, { data: makeData({ botClients: [] }) });
		expect(text(container)).toContain('발급한 키가 없어요');
		expect(container.querySelector('[data-testid="bot-clients-list"]')).toBeNull();
	});
});
