import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleArchive, handleRestore } = vi.hoisted(() => ({
	handleArchive: vi.fn(async () => ({ ok: true })),
	handleRestore: vi.fn(async () => ({ ok: true }))
}));

vi.mock('$lib/server/web/proposalActions', () => ({ handleArchive, handleRestore }));

import { actions } from './+page.server';

const user = { id: 'user-1' };
const supabase = { tag: 'sb' };

function event(fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const request = new Request('http://localhost/journal', { method: 'POST', body });
	return { request, locals: { user, supabase } } as never;
}

function receivedForm(fn: typeof handleArchive): FormData {
	expect(fn).toHaveBeenCalledTimes(1);
	const call = fn.mock.calls[0] as unknown as [unknown, string, FormData];
	expect(call[0]).toBe(supabase);
	expect(call[1]).toBe('user-1');
	return call[2];
}

beforeEach(() => {
	handleArchive.mockClear();
	handleRestore.mockClear();
});

describe('FE-06 매매일지 보관·복원 table 고정', () => {
	it.each(['positions', 'instruments', 'principles', 'anything_else'])(
		'archive는 제출된 table=%s를 무시하고 journal_entries로 보낸다',
		async (table) => {
			await actions.archive!(event({ id: 'j-1', table }));
			const form = receivedForm(handleArchive);
			expect(form.getAll('table')).toEqual(['journal_entries']);
			expect(form.get('id')).toBe('j-1');
		}
	);

	it.each(['positions', 'instruments', 'principles', 'anything_else'])(
		'restore는 제출된 table=%s를 무시하고 journal_entries로 보낸다',
		async (table) => {
			await actions.restore!(event({ id: 'j-1', table }));
			const form = receivedForm(handleRestore);
			expect(form.getAll('table')).toEqual(['journal_entries']);
			expect(form.get('id')).toBe('j-1');
		}
	);

	it('archive·restore는 table이 없을 때도 journal_entries로 보낸다', async () => {
		await actions.archive!(event({ id: 'j-2' }));
		await actions.restore!(event({ id: 'j-2' }));
		expect(receivedForm(handleArchive).getAll('table')).toEqual(['journal_entries']);
		expect(receivedForm(handleRestore).getAll('table')).toEqual(['journal_entries']);
	});

	it('table이 여러 개 들어와도 하나의 journal_entries만 남긴다', async () => {
		const body = new FormData();
		body.set('id', 'j-3');
		body.append('table', 'positions');
		body.append('table', 'instruments');
		const request = new Request('http://localhost/journal', { method: 'POST', body });
		await actions.archive!({ request, locals: { user, supabase } } as never);
		expect(receivedForm(handleArchive).getAll('table')).toEqual(['journal_entries']);
	});
});
