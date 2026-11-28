/**
 * 정확한 금액 시트·팝오버 청크 실패 (code_review M3): 조용히 죽지 않고 안내, 상태는 되돌려 다음 탭이 재시도.
 */
import '../../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import ExactHost from './ExactHost.svelte';
import { exactPopover, exactValue } from './exactValue.svelte';
import { toast } from './toast.svelte';
import { resetOpenSheets } from './sheetStack';

const chunkErr = () => new TypeError('Failed to fetch dynamically imported module: x');

afterEach(() => {
	exactValue.close();
	exactPopover.hide();
	for (const t of [...toast.items]) toast.dismiss(t.id);
	resetOpenSheets();
	document.body.style.overflow = '';
});

describe('ExactHost 청크 실패', () => {
	it('시트: 실패하면 닫힘 상태로 되돌리고 토스트, 다시 show()하면 재시도해서 열린다', async () => {
		const real = () => import('./ExactValueSheet.svelte');
		const sheetLoader = vi.fn().mockRejectedValueOnce(chunkErr()).mockImplementation(real);
		render(ExactHost, { sheetLoader });
		exactValue.show('총 평가금액', '₩1,000');
		await expect.poll(() => toast.items.length).toBe(1);
		expect(toast.items[0].message).toBe('정확한 금액을 불러오지 못했어요');
		expect(toast.items[0].action?.label).toBe('새로고침');
		expect(exactValue.open).toBe(false);
		expect(document.querySelector('.sheet')).toBeNull();

		exactValue.show('총 평가금액', '₩1,000');
		await tick();
		await expect.poll(() => document.querySelector('.sheet.open')).not.toBeNull();
		expect(sheetLoader).toHaveBeenCalledTimes(2);
	});

	it('팝오버: 실패하면 anchor를 풀고 토스트', async () => {
		const popoverLoader = vi.fn().mockRejectedValue(chunkErr());
		render(ExactHost, { popoverLoader });
		const anchor = document.createElement('button');
		document.body.append(anchor);
		exactPopover.show(anchor, '합계', '₩2,000');
		await expect.poll(() => toast.items.length).toBe(1);
		expect(exactPopover.open).toBe(false);
		expect(anchor.hasAttribute('aria-describedby')).toBe(false);
		anchor.remove();
	});

	it('(app) 화면이 아니면(/login 등) 미리 받지 않는다', async () => {
		vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
			cb();
			return 1;
		});
		const sheetLoader = vi.fn().mockResolvedValue({ default: (() => {}) as never });
		const popoverLoader = vi.fn().mockResolvedValue({ default: (() => {}) as never });
		render(ExactHost, { sheetLoader, popoverLoader });
		await tick();
		await new Promise((r) => setTimeout(r, 30));
		expect(sheetLoader).not.toHaveBeenCalled();
		expect(popoverLoader).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
