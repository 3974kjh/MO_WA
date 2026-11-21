import { describe, expect, it } from 'vitest';
import { validateCorrectionInput, validateCorrectionReason } from './correction';

describe('BE-19 correction reason (R-VAL-P11)', () => {
	it('allows reason of 1–120 chars', () => {
		expect(validateCorrectionReason('a').ok).toBe(true);
		expect(validateCorrectionReason('x'.repeat(120)).ok).toBe(true);
	});

	it('121 chars is ERROR', () => {
		const r = validateCorrectionReason('x'.repeat(121));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.ruleId).toBe('R-VAL-P11');
	});

	it('newline is ERROR', () => {
		expect(validateCorrectionReason('line1\nline2').ok).toBe(false);
		expect(validateCorrectionReason('line1\rline2').ok).toBe(false);
	});

	it('trims surrounding whitespace for length check', () => {
		const r = validateCorrectionReason('  ok  ');
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.reason).toBe('ok');
	});
});

describe('BE-19 correction input', () => {
	it('accepts a full valid correction payload', () => {
		const r = validateCorrectionInput({
			qty: 10,
			currency: 'USD',
			avg_price: 100.1234,
			reason: '평단 달러로 정정',
			base_version: 2,
			assetType: 'etf'
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.avg_price).toBe(100.1234); // D-4 keep 4 decimals
			expect(r.base_version).toBe(2);
		}
	});

	it('R-VAL-M03 rejects fractional stock qty', () => {
		const r = validateCorrectionInput({
			qty: 1.5,
			currency: 'KRW',
			avg_price: 100,
			reason: '수량 정정',
			assetType: 'stock'
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.ruleId).toBe('R-VAL-M03');
	});
});
