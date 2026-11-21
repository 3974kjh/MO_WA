import { afterEach, describe, expect, it, vi } from 'vitest';

const RAW = { code: '42501', message: 'permission denied for table secret_tbl' };

vi.mock('$lib/server/repo', () => ({
	forUser: () => ({}),
	listQueueProposals: vi.fn(async () => ({ data: [], error: RAW })),
	listPositionCards: vi.fn(async () => ({ data: [], error: RAW })),
	listAttentionNeeded: vi.fn(async () => ({ data: [], error: RAW })),
	listProposalHistory: vi.fn(async () => ({ data: { items: [], total: 0 }, error: RAW })),
	listInstrumentMeta: vi.fn(async () => ({ data: [], error: RAW })),
	listPrincipleQueue: vi.fn(async () => ({ data: { items: [], total: 0 }, error: RAW })),
	listPrincipleHistory: vi.fn(async () => ({ data: { items: [], total: 0 }, error: RAW })),
	listPortfolioPositionDetails: vi.fn(async () => ({ data: [], error: RAW })),
	listOpenProposalRefs: vi.fn(async () => ({
		data: { positions: [], holdCount: 0 },
		error: RAW
	})),
	loadDashboardValuation: vi.fn(async () => ({ data: null, error: RAW })),
	getLatestIndicator: vi.fn(async () => ({ data: null, error: null })),
	listBriefingsWithKospi: vi.fn(async () => ({ data: { items: [] }, error: null })),
	countPendingProposals: vi.fn(async () => ({ data: 0, error: RAW })),
	listIndicatorSeries: vi.fn(async () => ({ data: [], error: RAW })),
	listInstrumentLabels: vi.fn(async () => ({ data: [], error: RAW })),
	countAuditRuleIds: vi.fn(async () => ({ data: {}, error: RAW })),
	listBotClients: vi.fn(async () => ({ data: [], error: null })),
	listArchivedRows: vi.fn(async () => ({
		data: {
			reports: [],
			journal_entries: [],
			positions: [],
			instruments: [],
			decisions: [],
			events: []
		},
		truncated: [],
		errors: { reports: RAW }
	})),
	listBotArchiveAudits: vi.fn(async () => ({ data: [], error: RAW })),
	listJournalBotNames: vi.fn(async () => ({ data: new Map(), error: null }))
}));

import { load as homeLoad } from './+page.server';
import { load as portfolioLoad } from './portfolio/+page.server';
import { load as settingsLoad } from './settings/+page.server';
import { load as archiveLoad } from './archive/+page.server';

const locals = { user: { id: 'u1', email: 'a@b.c' }, supabase: {} };
const url = new URL('http://localhost/');
const call = (fn: unknown, extra: object = {}) =>
	(fn as (e: unknown) => Promise<Record<string, unknown>>)({
		locals,
		url,
		parent: async () => ({}),
		...extra
	});

afterEach(() => vi.clearAllMocks());

describe('app load 오류는 페이지 데이터에 원문·code를 싣지 않는다', () => {
	it.each([
		['home', homeLoad, '정보를 불러오지 못했어요.'],
		['portfolio', portfolioLoad, '목록을 불러오지 못했어요.'],
		['settings', settingsLoad, '정보를 불러오지 못했어요.'],
		['archive', archiveLoad, '목록을 불러오지 못했어요.']
	])('%s', async (_n, fn, msg) => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const out = await call(fn);
		const json = JSON.stringify(out);
		expect(json).not.toContain('permission denied');
		expect(json).not.toContain('secret_tbl');
		expect(json).not.toContain('42501');
		expect(json).toContain(msg);
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});
