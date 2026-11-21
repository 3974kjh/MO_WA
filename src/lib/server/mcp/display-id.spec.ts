import { describe, expect, it } from 'vitest';
import { isOwnerScopedDisplayId, mowaDisplayId } from './display-id';

describe('mowa_display_id', () => {
	it('zero-pads to 4 digits below 10000', () => {
		expect(mowaDisplayId('P', 1)).toBe('P-0001');
		expect(mowaDisplayId('P', 412)).toBe('P-0412');
		expect(mowaDisplayId('R', 1)).toBe('R-0001');
	});

	it('grows width from 10000 without clipping', () => {
		expect(mowaDisplayId('P', 10_000)).toBe('P-10000');
		expect(mowaDisplayId('R', 12_345)).toBe('R-12345');
	});

	it('rejects non P/R prefixes and non-positive n', () => {
		expect(() => mowaDisplayId('PP' as 'P', 1)).toThrow(/prefix/);
		expect(() => mowaDisplayId('P', 0)).toThrow(/positive/);
		expect(() => mowaDisplayId('P', 1.5)).toThrow(/positive/);
	});

	it('isOwnerScopedDisplayId accepts only P-/R-', () => {
		expect(isOwnerScopedDisplayId('P-0412')).toBe(true);
		expect(isOwnerScopedDisplayId('R-0001')).toBe(true);
		expect(isOwnerScopedDisplayId('P-10000')).toBe(true);
		expect(isOwnerScopedDisplayId('PP-0412')).toBe(false);
		expect(isOwnerScopedDisplayId('X-0412')).toBe(false);
	});
});
