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

	it('B1 L-1: avg_price는 소수 4자리까지, 5자리 이상은 R-FMT-13 (문자열 입력 포함)', () => {
		const base = { qty: 10, currency: 'USD', reason: '평단 정정', assetType: 'etf' as const };
		expect(validateCorrectionInput({ ...base, avg_price: 100.1234 }).ok).toBe(true);
		expect(validateCorrectionInput({ ...base, avg_price: '0.0001' }).ok).toBe(true);
		for (const avg of [100.12345, '100.12341', 0.00001, '123.4567891']) {
			const r = validateCorrectionInput({ ...base, avg_price: avg });
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.ruleId).toBe('R-FMT-13');
		}
	});

	it('H-1: 정수부가 커도 소수 4자리 이하는 허용, 5자리와 1.00005는 거부 (정정 경로)', () => {
		const base = { qty: 10, currency: 'KRW', reason: '평단 정정', assetType: 'stock' as const };
		for (const avg of [23090.01, 12517.62, 1350.063, 9481.2658, 9999999.1234]) {
			const r = validateCorrectionInput({ ...base, avg_price: avg });
			expect(r, String(avg)).toEqual(expect.objectContaining({ ok: true, avg_price: avg }));
		}
		for (const avg of [1.00005, 23090.01001, 9999999.12345]) {
			const r = validateCorrectionInput({ ...base, avg_price: avg });
			expect(r.ok, String(avg)).toBe(false);
			if (!r.ok) expect(r.ruleId).toBe('R-FMT-13');
		}
	});
});
