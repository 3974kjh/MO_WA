import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleRestore } = vi.hoisted(() => ({
	handleRestore: vi.fn(async () => ({ ok: true }))
}));

vi.mock('$lib/server/web/proposalActions', () => ({ handleRestore }));

import { actions } from './+page.server';

const user = { id: 'user-1' };
const supabase = { tag: 'sb' };

function event(fields: Array<[string, string]>) {
	const body = new FormData();
	for (const [k, v] of fields) body.append(k, v);
	const request = new Request('http://localhost/archive', { method: 'POST', body });
	return { request, locals: { user, supabase } } as never;
}

beforeEach(() => handleRestore.mockClear());

describe('FE-08 보관함 restore 액션', () => {
	it.each(['reports', 'journal_entries', 'positions', 'instruments', 'decisions', 'events'])(
		'6개 유형(%s)은 그 table 그대로 공유 handleRestore로 넘긴다(고정하지 않음)',
		async (table) => {
			const out = await actions.restore!(
				event([
					['id', 'row-1'],
					['table', table]
				])
			);
			expect(out).toEqual({ ok: true });
			expect(handleRestore).toHaveBeenCalledTimes(1);
			const [sb, ownerId, form] = handleRestore.mock.calls[0] as unknown as [
				unknown,
				string,
				FormData
			];
			expect(sb).toBe(supabase);
			expect(ownerId).toBe('user-1');
			expect(form.getAll('table')).toEqual([table]);
			expect(form.get('id')).toBe('row-1');
		}
	);

	it.each([
		['빈 table', ''],
		['모르는 table', 'anything_else'],
		['부동산 단지(1차 제외)', 're_complexes'],
		['부동산 청약(1차 제외)', 're_subscriptions'],
		['보관 대상 아님', 'principles'],
		['감사 로그', 'mcp_audit_log']
	])('%s는 400으로 거절하고 복원하지 않는다', async (_n, table) => {
		const out = (await actions.restore!(
			event([
				['id', 'row-1'],
				['table', table]
			])
		)) as {
			status: number;
			data: { ok: boolean; message: string };
		};
		expect(out.status).toBe(400);
		expect(out.data.ok).toBe(false);
		expect(out.data.message).not.toMatch(/R-/);
		expect(handleRestore).not.toHaveBeenCalled();
	});

	it('table이 없거나 id가 비면 거절한다', async () => {
		const a = (await actions.restore!(event([['id', 'row-1']]))) as { status: number };
		const b = (await actions.restore!(
			event([
				['id', '  '],
				['table', 'reports']
			])
		)) as {
			status: number;
		};
		expect(a.status).toBe(400);
		expect(b.status).toBe(400);
		expect(handleRestore).not.toHaveBeenCalled();
	});

	it('owner는 세션 사용자로만 정하고, 클라이언트가 보낸 owner_id 등 다른 필드는 넘기지 않는다', async () => {
		await actions.restore!(
			event([
				['id', 'row-1'],
				['table', 'reports'],
				['owner_id', 'someone-else'],
				['archived_at', '2020-01-01'],
				['table', 'positions']
			])
		);
		const [, ownerId, form] = handleRestore.mock.calls[0] as unknown as [unknown, string, FormData];
		expect(ownerId).toBe('user-1');
		expect([...form.keys()].sort()).toEqual(['id', 'table']);
		expect(form.getAll('table')).toEqual(['reports']);
		expect(form.get('owner_id')).toBeNull();
	});
});
