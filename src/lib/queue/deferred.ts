/**
 * G-2 되돌리기(5초) — 반영·고쳐서 반영·기록 수정 확인 뒤 요청을 5초 늦게 보낸다.
 * - 5초 안에 cancel(되돌리기)하면 run을 부르지 않는다(서버 되돌리기 RPC는 없다).
 * - 탭 닫기·이동(pagehide만. beforeunload는 bfcache를 막을 수 있어 쓰지 않는다)이나 dispose 때 남은 예약은 보내지 않고 버린다.
 * - 거절은 여기를 쓰지 않는다(확인 뒤 즉시).
 */
export const UNDO_GRACE_MS = 5000;

type Listener = (e: Event) => void;
export type DeferTarget = {
	addEventListener: (type: string, fn: Listener) => void;
	removeEventListener: (type: string, fn: Listener) => void;
};

export type DeferredHandle = {
	/** 되돌리기: 아직 보내지 않았으면 취소하고 true */
	cancel: () => boolean;
	readonly settled: boolean;
};

type Entry = {
	timer: ReturnType<typeof setTimeout>;
	onDrop?: () => void;
};

export function createDeferredSender(opts: { delayMs?: number; target?: DeferTarget | null } = {}) {
	const delay = opts.delayMs ?? UNDO_GRACE_MS;
	const target =
		opts.target === undefined ? (typeof window !== 'undefined' ? window : null) : opts.target;
	const pending = new Map<number, Entry>();
	let seq = 0;

	const dropAll = () => {
		for (const [id, e] of pending) {
			clearTimeout(e.timer);
			pending.delete(id);
			e.onDrop?.();
		}
	};
	const onLeave: Listener = () => dropAll();
	target?.addEventListener('pagehide', onLeave);

	return {
		/** run은 delay 뒤 한 번만. onDrop은 이동·닫기로 버려졌을 때(되돌리기 cancel 때는 부르지 않음). */
		schedule(run: () => void, onDrop?: () => void): DeferredHandle {
			const id = ++seq;
			let settled = false;
			const timer = setTimeout(() => {
				if (!pending.has(id)) return;
				pending.delete(id);
				settled = true;
				run();
			}, delay);
			pending.set(id, { timer, onDrop });
			return {
				cancel() {
					const e = pending.get(id);
					if (!e) return false;
					clearTimeout(e.timer);
					pending.delete(id);
					settled = true;
					return true;
				},
				get settled() {
					return settled || !pending.has(id);
				}
			};
		},
		/** 화면을 떠날 때: 남은 예약은 보내지 않는다. */
		dropAll,
		get size() {
			return pending.size;
		},
		dispose() {
			dropAll();
			target?.removeEventListener('pagehide', onLeave);
		}
	};
}

export type DeferredSender = ReturnType<typeof createDeferredSender>;
