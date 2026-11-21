import { describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';
import { shouldFlushOnKey } from './searchKeys';

describe('SearchBox Enter 처리', () => {
	it('Enter && !isComposing이면 flush', () => {
		expect(shouldFlushOnKey({ key: 'Enter', isComposing: false })).toBe(true);
	});
	it('조합 중 Enter·다른 키는 flush하지 않음', () => {
		expect(shouldFlushOnKey({ key: 'Enter', isComposing: true })).toBe(false);
		expect(shouldFlushOnKey({ key: 'a', isComposing: false })).toBe(false);
	});
	it('디바운스 대기 중 입력은 Enter에서만 즉시 전송', () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const emit = debounce(fn, 200);
		const key = (e: { key: string; isComposing: boolean }) => {
			if (shouldFlushOnKey(e)) emit.flush();
		};
		emit('한');
		key({ key: 'Enter', isComposing: true });
		expect(fn).not.toHaveBeenCalled();
		key({ key: 'Enter', isComposing: false });
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith('한');
		vi.advanceTimersByTime(500);
		expect(fn).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});
});
