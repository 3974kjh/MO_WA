import { describe, expect, it } from 'vitest';
import { formatOwnerDisplayId, isOwnerDisplayId, parseOwnerDisplayId } from './displayId';

describe('owner display_id (server string)', () => {
	it('accepts P- / R- owner-scoped forms only', () => {
		expect(isOwnerDisplayId('P-0412')).toBe(true);
		expect(isOwnerDisplayId('R-0001')).toBe(true);
		expect(isOwnerDisplayId('P-10000')).toBe(true);
		expect(isOwnerDisplayId('PP-0412')).toBe(false);
		expect(isOwnerDisplayId('P-12')).toBe(false);
		expect(isOwnerDisplayId('uuid-prefix')).toBe(false);
	});

	it('formats like mowa_display_id', () => {
		expect(formatOwnerDisplayId('P', 412)).toBe('P-0412');
		expect(formatOwnerDisplayId('R', 1)).toBe('R-0001');
		expect(formatOwnerDisplayId('P', 10000)).toBe('P-10000');
	});

	it('parses server strings', () => {
		expect(parseOwnerDisplayId('P-0412')).toEqual({ prefix: 'P', displayNo: 412 });
		expect(parseOwnerDisplayId('PP-1')).toBeNull();
	});
});
