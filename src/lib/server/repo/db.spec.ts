import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import { fromRepo } from './db';

describe('fromRepo owner_id forcing', () => {
	it('forces .eq(owner_id) on select/update/delete for owner-scoped tables', () => {
		const eqCalls: Array<[string, string]> = [];
		const terminal = {
			eq(col: string, val: string) {
				eqCalls.push([col, val]);
				return this;
			},
			then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
				return Promise.resolve({ data: [], error: null }).then(onFulfilled);
			}
		};
		const fakeDb = {
			from: () => ({
				select: () => ({ ...terminal, eq: terminal.eq.bind(terminal) }),
				update: () => ({ ...terminal, eq: terminal.eq.bind(terminal) }),
				delete: () => ({ ...terminal, eq: terminal.eq.bind(terminal) }),
				insert: () => terminal
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-xyz');

		fromRepo(repo, 'reports').select('*');
		fromRepo(repo, 'positions').update({}).eq('id', 'x');
		fromRepo(repo, 'journal_entries').delete();

		const ownerEqs = eqCalls.filter(([c]) => c === 'owner_id');
		expect(ownerEqs.length).toBeGreaterThanOrEqual(3);
		expect(ownerEqs.every(([, v]) => v === 'owner-xyz')).toBe(true);
	});

	it('does not force owner_id on market_indicator_keys (no-owner table)', () => {
		const eqCalls: Array<[string, string]> = [];
		const terminal = {
			eq(col: string, val: string) {
				eqCalls.push([col, val]);
				return this;
			}
		};
		const fakeDb = {
			from: () => ({
				select: () => terminal
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-xyz');
		fromRepo(repo, 'market_indicator_keys').select('*');
		expect(eqCalls.filter(([c]) => c === 'owner_id')).toEqual([]);
	});
});
