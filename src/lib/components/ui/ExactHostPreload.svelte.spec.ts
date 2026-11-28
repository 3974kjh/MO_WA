/** (app) 화면에서는 한가할 때 정확한 금액 시트·팝오버를 미리 받는다 (비 앱 화면은 ExactHost.svelte.spec.ts). */
import '../../../app.css';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ExactHost from './ExactHost.svelte';

vi.mock('$app/state', () => ({ page: { route: { id: '/(app)' } } }));

describe('ExactHost 미리 받기', () => {
	it('(app) 라우트에서는 시트·팝오버 청크를 한 번씩 미리 부른다', async () => {
		vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
			cb();
			return 1;
		});
		const sheetLoader = vi.fn().mockResolvedValue({ default: (() => {}) as never });
		const popoverLoader = vi.fn().mockResolvedValue({ default: (() => {}) as never });
		render(ExactHost, { sheetLoader, popoverLoader });
		await expect.poll(() => sheetLoader.mock.calls.length).toBe(1);
		await expect.poll(() => popoverLoader.mock.calls.length).toBe(1);
		vi.unstubAllGlobals();
	});
});
