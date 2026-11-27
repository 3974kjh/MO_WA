/**
 * ToastHost 지연 로드 (Nit-1): 청크가 실패해도 한 번 다시 시도하고, 그래도 안 되면 대체 토스트로 '되돌리기'가 보인다.
 */
import '../../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import ToastHost from './ToastHost.svelte';
import { toast } from './toast.svelte';

const real = () => import('./ToastGroup.svelte');
const fallback = () => document.querySelector<HTMLElement>('[data-testid="toast-fallback"]');
const zag = () => document.querySelector('[data-scope="toast"][data-part="root"]');

afterEach(() => {
	for (const t of [...toast.items]) toast.dismiss(t.id);
});

describe('ToastHost 청크 실패 복구', () => {
	it('청크가 로드되기 전에 생긴 토스트도, 로드가 끝나면 그려진다 (마운트 전 create 유실 방지)', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const loader = vi.fn(async () => {
			await gate;
			return real();
		});
		render(ToastHost, { loader });
		toast.show('먼저 생김', { duration: 0 });
		flushSync();
		await expect.poll(() => loader.mock.calls.length).toBe(1);
		expect(zag()).toBeNull(); // 아직 청크 없음
		release();
		await expect.poll(zag, { timeout: 5000 }).not.toBeNull();
		expect(document.querySelector('[data-scope="toast"][data-part="root"]')!.textContent).toContain(
			'먼저 생김'
		);
	});

	it('한 번 실패하고 재시도에서 성공하면 정상 토스트(Zag)가 뜬다 — 대체 토스트는 안 보인다', async () => {
		const loader = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockImplementation(real);
		render(ToastHost, { loader, retryDelayMs: 0 });
		toast.show('반영했어요', { duration: 0 });
		flushSync();
		await expect.poll(zag, { timeout: 5000 }).not.toBeNull();
		expect(loader).toHaveBeenCalledTimes(2);
		expect(fallback()).toBeNull();
	});

	it('두 번 다 실패하면 대체 토스트가 뜨고 되돌리기 버튼이 동작한다', async () => {
		const loader = vi.fn().mockRejectedValue(new Error('chunk'));
		render(ToastHost, { loader, retryDelayMs: 0 });
		const undo = vi.fn();
		toast.show('반영했어요', { duration: 0, action: { label: '되돌리기', onclick: undo } });
		flushSync();
		await expect.poll(fallback, { timeout: 3000 }).not.toBeNull();
		expect(loader).toHaveBeenCalledTimes(2); // 처음 + 재시도 한 번뿐
		expect(fallback()!.textContent).toContain('반영했어요');
		const btn = fallback()!.querySelector<HTMLButtonElement>('button.act')!;
		expect(btn.textContent).toBe('되돌리기');
		btn.click();
		flushSync();
		expect(undo).toHaveBeenCalledTimes(1);
		expect(toast.items).toHaveLength(0);
		await expect.poll(fallback).toBeNull();
	});

	it('실패한 뒤 다음 토스트가 생기면 다시 시도해 성공하면 대체 토스트가 정상 토스트로 바뀐다', async () => {
		const loader = vi
			.fn()
			.mockRejectedValueOnce(new Error('a'))
			.mockRejectedValueOnce(new Error('b'))
			.mockImplementation(real);
		render(ToastHost, { loader, retryDelayMs: 0 });
		toast.show('첫째', { duration: 0 });
		flushSync();
		await expect.poll(fallback, { timeout: 3000 }).not.toBeNull();
		toast.show('둘째', { duration: 0 });
		flushSync();
		await expect.poll(zag, { timeout: 5000 }).not.toBeNull();
		expect(loader).toHaveBeenCalledTimes(3);
		await expect.poll(fallback).toBeNull();
	});
});

describe('ToastHost 대체 토스트 시트 리프트 (Nit-1)', () => {
	it('375: 청크가 실패해도 대체 토스트가 열린 시트 윗선 12px 위에 있다', async () => {
		const { page } = await import('vitest/browser');
		const Harness = (await import('../../../../tests/ui/ToastFallbackHarness.svelte')).default;
		await page.viewport(375, 720);
		const loader = vi.fn().mockRejectedValue(new Error('chunk'));
		render(Harness, { loader });
		toast.show('반영했어요', { duration: 0 });
		flushSync();
		await expect.poll(fallback, { timeout: 3000 }).not.toBeNull();
		await page.getByRole('button', { name: '시트 열기' }).click();
		const gap = () => {
			const t = fallback();
			const d = document.querySelector<HTMLElement>('[role="dialog"]');
			return t && d
				? Math.round(d.getBoundingClientRect().top - t.getBoundingClientRect().bottom)
				: NaN;
		};
		await expect.poll(gap, { timeout: 3000 }).toBe(12);
		expect(document.documentElement.style.getPropertyValue('--mw-toast-bottom-lift')).not.toBe('');
	});
});
