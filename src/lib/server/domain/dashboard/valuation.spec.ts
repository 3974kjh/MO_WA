import { describe, expect, it } from 'vitest';
import { computeDashboardValuation } from './valuation';

describe('BE-11 dashboard valuation', () => {
	it('sums approved holdings × latest price with usdkrw FX', () => {
		const result = computeDashboardValuation({
			positions: [
				{ id: 'p1', qty: 10, currency: 'KRW', status: 'holding' },
				{ id: 'p2', qty: 2, currency: 'USD', status: 'holding' },
				{ id: 'p3', qty: 5, currency: 'KRW', status: 'planned' }
			],
			latestByInstrument: new Map([
				['i1', { instrument_id: 'i1', close: 1000, currency: 'KRW', as_of: '2026-11-20' }],
				['i2', { instrument_id: 'i2', close: 50.25, currency: 'USD', as_of: '2026-11-20' }]
			]),
			positionInstrument: new Map([
				['p1', 'i1'],
				['p2', 'i2'],
				['p3', 'i1']
			]),
			usdkrw: { value: 1300, as_of: '2026-11-20' }
		});
		expect(result.totalKrw).toBe(10 * 1000 + 2 * 50.25 * 1300);
		expect(result.positions).toHaveLength(2);
	});

	it('does not invent remaining-days; planned excluded', () => {
		const result = computeDashboardValuation({
			positions: [{ id: 'p', qty: 1, currency: 'KRW', status: 'planned' }],
			latestByInstrument: new Map(),
			positionInstrument: new Map([['p', 'i']]),
			usdkrw: null
		});
		expect(result.totalKrw).toBeNull();
		expect(result.positions).toHaveLength(0);
	});
});
