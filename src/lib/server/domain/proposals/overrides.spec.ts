import { describe, expect, it } from 'vitest';
import {
	allowedOverrideKeys,
	assertNoRemainingDaysField,
	isApprovedEdited,
	mergeAppliedValues,
	validateOverrides
} from './overrides';

describe('BE-11 override allowlist', () => {
	it('allows qty/avg_price/currency for open_holding', () => {
		expect(allowedOverrideKeys('open_holding')).toEqual(['qty', 'avg_price', 'currency']);
	});

	it('allows currency on set_qty_avg only for user proposals', () => {
		expect(allowedOverrideKeys('set_qty_avg', 'bot')).toEqual(['qty', 'avg_price']);
		expect(allowedOverrideKeys('set_qty_avg', 'user')).toEqual(['qty', 'avg_price', 'currency']);
	});

	it('allows no overrides for close', () => {
		expect(allowedOverrideKeys('close')).toEqual([]);
		const bad = validateOverrides({
			changeType: 'close',
			overrides: { qty: 1 }
		});
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.ruleId).toBe('R-PERM-13');
	});

	it('R-VAL-P07: direct-write fields are ERROR', () => {
		for (const key of ['trigger_price', 'trigger_direction', 'breakeven', 'watch_only']) {
			const r = validateOverrides({
				changeType: 'set_qty_avg',
				overrides: { [key]: 1 }
			});
			expect(r.ok, key).toBe(false);
			if (!r.ok) {
				expect(r.ruleId).toBe('R-VAL-P07');
				expect(r.key).toBe(key);
			}
		}
	});

	it('R-VAL-M03: stock fractional qty ERROR', () => {
		const r = validateOverrides({
			changeType: 'set_qty_avg',
			overrides: { qty: 1.5 },
			assetType: 'stock'
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.ruleId).toBe('R-VAL-M03');
	});

	it('R-VAL-M03: cash 3 decimals ERROR; 2 decimals ok', () => {
		expect(
			validateOverrides({
				changeType: 'open_holding',
				overrides: { qty: 1000.505 },
				assetType: 'cash'
			}).ok
		).toBe(false);
		expect(
			validateOverrides({
				changeType: 'open_holding',
				overrides: { qty: 1000.5, avg_price: 1, currency: 'KRW' },
				assetType: 'cash'
			}).ok
		).toBe(true);
	});

	it('D-4: keeps 4-decimal avg_price (does not round to 2)', () => {
		const r = validateOverrides({
			changeType: 'set_qty_avg',
			overrides: { avg_price: 100.1234 }
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.overrides.avg_price).toBe(100.1234);
	});

	it('merges overrides into proposed_values for applied_values', () => {
		const applied = mergeAppliedValues({ qty: 10, avg_price: 100 }, { qty: 12 });
		expect(applied).toEqual({ qty: 12, avg_price: 100 });
		expect(isApprovedEdited({ qty: 10 }, { qty: 12 })).toBe(true);
		expect(isApprovedEdited({ qty: 10 }, { qty: 10 })).toBe(false);
	});

	it('isApprovedEdited: 키 순서만 다르면 수정 아님, 값·키가 다르면 수정 (B1 L-4)', () => {
		expect(isApprovedEdited({ qty: 10, avg_price: 100.5 }, { avg_price: 100.5, qty: 10 })).toBe(
			false
		);
		expect(
			isApprovedEdited(
				{ qty: 10, meta: { a: 1, b: [1, { y: 2, x: 1 }] } },
				{ meta: { b: [1, { x: 1, y: 2 }], a: 1 }, qty: 10 }
			)
		).toBe(false);
		expect(isApprovedEdited({ qty: 10, avg_price: 100 }, { avg_price: 101, qty: 10 })).toBe(true);
		expect(isApprovedEdited({ qty: 10 }, { qty: 10, currency: 'USD' })).toBe(true);
		expect(isApprovedEdited({ b: [1, 2] }, { b: [2, 1] })).toBe(true);
		expect(isApprovedEdited(null, { qty: 1 })).toBe(false);
	});

	it('refuses remaining-days style fields on payloads', () => {
		expect(() => assertNoRemainingDaysField({ remaining_days: 3 })).toThrow(/remaining/);
		expect(() => assertNoRemainingDaysField({ display_id: 'P-0001' })).not.toThrow();
	});
});
