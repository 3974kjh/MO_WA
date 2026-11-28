import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataPathFor, observeDataResponse } from './dataSignal';

describe('dataPathFor', () => {
	it('SvelteKit 데이터 경로 규칙과 같다', () => {
		expect(dataPathFor('/')).toBe('/__data.json');
		expect(dataPathFor('/stocks')).toBe('/stocks/__data.json');
		expect(dataPathFor('/stocks/005930/')).toBe('/stocks/005930/__data.json');
	});
});

class FakeObserver {
	static last: FakeObserver | null = null;
	disconnected = false;
	constructor(private cb: (l: { getEntries(): { name: string }[] }) => void) {
		FakeObserver.last = this;
	}
	observe = vi.fn();
	disconnect() {
		this.disconnected = true;
	}
	emit(...names: string[]) {
		this.cb({ getEntries: () => names.map((name) => ({ name })) });
	}
}

afterEach(() => vi.unstubAllGlobals());

describe('observeDataResponse', () => {
	it('목적지 __data.json 항목이 나타나면 한 번 알린다(쿼리 무시, 다른 경로는 무시)', () => {
		vi.stubGlobal('PerformanceObserver', FakeObserver);
		vi.stubGlobal('location', { href: 'https://x.test/' });
		const hit = vi.fn();
		observeDataResponse('/stocks', hit);
		const o = FakeObserver.last!;
		expect(o.observe).toHaveBeenCalledWith({ type: 'resource' });
		o.emit('https://x.test/portfolio/__data.json', 'https://x.test/_app/immutable/a.js');
		expect(hit).not.toHaveBeenCalled();
		o.emit('https://x.test/stocks/__data.json?x-sveltekit-invalidated=01');
		expect(hit).toHaveBeenCalledTimes(1);
	});

	it('해제하면 관측을 끊는다', () => {
		vi.stubGlobal('PerformanceObserver', FakeObserver);
		const stop = observeDataResponse('/', () => {});
		stop();
		expect(FakeObserver.last!.disconnected).toBe(true);
	});

	it('PerformanceObserver가 없거나 observe가 던져도 조용히 무동작', () => {
		vi.stubGlobal('PerformanceObserver', undefined);
		expect(() => observeDataResponse('/', () => {})()).not.toThrow();
		vi.stubGlobal(
			'PerformanceObserver',
			class {
				observe() {
					throw new Error('unsupported');
				}
			}
		);
		expect(() => observeDataResponse('/', () => {})()).not.toThrow();
	});
});
