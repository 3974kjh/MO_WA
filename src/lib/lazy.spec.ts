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
});
