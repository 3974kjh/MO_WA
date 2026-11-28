/**
 * 더보기 청크 실패 (code_review H2): 버튼이 조용히 죽지 않고 안내(토스트)와 새로고침을 준다.
 * 실패한 로드는 기억하지 않아, 다음 탭에서 다시 시도해 열린다.
 */
import '../../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { toast } from '$lib/components/ui/toast.svelte';
import { resetOpenSheets } from '$lib/components/ui/sheetStack';
import AppShell from './AppShell.svelte';

const chunkErr = () => new TypeError('Failed to fetch dynamically imported module: x');
const moreBtn = () => document.querySelector<HTMLButtonElement>('button.more-btn')!;

afterEach(() => {
	for (const t of [...toast.items]) toast.dismiss(t.id);
	resetOpenSheets();
	document.body.style.overflow = '';
});

describe('AppShell 더보기 로드 실패', () => {
	it('실패하면 안내 토스트(새로고침 동작)가 뜨고 시트는 안 열리며, 다시 누르면 재시도해서 열린다', async () => {
		const real = () => import('./MoreSheet.svelte');
		const loadMore = vi.fn().mockRejectedValueOnce(chunkErr()).mockImplementation(real);
		vi.stubGlobal('requestIdleCallback', () => 0); // 유휴 미리 받기는 돌리지 않는다
		render(AppShell, {
			current: 'dashboard',
			pendingCount: 0,
			loadMore,
			children: (() => {}) as never
		});
		moreBtn().click();
		await expect.poll(() => toast.items.length).toBe(1);
		const t = toast.items[0];
		expect(t.message).toBe('더보기 메뉴를 불러오지 못했어요');
		expect(t.tone).toBe('err');
		expect(t.action?.label).toBe('새로고침');
		expect(moreBtn().getAttribute('aria-expanded')).toBe('false');

		moreBtn().click();
		await expect.poll(() => moreBtn().getAttribute('aria-expanded')).toBe('true');
		expect(loadMore).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});
});
