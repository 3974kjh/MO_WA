/**
 * FE-09 설정 화면(client). 키 값은 명백한 더미 문자열.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

type SubmitInput = { formData: FormData; cancel?: () => void };
const { submitFns } = vi.hoisted(() => ({
	submitFns: new Map<HTMLFormElement, (input: SubmitInput) => unknown>()
}));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit?: (input: SubmitInput) => unknown) => {
		if (submit) submitFns.set(node, submit);
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

	it('사용 중지 버튼은 danger 외곽선이고, 확인 시트에서는 취소가 채움(기본) 버튼 · 사용 중지는 danger 외곽선이다 (DS §0-2-7)', () => {
		render(Page, { data: makeData() });
		const listBtn = btn('사용 중지')!;
		expect(listBtn.className).toContain('preset-outlined-error-700-300');
		expect(listBtn.className).not.toContain('preset-filled');
		listBtn.click();
		flushSync();
		const confirm = document.querySelector('button[form="revoke-form"]') as HTMLButtonElement;
		expect(confirm.textContent?.trim()).toBe('사용 중지');
		expect(confirm.className).toContain('preset-outlined-error-700-300');
		expect(confirm.className).not.toContain('preset-filled');
		const cancel = [...document.querySelectorAll('[role="dialog"] button')].find(
			(b) => b.textContent?.trim() === '취소'
		) as HTMLElement;
		expect(cancel.className).toContain('preset-filled-brand');
	});

	it('사용 중지는 확인 시트를 거쳐야 제출된다(폼은 시트 안에만 있다)', () => {
		const { container } = render(Page, { data: makeData() });
		// N-1: 대상 키를 고르기 전에는 사용 중지 폼이 아예 없다(id를 상시 들고 있지 않음).
		expect(document.getElementById('revoke-form')).toBeNull();
		btn('사용 중지')!.click();
		flushSync();
		expect(text(document.body)).toContain('키를 사용 중지할까요?');
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
			const submit = submitFns.get(form);
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

	it('만료가 있는 비importer 키를 빈 값으로 저장하면 확인 시트를 거친다(Info-2)', () => {
		const withExpiry = { ...BOT, expires_at: '2026-12-01T01:00:00Z' };
		const { container } = render(Page, { data: makeData({ botClients: [withExpiry] }) });
		const rowForm = container.querySelector('[data-testid="set-expiry-form"]') as HTMLFormElement;
		const submit = submitFns.get(rowForm)!;
		expect(document.getElementById('expiry-clear-form')).toBeNull();

		// 값이 있으면 그대로 제출(취소 안 함)
		const cancelA = vi.fn();
		const a = new FormData();
		a.set('expires_at', '2026-12-31T10:00');
		submit({ formData: a, cancel: cancelA });
		flushSync();
		expect(cancelA).not.toHaveBeenCalled();
		expect(document.getElementById('expiry-clear-form')).toBeNull();

		// 빈 값이면 제출을 멈추고 확인 시트
		const cancelB = vi.fn();
		const b = new FormData();
		b.set('expires_at', '');
		submit({ formData: b, cancel: cancelB });
		flushSync();
		expect(cancelB).toHaveBeenCalledTimes(1);
		expect(text(document.body)).toContain('만료를 해제할까요?');
		const msg = text(document.querySelector('[data-testid="expiry-clear-confirm"]'));
		expect(msg).toContain('더미봇');
		expect(msg).toContain('12/01 10:00 KST');
		expect(msg).not.toMatch(/R-[A-Z]+-\d+|expires_at/);

		const form = document.getElementById('expiry-clear-form') as HTMLFormElement;
		expect(form.closest('[role="dialog"]')).toBeTruthy();
		expect(form.getAttribute('action')).toBe('?/setExpiry');
		const fdata = new FormData(form);
		expect(fdata.get('id')).toBe(BOT.id);
		expect(fdata.get('expires_at')).toBe('');
		const onSubmit = vi.fn((e: Event) => e.preventDefault());
		form.addEventListener('submit', onSubmit);
		(document.querySelector('button[form="expiry-clear-form"]') as HTMLButtonElement).click();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(text(document.querySelector('button[form="expiry-clear-form"]'))).toContain('만료 해제');

		const dialog = form.closest('[role="dialog"]')!;
		(
			[...dialog.querySelectorAll('button')].find(
				(b) => text(b).trim() === '취소'
			) as HTMLButtonElement
		).click();
		flushSync();
		expect(document.getElementById('expiry-clear-form')).toBeNull();
	});

	it('importer 키·만료 없는 키는 확인 없이 그대로(Info-2 범위 밖)', () => {
		const importer = {
			...BOT,
			id: '22222222-2222-4222-8222-222222222222',
			profile: 'importer',
			expires_at: '2026-12-01T01:00:00Z'
		};
		const { container } = render(Page, { data: makeData({ botClients: [importer, BOT] }) });
		const forms = [
			...container.querySelectorAll('[data-testid="set-expiry-form"]')
		] as HTMLFormElement[];
		expect(forms).toHaveLength(2);
		for (const f of forms) {
			const cancel = vi.fn();
			const d = new FormData();
			d.set('expires_at', '');
			submitFns.get(f)!({ formData: d, cancel });
			flushSync();
			expect(cancel).not.toHaveBeenCalled();
		}
		expect(document.getElementById('expiry-clear-form')).toBeNull();
		// importer 입력은 여전히 필수
		expect((forms[0]!.querySelector('input[name="expires_at"]') as HTMLInputElement).required).toBe(
			true
		);
	});

	it('키가 없으면 안내(샘플 채우기 없음)', () => {
		const { container } = render(Page, { data: makeData({ botClients: [] }) });
		expect(text(container)).toContain('발급한 키가 없어요');
		expect(container.querySelector('[data-testid="bot-clients-list"]')).toBeNull();
	});
});
