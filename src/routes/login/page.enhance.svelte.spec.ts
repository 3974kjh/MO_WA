/**
 * 로그인 enhance 콜백 경로 (code_review M-1 재리뷰 Nit-1): 제출 직후 콜백이 비밀번호 칸 상태를 바르게 정한다.
 * - 틀린 정보(failure) → 비밀번호 비움 · 빨간 테두리(aria-invalid) · 포커스 이동
 * - 로그인 불가(failure + unavailable) → 비밀번호만 비움 · 빨간 테두리·aria-invalid·포커스 이동 없음 (입력 문제가 아님)
 * SvelteKit 런타임 없이 콜백만 돌리려고 `$app/forms` 의 enhance 를 제출을 가로채는 가짜로 바꾼다(콜백 본문은 실제 코드).
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

const h = vi.hoisted(() => ({ result: undefined as unknown }));

vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit: (input: Record<string, unknown>) => unknown
	): { destroy(): void } => {
		const onSubmit = async (e: SubmitEvent) => {
			e.preventDefault();
			const cb = (await submit({
				cancel: () => {},
				formData: new FormData(form),
				formElement: form,
				action: new URL(location.href),
				controller: new AbortController(),
				submitter: null
			})) as ((o: Record<string, unknown>) => Promise<void>) | undefined;
			if (cb) await cb({ result: h.result, update: async () => {} });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	},
	deserialize: (t: string) => JSON.parse(t)
}));

import Page from './+page.svelte';

async function submitWith(result: unknown) {
	h.result = result;
	const { container } = render(Page, { form: null });
	await userEvent.fill(container.querySelector('#email')!, 'a@b.co');
	await userEvent.fill(container.querySelector('#password')!, '틀린비밀번호1');
	await userEvent.click(container.querySelector('button[type="submit"]')!);
	return container;
}
const pw = (c: Element) => c.querySelector('#password') as HTMLInputElement;

describe('로그인 enhance 콜백', () => {
	it('틀린 정보(failure): 비밀번호를 비우고 빨간 테두리(aria-invalid)·포커스를 준다', async () => {
		const c = await submitWith({
			type: 'failure',
			status: 400,
			data: { message: '이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.', email: 'a@b.co' }
		});
		await expect.poll(() => pw(c).getAttribute('aria-invalid')).toBe('true');
		expect(pw(c).value).toBe('');
		expect(pw(c).closest('.mw-input-group')?.hasAttribute('data-invalid')).toBe(true);
		expect(document.activeElement).toBe(pw(c));
	});

	it('로그인 불가(failure+unavailable): 비밀번호만 비우고 빨간 테두리·aria-invalid·포커스 이동은 없다', async () => {
		const c = await submitWith({
			type: 'failure',
			status: 503,
			data: { unavailable: true, checkedAt: '2026-11-27T04:04:30.000Z', email: 'a@b.co' }
		});
		await expect.poll(() => pw(c).value).toBe(''); // 콜백이 돌았다
		await new Promise((r) => setTimeout(r, 50)); // tick 이후 분기(플래그·포커스)까지 기다린다
		expect(pw(c).getAttribute('aria-invalid')).not.toBe('true');
		expect(pw(c).closest('.mw-input-group')?.hasAttribute('data-invalid')).toBe(false);
		expect(document.activeElement).not.toBe(pw(c));
	});
});
