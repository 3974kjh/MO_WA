import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';
import { SEARCH_DEBOUNCE_MS } from './listQuery';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('FE-10 검색 디바운스', () => {
	it('검색 디바운스는 200ms', () => {
		expect(SEARCH_DEBOUNCE_MS).toBe(200);
	});
	it('마지막 입력 뒤 200ms가 지나야 한 번만, 마지막 값으로 실행', () => {
		const fn = vi.fn();
		const d = debounce(fn, SEARCH_DEBOUNCE_MS);
		d('삼');
		vi.advanceTimersByTime(150);
		d('삼성');
		vi.advanceTimersByTime(199);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith('삼성');
	});
	it('cancel이면 실행하지 않는다(화면을 떠날 때)', () => {
		const fn = vi.fn();
		const d = debounce(fn, 200);
		d('x');
		d.cancel();
		vi.advanceTimersByTime(1000);
		expect(fn).not.toHaveBeenCalled();
	});
	it('flush는 대기 중인 호출만 즉시 실행', () => {
		const fn = vi.fn();
		const d = debounce(fn, 200);
		d.flush();
		expect(fn).not.toHaveBeenCalled();
		d('y');
		d.flush();
		expect(fn).toHaveBeenCalledWith('y');
		vi.advanceTimersByTime(1000);
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
