import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import ErrorState from './ErrorState.svelte';

// DS §0-2-7(v1.7.1): 재시도 버튼 라벨은 '다시 시도하기'로 통일.
describe('ErrorState 재시도', () => {
	it("기본 라벨은 '다시 시도하기'이고 누르면 onretry를 부른다", async () => {
		const onretry = vi.fn();
		const { container } = render(ErrorState, { onretry });
		const btn = page.getByRole('button', { name: '다시 시도하기' });
		await expect.element(btn).toBeVisible();
		expect(container.textContent).not.toMatch(/다시 시도(?!하기)/);
		await btn.click();
		expect(onretry).toHaveBeenCalledTimes(1);
	});

	it('onretry가 없으면 버튼이 없다', () => {
		const { container } = render(ErrorState, {});
		expect(container.querySelector('button')).toBeNull();
	});
});
