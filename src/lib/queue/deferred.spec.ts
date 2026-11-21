import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferredSender, UNDO_GRACE_MS } from './deferred';

describe('G-2 5초 유예 전송', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('5초가 지나야 한 번 보낸다', () => {
		const target = new EventTarget();
		const s = createDeferredSender({ target });
		const run = vi.fn();
		s.schedule(run);
		vi.advanceTimersByTime(UNDO_GRACE_MS - 1);
		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(run).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(UNDO_GRACE_MS * 2);
		expect(run).toHaveBeenCalledTimes(1);
		expect(UNDO_GRACE_MS).toBe(5000);
	});

	it('되돌리기(cancel)면 보내지 않는다', () => {
		const s = createDeferredSender({ target: new EventTarget() });
		const run = vi.fn();
		const h = s.schedule(run);
		vi.advanceTimersByTime(4000);
		expect(h.cancel()).toBe(true);
		vi.advanceTimersByTime(5000);
		expect(run).not.toHaveBeenCalled();
		expect(h.cancel()).toBe(false);
	});

	it.each(['pagehide', 'beforeunload'])('%s면 남은 요청을 보내지 않고 버린다', (type) => {
		const target = new EventTarget();
		const s = createDeferredSender({ target });
		const run = vi.fn();
		const dropped = vi.fn();
		s.schedule(run, dropped);
		target.dispatchEvent(new Event(type));
		vi.advanceTimersByTime(UNDO_GRACE_MS * 2);
		expect(run).not.toHaveBeenCalled();
		expect(dropped).toHaveBeenCalledTimes(1);
		expect(s.size).toBe(0);
	});

	it('dispose(화면 떠남)도 보내지 않고, 이벤트 리스너를 뗀다', () => {
		const target = new EventTarget();
		const remove = vi.spyOn(target, 'removeEventListener');
		const s = createDeferredSender({ target });
		const run = vi.fn();
		s.schedule(run);
		s.dispose();
		vi.advanceTimersByTime(UNDO_GRACE_MS);
		expect(run).not.toHaveBeenCalled();
		expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function));
		expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
	});
});
