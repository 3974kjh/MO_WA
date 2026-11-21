/** FE-06 `/journal`·`/journal/[id]` load(서버). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const I1 = '11111111-1111-4111-8111-111111111111';
const I9 = '99999999-9999-4999-8999-999999999999';
const row = (over: Record<string, unknown>) => ({
	id: I1,
	entry_date: '2026-11-01',
	kind: 'buy',
	state: 'done',
	title: 't',
	tickers: ['000111'],
	instrument_id: 'a',
	price: 100,
	qty: 1,
	currency: 'KRW',
	search_tsv: "'t'",
	owner_id: 'u1',
	source_bot_id: null,
	...over
});
const repoMock = vi.hoisted(() => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	listJournalPage: vi.fn(),
	listJournalKinds: vi.fn(async () => ({ data: ['buy', 'buy', 'review'], error: null })),
	listJournalInstruments: vi.fn(async () => ({
		data: [
			{
				id: 'a',
				ticker: '000111',
				name: '가나',
				market: 'KRX',
				asset_type: 'stock',
				archived_at: null
			}
		],
		error: null
	})),
	listJournalReportOptions: vi.fn(async () => ({ data: [], error: null })),
	listJournalBotNames: vi.fn(async () => ({ data: new Map([['b1', '봇A']]), error: null })),
	getJournalEntryForWeb: vi.fn(async () => ({ data: null, error: null }) as never)
}));
vi.mock('$lib/server/repo', () => repoMock);

import { load as listLoad } from './+page.server';
import { load as detailLoad } from './[id]/+page.server';

const locals = { user: { id: 'u1' }, supabase: {} };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: (e: any) => unknown, href: string, params: Record<string, string> = {}) =>
	fn({ locals, url: new URL(href), params }) as Promise<Record<string, unknown>>;

beforeEach(() => {
	vi.clearAllMocks();
	repoMock.listJournalPage.mockResolvedValue({
		data: {
			items: [row({}), row({ id: 'j2', source_bot_id: 'b1', kind: 'thought' })],
			page: 1,
			pageSize: 30,
			total: 2,
			totalPages: 1
		},
		error: null
	});
});

describe('FE-06 목록 load', () => {
	it('행 DTO(search_tsv·owner_id 없음) + 칩 건수 + 봇 이름', async () => {
		const out = (await call(listLoad, 'http://x/journal?ticker=000111&type=buy')) as {
			journal: { items: Record<string, unknown>[] };
			kindCounts: Record<string, number>;
			selected: unknown;
		};
		expect(out.journal.items[0]).not.toHaveProperty('search_tsv');
		expect(out.journal.items[0]).not.toHaveProperty('owner_id');
		expect(out.journal.items[0]).toMatchObject({ instrument_ticker: '000111', bot: null });
		expect(out.journal.items[1]).toMatchObject({ bot: { id: 'b1', name: '봇A' } });
		expect(out.kindCounts).toMatchObject({ all: 3, buy: 2, review: 1 });
		expect(out.selected).toBeNull();
		// 칩 건수는 구분만 빼고 같은 필터
		expect(repoMock.listJournalKinds).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ ticker: '000111', q: '' })
		);
	});

	it('보조 읽기 실패는 목록을 막지 않는다(원문 없음)', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		repoMock.listJournalKinds.mockResolvedValueOnce({
			data: [],
			error: new Error('raw db text')
		} as never);
		const out = await call(listLoad, 'http://x/journal');
		expect(out.error).toBeNull();
		expect(out.kindCountsOk).toBe(false);
		expect(String(out.auxError)).not.toContain('raw db text');
		spy.mockRestore();
	});
});

describe('FE-06 /journal/[id] 직접 진입', () => {
	it('uuid가 아니면 404', async () => {
		await expect(call(detailLoad, 'http://x/journal/abc', { id: 'abc' })).rejects.toMatchObject({
			status: 404
		});
	});

	it('목록 쪽에 있으면 그 행을 selected로(추가 조회 없음)', async () => {
		const out = (await call(detailLoad, `http://x/journal/${I1}?view=tb`, { id: I1 })) as {
			selected: { id: string };
			query: { view: string };
		};
		expect(out.selected.id).toBe(I1);
		expect(out.query.view).toBe('tb');
		expect(repoMock.getJournalEntryForWeb).not.toHaveBeenCalled();
	});

	it('목록에 없으면 한 건을 읽고, 없으면 404', async () => {
		repoMock.getJournalEntryForWeb.mockResolvedValueOnce({
			data: row({ id: I9, title: '다른 쪽' }),
			error: null
		} as never);
		const out = (await call(detailLoad, `http://x/journal/${I9}`, { id: I9 })) as {
			selected: { title: string };
		};
		expect(out.selected.title).toBe('다른 쪽');
		await expect(call(detailLoad, `http://x/journal/${I9}`, { id: I9 })).rejects.toMatchObject({
			status: 404
		});
	});
});
