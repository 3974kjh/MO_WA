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

	// 로그인 불가(DS §7-17, 사용자 확정 15:35): login.html?state=disabled 그대로
	describe('로그인 불가 상태', () => {
		const down = {
			unavailable: true as const,
			checkedAt: '2026-11-27T04:04:30.000Z',
			email: 'a@b.co'
		};

		it('경고 알림(문장·KST 마지막 확인)·비활성 버튼·버튼 아래 이유 문구(aria-describedby)·이메일 유지', () => {
			const { container } = render(Page, { form: down });
			const alert = container.querySelector('[role="alert"]')!;
			const callout = alert.querySelector('.mw-callout.warn')!;
			expect(callout).not.toBeNull();
			expect(callout.querySelector('b')?.textContent).toBe(
				'지금은 로그인 서버에 연결할 수 없어요.'
			);
			expect(text(callout).replace(/\s+/g, ' ').trim()).toBe(
				'지금은 로그인 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요. 마지막 확인 13:04'
			);
			expect(callout.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
			const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
			expect(btn.disabled).toBe(true);
			expect(btn.getAttribute('aria-describedby')).toBe('submit-why');
			const why = container.querySelector('#submit-why')!;
			expect(text(why).trim()).toBe(
				'로그인 서버 점검 중이라 버튼을 누를 수 없어요. 연결되면 자동으로 다시 켜져요.'
			);
			expect(why.querySelector('svg')?.getAttribute('width')).toBe('16');
			expect(btn.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect((container.querySelector('#email') as HTMLInputElement).value).toBe('a@b.co');
			expect(container.querySelector('.mw-callout.err')).toBeNull();
		});

		it('알아볼 수 없는 checkedAt 이면 마지막 확인은 빼고 문장은 그대로 둔다', () => {
			const { container } = render(Page, { form: { ...down, checkedAt: 'nope' } });
			const t = text(container.querySelector('.mw-callout.warn')!).replace(/\s+/g, ' ').trim();
			expect(t).toBe('지금은 로그인 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
		});

		it('평상시·틀린 정보 상태에서는 나타나지 않고 버튼은 켜져 있다', () => {
			for (const form of [
				null,
				{ message: '이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.', email: 'a@b.co' }
			]) {
				const { container, unmount } = render(Page, { form });
				expect(container.querySelector('.mw-callout.warn')).toBeNull();
				expect(container.querySelector('#submit-why')).toBeNull();
				const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
				expect(btn.disabled).toBe(false);
				expect(btn.hasAttribute('aria-describedby')).toBe(false);
				unmount();
			}
		});
	});
});
