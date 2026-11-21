import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import { listReports, getReportById } from './reports.repo';
import { listPositions } from './positions.repo';
import { listJournalEntries } from './journal.repo';
import { listInstruments } from './instruments.repo';
import { listPositionProposals, getPositionProposalByDisplayId } from './proposals.repo';

function mockDbTrackingOwnerEq() {
	const eqCalls: Array<[string, string]> = [];
	const terminal = {
		then: undefined as undefined,
		data: [],
		error: null,
		maybeSingle: async () => ({ data: null, error: null }),
		single: async () => ({ data: null, error: null }),
		is: function (this: unknown) {
			return this;
		},
		eq: function (this: Record<string, unknown>, col: string, val: string) {
			eqCalls.push([col, val]);
			return this;
		},
		select: function (this: unknown) {
			return this;
		}
	};
	// Make thenable so `await q` resolves
	const builder = {
		...terminal,
		then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
			return Promise.resolve({ data: [], error: null }).then(onFulfilled);
		}
	};
	const db = {
		from: () => ({
			select: () => builder,
			insert: () => builder,
			update: () => builder
		})
	};
	return { db: db as never, eqCalls };
}

describe('repo owner_id filter on every read path', () => {
	it('list/get helpers always .eq(owner_id, …)', async () => {
		const { db, eqCalls } = mockDbTrackingOwnerEq();
		const repo = forUser(db, 'owner-xyz');

		await listReports(repo);
		await listPositions(repo);
		await listJournalEntries(repo);
		await listInstruments(repo);
		await listPositionProposals(repo);
		await getReportById(repo, 'r1');
		await getPositionProposalByDisplayId(repo, 'P-0412');

		const ownerEqs = eqCalls.filter(([col]) => col === 'owner_id');
		expect(ownerEqs.length).toBeGreaterThanOrEqual(7);
		expect(ownerEqs.every(([, v]) => v === 'owner-xyz')).toBe(true);
	});
});
