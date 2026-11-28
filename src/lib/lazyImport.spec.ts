import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	RELOAD_GUARD_KEY,
	RELOAD_GUARD_MS,
	isChunkLoadError,
	isStaleDeploy,
	lazyImport,
	recoverFromChunkError,
	reloadOnce
} from './lazyImport';

const URL_404 = 'http://127.0.0.1/_app/immutable/chunks/Old1.js';
const chunkErr = () => new TypeError(`Failed to fetch dynamically imported module: ${URL_404}`);
const res = (status: number) => Promise.resolve({ status } as Response);

function memStore() {
	const m = new Map<string, string>();
	return {
		getItem: (k: string) => m.get(k) ?? null,
		setItem: (k: string, v: string) => void m.set(k, v)
	};
}

afterEach(() => vi.restoreAllMocks());

describe('isChunkLoadError', () => {
	it('Chrome·Firefox·Safari 문구를 알아본다', () => {
		expect(isChunkLoadError(chunkErr())).toBe(true);
		expect(isChunkLoadError(new Error('error loading dynamically imported module: x'))).toBe(true);
		expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
		expect(isChunkLoadError(new Error('boom'))).toBe(false);
	});
});

describe('isStaleDeploy', () => {
	it('청크 URL이 404/410이면 옛 배포', async () => {
		expect(await isStaleDeploy(chunkErr(), () => res(404))).toBe(true);
		expect(await isStaleDeploy(chunkErr(), () => res(410))).toBe(true);
	});
	it('200이거나 요청이 실패(오프라인)하거나 URL을 모르면 아니다', async () => {
		expect(await isStaleDeploy(chunkErr(), () => res(200))).toBe(false);
		expect(await isStaleDeploy(chunkErr(), () => Promise.reject(new TypeError('offline')))).toBe(
			false
		);
		const fetchFn = vi.fn();
		expect(await isStaleDeploy(new Error('Importing a module script failed.'), fetchFn)).toBe(
			false
		);
		expect(fetchFn).not.toHaveBeenCalled();
	});
});

describe('reloadOnce / recoverFromChunkError', () => {
	it('60초 가드 안에서는 한 번만 새로고침하고, 가드 시간이 지나면 다시 허용한다', () => {
		const storage = memStore();
		const reload = vi.fn();
		let now = 1_000_000;
		const deps = { storage, reload, now: () => now };
		expect(reloadOnce(deps)).toBe(true);
		expect(storage.getItem(RELOAD_GUARD_KEY)).toBe('1000000');
		expect(reloadOnce(deps)).toBe(false);
		now += RELOAD_GUARD_MS + 1;
		expect(reloadOnce(deps)).toBe(true);
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('저장소를 못 쓰면 새로고침하지 않는다(무한 루프 방지)', () => {
		const reload = vi.fn();
		expect(reloadOnce({ storage: null, reload })).toBe(false);
		expect(reload).not.toHaveBeenCalled();
	});

	it('404면 reloading, 두 번째는 가드로 failed', async () => {
		const storage = memStore();
		const reload = vi.fn();
		const deps = { storage, reload, fetchFn: () => res(404) };
		expect(await recoverFromChunkError(chunkErr(), deps)).toBe('reloading');
		expect(await recoverFromChunkError(chunkErr(), deps)).toBe('failed');
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('일시 실패(200·오프라인)나 다른 오류는 새로고침하지 않고 failed', async () => {
		const reload = vi.fn();
		const storage = memStore();
		expect(
			await recoverFromChunkError(chunkErr(), { storage, reload, fetchFn: () => res(200) })
		).toBe('failed');
		expect(await recoverFromChunkError(new Error('boom'), { storage, reload })).toBe('failed');
		expect(reload).not.toHaveBeenCalled();
	});
});

describe('lazyImport', () => {
	it('성공한 로드는 기억하고 로더를 한 번만 부른다', async () => {
		const loader = vi.fn().mockResolvedValue({ default: 1 });
		const l = lazyImport(loader, { recover: vi.fn() });
		await Promise.all([l.load(), l.load()]);
		await l.load();
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('실패한 약속은 기억하지 않는다 — 다음 load()가 다시 시도해 성공할 수 있다', async () => {
		const loader = vi.fn().mockRejectedValueOnce(chunkErr()).mockResolvedValue({ default: 2 });
		const recover = vi.fn().mockResolvedValue('failed');
		const l = lazyImport(loader, { recover });
		await expect(l.load()).rejects.toThrow('Failed to fetch');
		await expect(l.load()).resolves.toEqual({ default: 2 });
		expect(loader).toHaveBeenCalledTimes(2);
		expect(recover).toHaveBeenCalledTimes(1);
	});

	it('silent(유휴 미리 불러오기) 실패는 복구(새로고침)를 걸지 않는다', async () => {
		const recover = vi.fn();
		const l = lazyImport(() => Promise.reject(chunkErr()), { recover });
		await expect(l.load({ silent: true })).rejects.toThrow();
		await Promise.resolve();
		expect(recover).not.toHaveBeenCalled();
	});

	it('유휴 미리 불러오기가 진행 중일 때 사용자가 이어받아도 실패하면 복구를 건다', async () => {
		let fail!: (e: unknown) => void;
		const recover = vi.fn();
		const l = lazyImport(() => new Promise((_, rej) => (fail = rej)), { recover });
		const idle = l.load({ silent: true });
		const user = l.load();
		fail(chunkErr());
		await expect(idle).rejects.toThrow();
		await expect(user).rejects.toThrow();
		await Promise.resolve();
		expect(recover).toHaveBeenCalledTimes(1);
	});
});
