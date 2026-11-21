import { describe, expect, it } from 'vitest';
import { forUser, stripClientIdentity } from './client';
import { createPosition, updatePosition } from './positions.repo';
import { createReport } from './reports.repo';
import { createPositionProposal } from './proposals.repo';

function mockWriteCapture() {
	const writes: { op: string; payload: unknown }[] = [];
	const chain = {
		select() {
			return this;
		},
		eq() {
			return this;
		},
		single: async () => ({ data: writes.at(-1)?.payload ?? null, error: null })
	};
	const fakeDb = {
		from: () => ({
			insert: (payload: unknown) => {
				writes.push({ op: 'insert', payload });
				return chain;
			},
			update: (payload: unknown) => {
				writes.push({ op: 'update', payload });
				return chain;
			}
		})
	} as never;
	return { fakeDb, writes };
}

describe('status is domain field on positions/reports; stripped on proposals', () => {
	it('createPosition / createReport keep status in the insert payload', async () => {
		const { fakeDb, writes } = mockWriteCapture();
		const repo = forUser(fakeDb, 'owner-1');

		await createPosition(repo, {
			instrument_id: 'inst-1',
			status: 'holding',
			currency: 'KRW',
			qty: 1
		});
		expect(writes[0]?.op).toBe('insert');
		expect((writes[0]?.payload as { status: string }).status).toBe('holding');

		await createReport(repo, {
			kind: 'daily_brief',
			slug: 's',
			title: 't',
			report_date: '2026-01-01',
			body_md: 'b',
			domain: 'macro',
			status: 'draft'
		} as never);
		expect((writes[1]?.payload as { status: string }).status).toBe('draft');
	});

	it('updatePosition({status:"closed"}) actually sends status', async () => {
		const { fakeDb, writes } = mockWriteCapture();
		const repo = forUser(fakeDb, 'owner-1');
		await updatePosition(repo, 'pos-1', { status: 'closed' });
		expect(writes[0]?.op).toBe('update');
		expect(writes[0]?.payload).toEqual({ status: 'closed' });
	});

	it('proposals still strip status', async () => {
		expect(
			stripClientIdentity(
				{ change_type: 'open_holding', status: 'approved', client_ref: 'c' },
				'position_proposals'
			)
		).toEqual({ change_type: 'open_holding', client_ref: 'c' });

		const { fakeDb, writes } = mockWriteCapture();
		const repo = forUser(fakeDb, 'owner-1');
		await createPositionProposal(repo, {
			change_type: 'open_holding',
			status: 'approved',
			client_ref: 'c1'
		} as never);
		expect(writes[0]?.op).toBe('insert');
		expect('status' in (writes[0]?.payload as object)).toBe(false);
	});
});
