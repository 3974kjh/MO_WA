import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import { fromRepo, stampOwnerOnPayload } from './db';

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

	it('stamps owner_id on insert when missing or matching', () => {
		const inserted: unknown[] = [];
		const fakeDb = {
			from: () => ({
				insert: (payload: unknown) => {
					inserted.push(payload);
					return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
				}
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-xyz');

		fromRepo(repo, 'reports').insert({ title: 't' });
		fromRepo(repo, 'reports').insert({ title: 't2', owner_id: 'owner-xyz' });

		expect(inserted[0]).toEqual({ title: 't', owner_id: 'owner-xyz' });
		expect(inserted[1]).toEqual({ title: 't2', owner_id: 'owner-xyz' });
	});

	it('stamps owner_id on upsert and rejects mismatched owner_id', () => {
		const upserted: unknown[] = [];
		const inserted: unknown[] = [];
		const fakeDb = {
			from: () => ({
				upsert: (payload: unknown) => {
					upserted.push(payload);
					return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
				},
				insert: (payload: unknown) => {
					inserted.push(payload);
					return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
				}
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-xyz');

		fromRepo(repo, 'reports').upsert({ title: 'u' });
		expect(upserted[0]).toEqual({ title: 'u', owner_id: 'owner-xyz' });

		expect(() =>
			fromRepo(repo, 'reports').upsert({ title: 'evil', owner_id: 'other-owner' })
		).toThrow(/owner_id mismatch/i);

		expect(() =>
			fromRepo(repo, 'reports').insert({ title: 'evil', owner_id: 'other-owner' })
		).toThrow(/owner_id mismatch/i);
		expect(inserted).toEqual([]);
	});

	it('stampOwnerOnPayload handles arrays', () => {
		expect(stampOwnerOnPayload([{ a: 1 }, { a: 2, owner_id: 'o' }], 'o')).toEqual([
			{ a: 1, owner_id: 'o' },
			{ a: 2, owner_id: 'o' }
		]);
		expect(() => stampOwnerOnPayload([{ owner_id: 'x' }], 'o')).toThrow(/mismatch/i);
	});

	it('does not force owner_id on market_indicator_keys (no-owner table)', () => {
		const eqCalls: Array<[string, string]> = [];
		const inserted: unknown[] = [];
		const terminal = {
			eq(col: string, val: string) {
				eqCalls.push([col, val]);
				return this;
			}
		};
		const fakeDb = {
			from: () => ({
				select: () => terminal,
				insert: (payload: unknown) => {
					inserted.push(payload);
					return terminal;
				}
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-xyz');
		fromRepo(repo, 'market_indicator_keys').select('*');
		fromRepo(repo, 'market_indicator_keys').insert({ key: 'kospi' });
		expect(eqCalls.filter(([c]) => c === 'owner_id')).toEqual([]);
		expect(inserted[0]).toEqual({ key: 'kospi' });
	});
});
