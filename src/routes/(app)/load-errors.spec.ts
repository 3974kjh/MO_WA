import { afterEach, describe, expect, it, vi } from 'vitest';

const RAW = { code: '42501', message: 'permission denied for table secret_tbl' };

vi.mock('$lib/server/repo', () => ({
	forUser: () => ({}),
	listQueueProposals: vi.fn(async () => ({ data: [], error: RAW })),
	listPositionCards: vi.fn(async () => ({ data: [], error: RAW })),
	listAttentionNeeded: vi.fn(async () => ({ data: [], error: RAW })),
	loadDashboardValuation: vi.fn(async () => ({ data: null, error: RAW })),
	getLatestIndicator: vi.fn(async () => ({ data: null, error: null })),
	listBriefingsWithKospi: vi.fn(async () => ({ data: { items: [] }, error: null })),
	countAuditRuleIds: vi.fn(async () => ({ data: [], error: RAW })),
	listReports: vi.fn(async () => ({ data: [], error: RAW })),
	listPositions: vi.fn(async () => ({ data: [], error: null })),
	listJournalEntries: vi.fn(async () => ({ data: [], error: null }))
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
		['home', homeLoad],
		['portfolio', portfolioLoad],
		['settings', settingsLoad],
		['archive', archiveLoad]
	])('%s', async (_n, fn) => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const out = await call(fn);
		const json = JSON.stringify(out);
		expect(json).not.toContain('permission denied');
		expect(json).not.toContain('secret_tbl');
		expect(json).not.toContain('42501');
		expect(json).toContain('목록을 불러오지 못했어요.');
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});
