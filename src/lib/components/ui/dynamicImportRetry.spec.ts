import { describe, expect, it, vi } from 'vitest';
import { bustImportUrl, failedImportUrl, loadWithRetry } from './dynamicImportRetry';

describe('failedImportUrl / bustImportUrl', () => {
	it('Chrome 동적 import 실패 메시지에서 URL을 꺼내고 t= 쿼리를 붙인다', () => {
		const url = 'http://127.0.0.1:8789/_app/immutable/chunks/ToastGroup.ABC.js';
		const err = new Error(`Failed to fetch dynamically imported module: ${url}`);
		expect(failedImportUrl(err)).toBe(url);
		const busted = bustImportUrl(url, 123);
		expect(busted).toContain('t=123');
		expect(busted).toContain('ToastGroup.ABC.js');
		expect(failedImportUrl(new Error('chunk'))).toBeNull();
		expect(failedImportUrl(new Error('ENOENT /dev/null'))).toBeNull();
	});
});

describe('loadWithRetry', () => {
	it('첫 시도가 성공하면 loader만 한 번 부른다', async () => {
		const loader = vi.fn().mockResolvedValue({ default: 'ok' });
		await expect(loadWithRetry(loader, { retry: false })).resolves.toEqual({ default: 'ok' });
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('재시도에서 loader가 성공하면(테스트 목) 그대로 쓴다', async () => {
		const loader = vi.fn().mockResolvedValue({ default: 'ok' });
		await expect(loadWithRetry(loader, { retry: true })).resolves.toEqual({ default: 'ok' });
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('재시도에서 같은 import가 캐시로 다시 실패하면 쿼리를 붙인 URL로 다시 불러온다', async () => {
		const url = 'http://127.0.0.1:8789/_app/immutable/chunks/ToastGroup.ABC.js';
		const loader = vi
			.fn()
			.mockRejectedValue(new Error(`Failed to fetch dynamically imported module: ${url}`));
		const importUrl = vi.fn().mockResolvedValue({ default: 'fresh' });
		const result = await loadWithRetry(loader, { retry: true, now: 99, importUrl });
		expect(result).toEqual({ default: 'fresh' });
		expect(importUrl).toHaveBeenCalledTimes(1);
		expect(String(importUrl.mock.calls[0][0])).toContain('t=99');
		expect(String(importUrl.mock.calls[0][0])).toContain('ToastGroup.ABC.js');
	});
});
