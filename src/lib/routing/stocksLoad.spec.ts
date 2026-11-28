/**
 * FE-11 종목 화면 load: /stocks 보드 · /stocks/[ticker] 상세 · /analyses/[slug] 리포트.
 * repo는 목(mock)이다. 운영 DB·네트워크를 쓰지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = <T>(data: T) => ({ data, error: null });
const fail = (data: unknown) => ({ data, error: { message: 'db down', code: 'XX000' } });

const repoMock = vi.hoisted(() => ({
	forUser: vi.fn(() => ({ actor: { kind: 'user', ownerId: 'u1', botClientId: null } })),
	getStockInstrument: vi.fn(),
	listStockInstruments: vi.fn(),
	listStockPositions: vi.fn(),
	listQuoteSeries: vi.fn(),
	listLatestQuotes: vi.fn(),
	listEquityReports: vi.fn(),
	listTargetHistory: vi.fn(),
	listBriefingMentions: vi.fn(),
	listJournalMentions: vi.fn(),
	loadDashboardValuation: vi.fn(),
	getLatestIndicator: vi.fn(),
	getEquityReportBySlug: vi.fn(),
	listInstrumentNamesByTicker: vi.fn()
}));
vi.mock('$lib/server/repo', () => repoMock);
const bodyMock = vi.hoisted(() => ({ readBriefingBody: vi.fn(async () => null) }));
vi.mock('$lib/server/web/briefingBody', () => bodyMock);

import { load as boardLoad } from '../../routes/(app)/stocks/+page.server';
import { load as detailLoad } from '../../routes/(app)/stocks/[ticker]/+page.server';
import { load as analysisLoad } from '../../routes/(app)/analyses/[slug]/+page.server';

type AnyLoad = (e: unknown) => Promise<Record<string, unknown>>;
const locals = { user: { id: 'u1' }, supabase: {} };
const board = (search = '') =>
	(boardLoad as unknown as AnyLoad)({ locals, url: new URL(`http://x/stocks${search}`) });
const detail = (ticker: string) =>
	(detailLoad as unknown as AnyLoad)({
		locals,
		params: { ticker },
		url: new URL(`http://x/stocks/${ticker}`)
	});
const analysis = (slug: string, search = '') =>
	(analysisLoad as unknown as AnyLoad)({
		locals,
		params: { slug },
		url: new URL(`http://x/analyses/${slug}${search}`)
	});
const status = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { status?: number }).status;
	}
	return 200;
};

const INST = {
	id: 'i1',
	ticker: '035420',
	name: 'NAVER',
	market: 'KRX',
	asset_type: 'stock',
	is_watchlist: false,
	archived_at: null
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	repoMock.listStockPositions.mockResolvedValue(ok([]));
	repoMock.listQuoteSeries.mockResolvedValue(ok([]));
	repoMock.listLatestQuotes.mockResolvedValue(ok([]));
	repoMock.listEquityReports.mockResolvedValue(ok([]));
	repoMock.listTargetHistory.mockResolvedValue(ok([]));
	repoMock.listBriefingMentions.mockResolvedValue(ok([]));
	repoMock.listJournalMentions.mockResolvedValue(ok({ items: [], total: 0 }));
	repoMock.loadDashboardValuation.mockResolvedValue(ok({ positions: [], totalKrw: 0 }));
	repoMock.getLatestIndicator.mockResolvedValue(ok(null));
	repoMock.listStockInstruments.mockResolvedValue(ok([]));
	repoMock.listInstrumentNamesByTicker.mockResolvedValue(ok([]));
});
afterEach(() => vi.restoreAllMocks());

describe('FE-11 /stocks 보드 load', () => {
	it('빈 기록이면 빈 보드(오류 아님), 쿼리는 허용 값만', async () => {
		const d = await board('?f=watch&sort=zzz');
		expect(d).toMatchObject({ title: '종목', error: null, rows: [], drafts: [] });
		expect(d.query).toEqual({ q: '', f: 'watch', sort: 'default' });
	});
	it('종목·포지션·시세 중 하나라도 실패하면 보드 전체 오류(원문 노출 없음)', async () => {
		repoMock.listStockPositions.mockResolvedValueOnce(fail([]));
		const d = await board();
		expect(d.error).toBeTypeOf('string');
		expect(String(d.error)).not.toContain('db down');
		expect(d.rows).toEqual([]);
	});
	it('리포트만 실패하면 보드는 보이고 리포트 오류만', async () => {
		repoMock.listStockInstruments.mockResolvedValueOnce(ok([INST]));
		repoMock.listStockPositions.mockResolvedValueOnce(
			ok([{ id: 'p1', instrument_id: 'i1', status: 'holding', currency: 'KRW', qty: 1 }])
		);
		repoMock.listEquityReports.mockResolvedValueOnce(fail([]));
		const d = await board();
		expect(d.error).toBeNull();
		expect(d.reportsError).toBeTypeOf('string');
		expect((d.rows as unknown[]).length).toBe(1);
	});
});

describe('FE-11 /stocks/[ticker] 상세 load', () => {
	it('형식 밖 코드는 DB를 읽지 않고 404', async () => {
		expect(await status(detail('../etc'))).toBe(404);
		expect(await status(detail('naver'))).toBe(404);
		expect(repoMock.getStockInstrument).not.toHaveBeenCalled();
	});
	it('없는 종목 · 보관된 종목은 404', async () => {
		repoMock.getStockInstrument.mockResolvedValueOnce(ok(null));
		expect(await status(detail('005930'))).toBe(404);
		repoMock.getStockInstrument.mockResolvedValueOnce(
			ok({ ...INST, archived_at: '2026-11-01T00:00:00Z' })
		);
		expect(await status(detail('035420'))).toBe(404);
	});
	it('종목 행을 못 읽으면 503', async () => {
		repoMock.getStockInstrument.mockResolvedValueOnce(fail(null));
		expect(await status(detail('035420'))).toBe(503);
	});
	it('결정 3: bond·cash는 포트폴리오 안내만(다른 기록은 읽지 않음)', async () => {
		for (const [ticker, asset_type] of [
			['UST_30Y', 'bond'],
			['KR_CORP_BOND', 'bond'],
			['CASH_KRW', 'cash']
		]) {
			repoMock.getStockInstrument.mockResolvedValueOnce(
				ok({ ...INST, ticker, name: ticker, asset_type })
			);
			const d = await detail(ticker);
			expect(d).toMatchObject({ portfolioOnly: true, title: ticker });
			expect(d).not.toHaveProperty('series');
		}
		expect(repoMock.listQuoteSeries).not.toHaveBeenCalled();
		expect(repoMock.listStockPositions).not.toHaveBeenCalled();
	});
	it('카드별 실패는 그 카드만(원문 노출 없음), 보유가 없으면 평가 계산을 읽지 않음', async () => {
		repoMock.getStockInstrument.mockResolvedValueOnce(ok(INST));
		repoMock.listQuoteSeries.mockResolvedValueOnce(fail([]));
		const d = await detail('035420');
		expect(d.portfolioOnly).toBe(false);
		expect(d.seriesError).toBeTypeOf('string');
		expect(d.positionsError).toBeNull();
		expect(d.reportsError).toBeNull();
		expect(JSON.stringify(d)).not.toContain('db down');
		expect(repoMock.loadDashboardValuation).not.toHaveBeenCalled();
		expect(d.holdingValue).toBeNull();
	});
	it('리포트 meta는 화면에 넘기지 않고 종목 메모로만 줄인다', async () => {
		repoMock.getStockInstrument.mockResolvedValueOnce(ok(INST));
		repoMock.listEquityReports.mockResolvedValueOnce(
			ok([
				{
					id: 'r1',
					slug: 'naver-context',
					title: 't',
					subtype: 'equity_analysis',
					status: 'published',
					report_date: '2026-11-20',
					tickers: ['035420'],
					meta: { selection_reason: '검색 점유율', internal_note: 'x' }
				}
			])
		);
		const d = await detail('035420');
		expect((d.reports as Array<Record<string, unknown>>)[0]).not.toHaveProperty('meta');
		expect(d.memo).toMatchObject({ reason: '검색 점유율' });
		expect(JSON.stringify(d)).not.toContain('internal_note');
	});
	it('H1: 같은 slug 리포트가 날짜만 다르게 두 건이면 최신 1건만 넘긴다', async () => {
		repoMock.getStockInstrument.mockResolvedValueOnce(ok({ ...INST, ticker: '005930' }));
		const rep = (id: string, report_date: string) => ({
			id,
			slug: 'samsung-q4',
			title: id,
			subtype: 'equity_analysis',
			status: 'published',
			report_date,
			tickers: ['005930']
		});
		repoMock.listEquityReports.mockResolvedValueOnce(
			ok([rep('new', '2026-11-20'), rep('old', '2026-10-01')])
		);
		const d = await detail('005930');
		expect((d.reports as Array<{ id: string }>).map((r) => r.id)).toEqual(['new']);
	});
	it('보유 종목은 평가금액(홈·포트폴리오와 같은 계산)', async () => {
		repoMock.getStockInstrument.mockResolvedValueOnce(ok(INST));
		repoMock.listStockPositions.mockResolvedValueOnce(
			ok([{ id: 'p1', instrument_id: 'i1', status: 'holding', currency: 'KRW', qty: 3 }])
		);
		repoMock.loadDashboardValuation.mockResolvedValueOnce(
			ok({ positions: [{ id: 'p1', valueKrw: 600 }], totalKrw: 1200 })
		);
		const d = await detail('035420');
		expect(d).toMatchObject({ holdingValue: 600, totalKrw: 1200 });
	});
});

describe('FE-11 /analyses/[slug] load (결정 1)', () => {
	const REP = {
		id: 'r1',
		slug: 'googl-005380',
		title: '알파벳·현대차',
		subtype: 'equity_analysis',
		status: 'published',
		report_date: '2026-11-20',
		tickers: ['GOOGL', '005380'],
		summary: '한 줄',
		version: 1,
		generated_at: null
	};
	it('형식 밖 slug는 DB를 읽지 않고 404, 없는 리포트도 404, 읽기 실패는 503', async () => {
		expect(await status(analysis('Bad_Slug'))).toBe(404);
		expect(await status(analysis('a'.repeat(81)))).toBe(404);
		expect(repoMock.getEquityReportBySlug).not.toHaveBeenCalled();
		repoMock.getEquityReportBySlug.mockResolvedValueOnce(ok(null));
		expect(await status(analysis('nope'))).toBe(404);
		repoMock.getEquityReportBySlug.mockResolvedValueOnce(fail(null));
		expect(await status(analysis('googl'))).toBe(503);
	});
	it('들어온 종목(?from)으로 돌려보냄 — 이름 표시', async () => {
		repoMock.getEquityReportBySlug.mockResolvedValueOnce(ok(REP));
		repoMock.listInstrumentNamesByTicker.mockResolvedValueOnce(
			ok([{ ticker: '005380', name: '현대차' }])
		);
		const d = await analysis('googl-005380', '?from=005380');
		expect(d).toMatchObject({ backHref: '/stocks/005380', backLabel: '← 현대차 종목 화면' });
	});
	it('직접 진입: 여러 종목 리포트 → /stocks', async () => {
		repoMock.getEquityReportBySlug.mockResolvedValueOnce(ok(REP));
		const d = await analysis('googl-005380');
		expect(d).toMatchObject({ backHref: '/stocks', backLabel: '← 종목 목록' });
		expect(repoMock.listInstrumentNamesByTicker).not.toHaveBeenCalled();
	});
	it('직접 진입: 종목 하나 리포트 → 그 종목(이름을 못 읽으면 코드)', async () => {
		repoMock.getEquityReportBySlug.mockResolvedValueOnce(
			ok({ ...REP, slug: 'plan-108490', tickers: ['108490'] })
		);
		const d = await analysis('plan-108490', '?from=GOOGL');
		expect(d).toMatchObject({ backHref: '/stocks/108490', backLabel: '← 108490 종목 화면' });
	});
	it('본문은 상세 모드에서만 저장 캐시로 읽는다', async () => {
		repoMock.getEquityReportBySlug.mockResolvedValue(ok(REP));
		const s = await analysis('googl-005380');
		expect(s).toMatchObject({ mode: 'summary', body: null });
		expect(bodyMock.readBriefingBody).not.toHaveBeenCalled();
		const dd = await analysis('googl-005380', '?mode=detail');
		expect(dd.mode).toBe('detail');
		expect(bodyMock.readBriefingBody).toHaveBeenCalledTimes(1);
	});
});
