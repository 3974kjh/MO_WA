import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Page from './+page.svelte';

const text = (c: Element) => c.textContent ?? '';

describe('로그인 화면 (DS §7-17)', () => {
	it('확정 문구만 보이고 영문 태그라인·비밀번호 찾기는 없다', async () => {
		const { container } = render(Page, { form: null });
		const t = text(container);
		await expect.element(page.getByRole('heading', { name: '로그인', level: 1 })).toBeVisible();
		await expect.element(page.getByLabelText('이메일', { exact: true })).toBeVisible();
		await expect.element(page.getByLabelText('비밀번호', { exact: true })).toBeVisible();
		expect(t).not.toContain('Money and Wallet');
		expect(t).not.toContain('비밀번호 찾기');
		expect(t).not.toContain('아이디');
		expect(t).not.toContain('패스워드');
		const email = container.querySelector('#email') as HTMLInputElement;
		expect(email.getAttribute('autocomplete')).toBe('username');
		expect(email.getAttribute('inputmode')).toBe('email');
		expect(container.querySelector('#password')?.getAttribute('autocomplete')).toBe(
			'current-password'
		);
		expect(container.querySelector('form')?.hasAttribute('novalidate')).toBe(true);
	});

	it('비밀번호 보기 버튼은 aria-pressed 와 입력 type 을 함께 바꾸고 포커스를 입력으로 돌린다', async () => {
		const { container } = render(Page, { form: null });
		const pw = container.querySelector('#password') as HTMLInputElement;
		await page.getByRole('button', { name: '비밀번호 보기' }).click();
		const hide = page.getByRole('button', { name: '비밀번호 숨기기' });
		await expect.element(hide).toHaveAttribute('aria-pressed', 'true');
		expect(pw.type).toBe('text');
		expect(document.activeElement).toBe(pw);
		await hide.click();
		expect(pw.type).toBe('password');
	});

	it('빈 칸으로 제출하면 필드 아래 문구를 보이고 첫 오류 칸으로 포커스한다', async () => {
		const { container } = render(Page, { form: null });
		await page.getByRole('button', { name: '로그인' }).click();
		await expect.element(page.getByText('이메일을 입력해 주세요.')).toBeVisible();
		await expect.element(page.getByText('비밀번호를 입력해 주세요.')).toBeVisible();
		expect(document.activeElement).toBe(container.querySelector('#email'));
		expect(container.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
	});

	it('이메일 형식이 틀리면 예시와 함께 알려 준다', async () => {
		render(Page, { form: null });
		await page.getByLabelText('이메일', { exact: true }).fill('hyunwoo@');
		await page.getByLabelText('비밀번호', { exact: true }).fill('pw');
		await page.getByRole('button', { name: '로그인' }).click();
		await expect
			.element(page.getByText('이메일 형식을 확인해 주세요. 예: name@example.com'))
			.toBeVisible();
	});

	it('서버 실패 문장은 알림으로 보이고 이메일은 유지한다', async () => {
		const { container } = render(Page, {
			form: {
				message: '이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.',
				email: 'a@b.co'
			}
		});
		const alert = container.querySelector('[role="alert"]');
		expect(text(alert!).replace(/\s+/g, ' ').trim()).toBe(
			'이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.'
		);
		expect(alert?.querySelector('b')?.textContent).toBe('이메일 또는 비밀번호가 맞지 않아요.');
		expect((container.querySelector('#email') as HTMLInputElement).value).toBe('a@b.co');
	});
});
