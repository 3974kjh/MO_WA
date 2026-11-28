import { describe, expect, it, vi, afterEach } from 'vitest';
import { idleImport } from './lazy';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('idleImport', () => {
	it('requestIdleCallback가 있으면 timeout 2초로 부른다', async () => {
		const calls: Array<{ timeout?: number }> = [];
		vi.stubGlobal('requestIdleCallback', (cb: () => void, opts?: { timeout?: number }) => {
			calls.push(opts ?? {});
			cb();
			return 1;
		});
		const load = vi.fn().mockResolvedValue(undefined);
		idleImport(load);
		expect(calls).toEqual([{ timeout: 2000 }]);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('없으면 setTimeout(1)로 부른다', async () => {
		vi.stubGlobal('requestIdleCallback', undefined);
		vi.useFakeTimers();
		const load = vi.fn().mockResolvedValue(undefined);
		idleImport(load);
		expect(load).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('미리 불러오기가 실패해도 처리되지 않은 거절이 나지 않는다', async () => {
		vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
			cb();
			return 1;
		});
		// 처리되지 않은 거절이 나면 vitest가 실행 전체를 실패로 처리한다
		const rejecting = vi.fn(() => Promise.reject(new Error('chunk')));
		const throwing = vi.fn(() => {
			throw new Error('sync');
		});
		idleImport(rejecting);
		idleImport(throwing as unknown as () => Promise<unknown>);
		await new Promise((r) => setTimeout(r, 20));
		expect(rejecting).toHaveBeenCalledTimes(1);
		expect(throwing).toHaveBeenCalledTimes(1);
	});
});
