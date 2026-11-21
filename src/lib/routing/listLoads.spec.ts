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
	})),
	// FE-06: 칩 건수·종목·리포트·봇 이름 읽기
	listJournalKinds: vi.fn(async () => ({ data: [], error: null })),
	listJournalInstruments: vi.fn(async () => ({ data: [], error: null })),
	listJournalReportOptions: vi.fn(async () => ({ data: [], error: null })),
	listJournalBotNames: vi.fn(async () => ({ data: new Map(), error: null })),
	getJournalEntryForWeb: vi.fn(async () => ({ data: null, error: null }))
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

describe('FE-10 허용 밖 tag는 해당 파라미터만 뺀 URL로 redirect', () => {
	const redirected = async (href: string) => {
		try {
			await call(briefingsLoad, href);
		} catch (e) {
			const r = e as { status?: number; location?: string };
			return { status: r.status, location: r.location };
		}
		return null;
	};
	it('tag=a,b → tag만 빠지고 q·month·page는 남음', async () => {
		const r = await redirected('http://x/briefings?q=FOMC&tag=a%2Cb&month=2026-11&page=2');
		expect(r?.status).toBe(303);
		expect(r?.location).toBe('/briefings?q=FOMC&month=2026-11&page=2');
		expect(repoMock.listBriefingsWithKospi).not.toHaveBeenCalled();
	});
	it('tag=<script> → 빈 쿼리면 trailing ? 없이', async () => {
		const r = await redirected('http://x/briefings?tag=%3Cscript%3E');
		expect(r?.location).toBe('/briefings');
	});
	it('빈 값 tag= 는 tag만 빠짐', async () => {
		const r = await redirected('http://x/briefings?tag=&q=x');
		expect(r?.location).toBe('/briefings?q=x');
		expect((await redirected('http://x/briefings?tag='))?.location).toBe('/briefings');
	});
	it('여러 tag 중 허용된 것만 남김', async () => {
		const r = await redirected('http://x/briefings?tag=CPI&tag=a%2Cb&q=x');
		expect(r?.location).toBe('/briefings?tag=CPI&q=x');
	});
	it.each(['CPI', '52주 저가', '사이드카'])('허용된 %s는 redirect하지 않음', async (t) => {
		expect(await redirected(`http://x/briefings?tag=${encodeURIComponent(t)}&q=a`)).toBeNull();
		expect(repoMock.listBriefingsWithKospi).toHaveBeenCalledTimes(1);
	});
	it('tag가 없으면 redirect하지 않음', async () => {
		expect(await redirected('http://x/briefings?q=a&month=2026-11')).toBeNull();
		expect(await redirected('http://x/briefings')).toBeNull();
	});
});
