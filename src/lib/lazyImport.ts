/**
 * 지연 import() 공용 처리. 새 배포 직후 열려 있던 탭은 옛 해시 청크를 404로 받는다.
 * - lazyImport: 같은 로더는 한 번만 부르되, 실패한 약속은 기억하지 않는다(다음 호출이 다시 시도).
 * - recoverFromChunkError: 청크 URL이 404(옛 배포)로 확인될 때만, 세션당 한 번 전체 새로고침한다.
 *   오프라인·차단 같은 일시 실패는 새로고침하지 않고 호출부가 안내(재시도 UI)를 보여 준다.
 * 같은 specifier 재시도는 브라우저가 실패를 캐시해 소용없다(dynamicImportRetry.ts 머리말). 복구는 새로고침이다.
 * 유휴 미리 불러오기(idleImport)는 사용자가 한 일이 아니므로 새로고침하지 않는다(silent).
 */
import { failedImportUrl } from '$lib/components/ui/dynamicImportRetry';
import { toast } from '$lib/components/ui/toast.svelte';

export const RELOAD_GUARD_KEY = 'mowa:chunk-reload-at';
/** 같은 탭에서 이 시간 안에 이미 새로고침했으면 다시 하지 않는다(무한 새로고침 방지) */
export const RELOAD_GUARD_MS = 60_000;

const CHUNK_ERROR_RE =
	/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isChunkLoadError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return CHUNK_ERROR_RE.test(msg);
}

export interface RecoverDeps {
	fetchFn?: typeof fetch;
	storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
	now?: () => number;
	reload?: () => void;
}

function defaultStorage(): RecoverDeps['storage'] {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage;
	} catch {
		return null;
	}
}

/** 청크 URL이 서버에서 404/410이면 옛 배포. 요청 자체가 실패(오프라인)하거나 URL을 모르면 false. */
export async function isStaleDeploy(err: unknown, fetchFn: typeof fetch = fetch): Promise<boolean> {
	const url = failedImportUrl(err);
	if (!url) return false;
	try {
		const res = await fetchFn(url, { method: 'HEAD', cache: 'no-store' });
		return res.status === 404 || res.status === 410;
	} catch {
		return false;
	}
}

/** 가드를 통과하면 true(새로고침을 부름), 이미 최근에 했으면 false. */
export function reloadOnce(deps: RecoverDeps = {}): boolean {
	const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
	const now = (deps.now ?? Date.now)();
	if (!storage) return false;
	try {
		const prev = Number(storage.getItem(RELOAD_GUARD_KEY));
		if (prev && now - prev < RELOAD_GUARD_MS) return false;
		storage.setItem(RELOAD_GUARD_KEY, String(now));
	} catch {
		return false;
	}
	(deps.reload ?? (() => location.reload()))();
	return true;
}

/** 'reloading': 옛 배포로 확인돼 새로고침을 불렀다. 'failed': 호출부가 오류 UI를 보여 줘야 한다. */
export async function recoverFromChunkError(
	err: unknown,
	deps: RecoverDeps = {}
): Promise<'reloading' | 'failed'> {
	if (!isChunkLoadError(err)) return 'failed';
	if (!(await isStaleDeploy(err, deps.fetchFn))) return 'failed';
	return reloadOnce(deps) ? 'reloading' : 'failed';
}

export interface LazyImport<T> {
	/** silent: 유휴 미리 불러오기용. 실패해도 새로고침하지 않는다. */
	load(opts?: { silent?: boolean }): Promise<T>;
}

export function lazyImport<T>(
	loader: () => Promise<T>,
	deps: RecoverDeps & { recover?: typeof recoverFromChunkError } = {}
): LazyImport<T> {
	let pending: Promise<T> | null = null;
	return {
		load(opts = {}) {
			if (!pending) {
				const p = loader();
				pending = p;
				// 실패한 약속은 기억하지 않는다: 다음 load()가 로더를 다시 부른다
				p.catch(() => {
					if (pending === p) pending = null;
				});
			}
			// 사용자가 시킨 호출만 복구(새로고침)를 건다. 이미 진행 중인 유휴 미리 불러오기를 이어받아도 마찬가지
			if (!opts.silent)
				pending.catch((err) => void (deps.recover ?? recoverFromChunkError)(err, deps));
			return pending;
		}
	};
}

/** 사용자가 시킨 일(더보기·정확한 금액 등)의 청크가 끝내 안 왔을 때: 조용히 죽지 않고 안내와 새로고침을 준다. */
export function notifyChunkFailed(message: string): void {
	toast.show(message, {
		tone: 'err',
		duration: 8000,
		action: { label: '새로고침', onclick: () => location.reload() }
	});
}
