import { describe, expect, it } from 'vitest';
import {
	canonicalJson,
	clientRefContentMatches,
	resolveClientRefConflict
} from './clientRef';
import { forUser } from './client';

describe('R-PERM-11 client_ref content compare', () => {
	it('identical retry (same attempted keys/values) matches existing row', () => {
		const attempted = {
			owner_id: 'o1',
			source_bot_id: 'b1',
			client_ref: 'ref-1',
			title: 'Buy plan',
			kind: 'buy',
			entry_date: '2026-01-01',
			proposed_values: { qty: 10, avg_price: 100 }
		};
		const existing = {
			id: 'uuid-existing',
			owner_id: 'o1',
			source_bot_id: 'b1',
			client_ref: 'ref-1',
			title: 'Buy plan',
			kind: 'buy',
			entry_date: '2026-01-01',
			status: 'pending',
			display_id: 'P-0001',
			display_no: 1,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
			proposed_by_type: 'bot',
			proposed_by: 'b1',
			proposed_values: { avg_price: 100, qty: 10 } // key order differs
		};
		expect(clientRefContentMatches(attempted, existing)).toBe(true);
	});

	it('different top-level content does not match (CONFLICT)', () => {
		const attempted = {
			client_ref: 'ref-1',
			title: 'Buy plan A',
			kind: 'buy'
		};
		const existing = {
			id: 'uuid',
			client_ref: 'ref-1',
			title: 'Buy plan B',
			kind: 'buy',
			status: 'pending'
		};
		expect(clientRefContentMatches(attempted, existing)).toBe(false);
	});

	it('nested-only difference (proposed_values.qty / report_id) does not match', () => {
		const attempted = {
			client_ref: 'ref-1',
			change_type: 'set_qty_avg',
			proposed_values: { qty: 20, avg_price: 100 },
			evidence: [{ report_id: 'r-new' }]
		};
		const existing = {
			id: 'uuid',
			client_ref: 'ref-1',
			change_type: 'set_qty_avg',
			status: 'pending',
			proposed_values: { qty: 10, avg_price: 100 },
			evidence: [{ report_id: 'r-old' }]
		};
		expect(clientRefContentMatches(attempted, existing)).toBe(false);

		// Same nested shape with different report_id only
		expect(
			clientRefContentMatches(
				{ client_ref: 'x', evidence: [{ report_id: 'a' }] },
				{ id: '1', client_ref: 'x', evidence: [{ report_id: 'b' }], status: 'pending' }
			)
		).toBe(false);
	});

	it('canonicalJson sorts nested keys without using a replacer array', () => {
		expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
			canonicalJson({ a: { c: 3, d: 2 }, b: 1 })
		);
		// Nested key not present at top level must still appear
		expect(canonicalJson({ proposed_values: { qty: 1 } })).toContain('"qty"');
	});

	it('resolveClientRefConflict: identical → existing; nested diff → CONFLICT', async () => {
		const existing = {
			id: 'row-1',
			owner_id: 'owner-1',
			client_ref: 'ref-1',
			title: 'T',
			proposed_values: { qty: 10 },
			status: 'pending',
			created_at: '2026-01-01T00:00:00Z'
		};
		const builder = {
			eq() {
				return this;
			},
			select() {
				return this;
			},
			maybeSingle: async () => ({ data: existing, error: null })
		};
		const fakeDb = {
			from: () => ({
				select: () => builder,
				update: () => builder,
				insert: () => builder
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-1');

		const same = await resolveClientRefConflict(repo, 'position_proposals', 'ref-1', {
			client_ref: 'ref-1',
			title: 'T',
			proposed_values: { qty: 10 },
			owner_id: 'owner-1'
		});
		expect(same.error).toBeNull();
		expect(same.data).toEqual(existing);

		const nestedDiff = await resolveClientRefConflict(repo, 'position_proposals', 'ref-1', {
			client_ref: 'ref-1',
			title: 'T',
			proposed_values: { qty: 99 },
			owner_id: 'owner-1'
		});
		expect(nestedDiff.data).toBeNull();
		expect(nestedDiff.error?.message).toMatch(/R-PERM-11.*CONFLICT/i);
	});
});
