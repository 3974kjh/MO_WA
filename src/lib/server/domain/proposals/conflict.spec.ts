import { describe, expect, it } from 'vitest';
import { versionFieldsForClient, wouldConflict } from './conflict';

describe('BE-11 conflict / would_conflict', () => {
	it('would_conflict when approval_version ≠ base_version', () => {
		expect(wouldConflict(1, 2)).toBe(true);
		expect(wouldConflict(3, 3)).toBe(false);
		expect(wouldConflict(null, 1)).toBe(false);
	});

	it('exposes base_version, approval_version, would_conflict for client blocking', () => {
		expect(versionFieldsForClient(1, 2)).toEqual({
			base_version: 1,
			approval_version: 2,
			would_conflict: true
		});
		expect(versionFieldsForClient(5, 5).would_conflict).toBe(false);
	});
});
