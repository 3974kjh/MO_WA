import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMock = vi.hoisted(() => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	listBriefingsWithKospi: vi.fn(async () => ({
		data: { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 },
		error: null
	})),
	listJournalPage: vi.fn(async () => ({
		data: { items: [], page: 1, pageSize: 30, total: 0, totalPages: 0 },
		error: null
	}))
}));
vi.mock('$lib/server/repo', () => repoMock);

import { load as briefingsLoad } from '../../routes/(app)/briefings/+page.server';
import { load as journalLoad } from '../../routes/(app)/journal/+page.server';

const locals = { user: { id: 'u1' }, supabase: {} };
// load 이벤트 중 locals·url만 쓰므로 최소 모양만 넘긴다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: (e: any) => unknown, href: string) =>
	fn({ locals, url: new URL(href) }) as Promise<Record<string, unknown>>;

beforeEach(() => vi.clearAllMocks());

describe('FE-10 목록 load는 URL 쿼리를 BE-11 load에 넘긴다', () => {
	it('브리핑', async () => {
		const out = await call(
			briefingsLoad,
			'http://x/briefings?q=%20FOMC%20&tag=CPI&month=2026-11&page=2'
		);
		const expected = { q: 'FOMC', tag: 'CPI', month: '2026-11' };
		expect(out.query).toEqual(expected);
		expect(repoMock.listBriefingsWithKospi).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ page: 2, pageSize: 20 }),
			expected
		);
	});
	it('매매일지(허용 밖 값은 버림)', async () => {
		const out = await call(journalLoad, 'http://x/journal?type=nope&ticker=NVDA&view=tb&q=a');
		const expected = { type: '', ticker: 'NVDA', view: 'tb', q: 'a' };
		expect(out.query).toEqual(expected);
		expect(repoMock.listJournalPage).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ page: 1 }),
			expected
		);
	});
});
