import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type FakeRepo = { actor: { kind: 'bot'; ownerId: string; botClientId: string } };

const OWNER_A = '00000000-0000-4000-8000-0000000000aa';
const OWNER_B = '00000000-0000-4000-8000-0000000000bb';

const db = vi.hoisted(() => ({
	tables: {} as Record<string, Row[]>,
	calls: [] as Array<{ fn: string; repo: unknown; opts: unknown }>
}));

vi.mock('$lib/server/repo', () => {
	const scoped = (table: string, repo: FakeRepo, includeArchived = false): Row[] =>
		(db.tables[table] ?? []).filter(
			(r) => r.owner_id === repo.actor.ownerId && (includeArchived || r.archived_at == null)
		);
	const list =
		(fn: string, table: string) =>
		async (repo: FakeRepo, opts: { includeArchived?: boolean; status?: string } = {}) => {
			db.calls.push({ fn, repo, opts });
			let rows = scoped(table, repo, opts.includeArchived);
			if (opts.status) rows = rows.filter((r) => r.status === opts.status);
			return { data: rows, error: null };
		};
	return {
		listReports: list('listReports', 'reports'),
		listPositions: list('listPositions', 'positions'),
		listInstruments: list('listInstruments', 'instruments'),
		listJournalEntries: list('listJournalEntries', 'journal_entries'),
		listDecisions: list('listDecisions', 'decisions'),
		listPositionProposals: list('listPositionProposals', 'position_proposals'),
		listEvents: async (
			repo: FakeRepo,
			opts: { from?: string; to?: string; includeArchived?: boolean } = {}
		) => {
			db.calls.push({ fn: 'listEvents', repo, opts });
			const rows = scoped('events', repo, opts.includeArchived).filter(
				(e) =>
					(!opts.from || (e.event_date as string) >= opts.from) &&
					(!opts.to || (e.event_date as string) <= opts.to)
			);
			return { data: rows, error: null };
		},
		getReportById: async (repo: FakeRepo, id: string) => {
			db.calls.push({ fn: 'getReportById', repo, opts: { id } });
			const row = scoped('reports', repo, true).find((r) => r.id === id) ?? null;
			return { data: row, error: null };
		}
	};
});

import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { handleMcp } from '../handler';
import { createStubMcpContext } from '../testing';
import { toolsForContext } from './index';
import {
	getDashboardContextHandler,
	getReportHandler,
	listEventsHandler,
	listPositionsHandler,
	listReportsHandler,
	READ_TOOL_DEFS,
	searchHandler
} from './read';
import type { ToolHandlerInput } from './register';
import type { RepoClient } from '$lib/server/repo';

const READ_TOOL_NAMES = [
	'whoami',
	'get_dashboard_context',
	'get_report',
	'list_reports',
	'search',
	'list_instruments',
	'list_positions',
	'list_proposals',
	'list_journal_entries',
	'list_decisions',
	'list_events'
];

const R_LIVE = '10000000-0000-4000-8000-000000000001';
const R_ARCHIVED = '10000000-0000-4000-8000-000000000002';
const R_OTHER_OWNER = '10000000-0000-4000-8000-000000000003';
const R_OLD = '10000000-0000-4000-8000-000000000004';
const INSTR = '20000000-0000-4000-8000-000000000001';
const POS_HOLD = '30000000-0000-4000-8000-000000000001';
const POS_ARCHIVED = '30000000-0000-4000-8000-000000000002';
const POS_PLANNED = '30000000-0000-4000-8000-000000000003';

function fakeRepo(ownerId = OWNER_A): RepoClient {
	return {
		actor: { kind: 'bot', ownerId, botClientId: '00000000-0000-4000-8000-000000000001' }
	} as FakeRepo as unknown as RepoClient;
}

function input(
	args: Record<string, unknown>,
	repo: RepoClient | null = fakeRepo()
): ToolHandlerInput {
	return { args, ctx: createStubMcpContext(), ruleIds: [], repo, auditIntent: async () => {} };
}

function seed(): void {
	db.calls.length = 0;
	db.tables = {
		reports: [
			{
				id: R_LIVE,
				owner_id: OWNER_A,
				kind: 'daily_brief',
				domain: 'macro',
				slug: 'brief',
				title: 'Morning brief',
				headline: 'KOSPI steady',
				summary: 'rates unchanged',
				report_date: '2026-11-20',
				body_md: '# secret body',
				body_blocks: null,
				tickers: ['005930'],
				tags: [],
				status: 'published',
				version: 1,
				meta: {},
				source_ref: { leak: true },
				search_tsv: 'tsv',
				archived_at: null,
				updated_at: '2026-11-20T01:00:00Z'
			},
			{
				id: R_OLD,
				owner_id: OWNER_A,
				kind: 'weekly_report',
				domain: 'macro',
				slug: 'weekly',
				title: 'Old weekly',
				headline: null,
				summary: 'archive candidate',
				report_date: '2026-11-01',
				body_md: 'old',
				tickers: [],
				tags: [],
				status: 'published',
				version: 1,
				archived_at: null,
				updated_at: '2026-11-01T01:00:00Z'
			},
			{
				id: R_ARCHIVED,
				owner_id: OWNER_A,
				kind: 'daily_brief',
				domain: 'macro',
				slug: 'gone',
				title: 'Archived brief',
				headline: 'KOSPI archived',
				summary: null,
				report_date: '2026-11-19',
				body_md: 'gone',
				tickers: [],
				tags: [],
				status: 'published',
				version: 1,
				archived_at: '2026-11-20T00:00:00Z',
				updated_at: '2026-11-19T01:00:00Z'
			},
			{
				id: R_OTHER_OWNER,
				owner_id: OWNER_B,
				kind: 'daily_brief',
				domain: 'macro',
				slug: 'theirs',
				title: 'KOSPI other owner',
				headline: 'KOSPI other',
				summary: null,
				report_date: '2026-11-21',
				body_md: 'theirs',
				tickers: [],
				tags: [],
				status: 'published',
				version: 1,
				archived_at: null,
				updated_at: '2026-11-21T01:00:00Z'
			}
		],
		instruments: [
			{
				id: INSTR,
				owner_id: OWNER_A,
				ticker: '005930',
				name: 'Samsung',
				market: 'KRX',
				asset_type: 'stock',
				is_watchlist: false,
				archived_at: null
			}
		],
		positions: [
			{
				id: POS_HOLD,
				owner_id: OWNER_A,
				instrument_id: INSTR,
				status: 'holding',
				currency: 'KRW',
				qty: 10,
				avg_price: 70000,
				approval_version: 2,
				archived_at: null
			},
			{
				id: POS_PLANNED,
				owner_id: OWNER_A,
				instrument_id: INSTR,
				status: 'planned',
				currency: 'KRW',
				qty: 0,
				avg_price: null,
				approval_version: 1,
				archived_at: null
			},
			{
				id: POS_ARCHIVED,
				owner_id: OWNER_A,
				instrument_id: INSTR,
				status: 'holding',
				currency: 'KRW',
				qty: 99,
				avg_price: 1,
				archived_at: '2026-11-01T00:00:00Z'
			},
			{
				id: '30000000-0000-4000-8000-0000000000bb',
				owner_id: OWNER_B,
				instrument_id: INSTR,
				status: 'holding',
				currency: 'KRW',
				qty: 777,
				avg_price: 5,
				archived_at: null
			}
		],
		position_proposals: [
			{
				id: '40000000-0000-4000-8000-000000000001',
				owner_id: OWNER_A,
				display_id: 'P-0001',
				change_type: 'set_qty_avg',
				status: 'pending',
				position_id: POS_HOLD,
				proposed_values: { qty: 25, avg_price: 71000 },
				created_at: '2026-11-20T02:00:00Z'
			},
			{
				id: '40000000-0000-4000-8000-000000000002',
				owner_id: OWNER_A,
				display_id: 'P-0002',
				change_type: 'close',
				status: 'on_hold',
				position_id: POS_HOLD,
				proposed_values: {},
				created_at: '2026-11-20T03:00:00Z'
			},
			{
				id: '40000000-0000-4000-8000-000000000003',
				owner_id: OWNER_A,
				display_id: 'P-0003',
				change_type: 'set_qty_avg',
				status: 'approved',
				position_id: POS_HOLD,
				proposed_values: { qty: 1 },
				created_at: '2026-11-10T03:00:00Z'
			},
			{
				id: '40000000-0000-4000-8000-000000000004',
				owner_id: OWNER_A,
				display_id: 'P-0004',
				change_type: 'open_holding',
				status: 'pending',
				position_id: null,
				instrument_id: INSTR,
				proposed_values: { qty: 5 },
				created_at: '2026-11-20T04:00:00Z'
			}
		],
		decisions: [
			{
				id: '50000000-0000-4000-8000-000000000001',
				owner_id: OWNER_A,
				title: 'Trim Samsung?',
				status: 'open',
				archived_at: null
			},
			{
				id: '50000000-0000-4000-8000-000000000002',
				owner_id: OWNER_A,
				title: 'Done one',
				status: 'decided',
				archived_at: null
			}
		],
		events: [
			{
				id: '60000000-0000-4000-8000-000000000001',
				owner_id: OWNER_A,
				event_date: '2026-11-25',
				title: 'FOMC',
				domain: 'macro',
				kind: 'macro',
				status: 'scheduled',
				archived_at: null
			},
			{
				id: '60000000-0000-4000-8000-000000000002',
				owner_id: OWNER_A,
				event_date: '2026-11-26',
				title: 'Cancelled',
				domain: 'macro',
				kind: 'macro',
				status: 'cancelled',
				archived_at: null
			},
			{
				id: '60000000-0000-4000-8000-000000000003',
				owner_id: OWNER_A,
				event_date: '2026-12-30',
				title: 'Too far',
				domain: 'macro',
				kind: 'macro',
				status: 'scheduled',
				archived_at: null
			},
			{
				id: '60000000-0000-4000-8000-000000000004',
				owner_id: OWNER_A,
				event_date: '2026-11-01',
				title: 'Past',
				domain: 'macro',
				kind: 'macro',
				status: 'done',
				archived_at: null
			}
		],
		journal_entries: [],
		principle_proposals: []
	};
}

beforeEach(() => {
	seed();
});

afterEach(() => {
	vi.useRealTimers();
});

const ids = (rows: unknown) => (rows as Row[]).map((r) => r.id);

describe('archived rows excluded by default (R-SYS-03)', () => {
	it('list_reports hides archived unless include_archived', async () => {
		const def = await listReportsHandler(input({}));
		expect(ids(def.data.reports)).toEqual([R_LIVE, R_OLD]);
		expect(db.calls[0]?.opts).toMatchObject({ includeArchived: false });

		const all = await listReportsHandler(input({ include_archived: true }));
		expect(ids(all.data.reports)).toContain(R_ARCHIVED);
	});

	it('search hides archived reports by default', async () => {
		const res = await searchHandler(input({ q: 'kospi' }));
		expect(ids(res.data.reports)).toEqual([R_LIVE]);
		const withArchived = await searchHandler(input({ q: 'kospi', include_archived: true }));
		expect(ids(withArchived.data.reports)).toEqual([R_LIVE, R_ARCHIVED]);
	});

	it('list_positions hides archived positions by default', async () => {
		const def = await listPositionsHandler(input({}));
		expect(ids(def.data.positions)).not.toContain(POS_ARCHIVED);
		const all = await listPositionsHandler(input({ include_archived: true }));
		expect(ids(all.data.positions)).toContain(POS_ARCHIVED);
	});

	it('every list tool defaults to non-archived via repo options', async () => {
		for (const def of READ_TOOL_DEFS.filter((d) => d.name.startsWith('list_'))) {
			db.calls.length = 0;
			await def.handler(input({}));
			const listCalls = db.calls.filter(
				(c) => c.fn !== 'listInstruments' // joined for labels, always includes archived
			);
			for (const c of listCalls) {
				expect((c.opts as { includeArchived?: boolean }).includeArchived ?? false).toBe(false);
			}
		}
	});
});

describe('list_reports shape (§5-5)', () => {
	it('includes headline, excludes body by default, includes body on request', async () => {
		const res = await listReportsHandler(input({ limit: 1 }));
		const [first] = res.data.reports as Row[];
		expect(first).toMatchObject({ id: R_LIVE, headline: 'KOSPI steady', kind: 'daily_brief' });
		expect(first).not.toHaveProperty('body_md');
		expect(first).not.toHaveProperty('owner_id');
		expect(first).not.toHaveProperty('search_tsv');
		expect(res.data).toMatchObject({ count: 1, total: 2, truncated: true });

		const withBody = await listReportsHandler(input({ include_body: true, limit: 1 }));
		expect((withBody.data.reports as Row[])[0]?.body_md).toBe('# secret body');
	});

	it('filters by kind', async () => {
		const res = await listReportsHandler(input({ kind: 'weekly_report' }));
		expect(ids(res.data.reports)).toEqual([R_OLD]);
	});

	it('rejects invalid args as VALIDATION', async () => {
		await expect(listReportsHandler(input({ limit: 0 }))).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});

describe('get_report', () => {
	it('returns the report with body by default and omits it on include_body=false', async () => {
		const full = await getReportHandler(input({ id: R_LIVE }));
		expect((full.data.report as Row).body_md).toBe('# secret body');
		const slim = await getReportHandler(input({ id: R_LIVE, include_body: false }));
		expect(slim.data.report).not.toHaveProperty('body_md');
		expect(slim.data.report).not.toHaveProperty('source_ref');
	});

	it('throws NOT_FOUND for a missing id', async () => {
		await expect(
			getReportHandler(input({ id: '10000000-0000-4000-8000-0000000000ff' }))
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('throws NOT_FOUND for another owner id (R-SYS-01)', async () => {
		await expect(getReportHandler(input({ id: R_OTHER_OWNER }))).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

describe('list_positions keeps approved values apart from proposals (R-PERM-13)', () => {
	it('attaches pending/on_hold proposals by position_id without merging proposed numbers', async () => {
		const res = await listPositionsHandler(input({ status: 'holding' }));
		const [pos] = res.data.positions as Row[];
		expect(pos).toMatchObject({
			id: POS_HOLD,
			qty: 10,
			avg_price: 70000,
			approval_version: 2,
			ticker: '005930'
		});
		const pending = pos?.pending_proposals as Row[];
		expect(pending.map((p) => p.display_id).sort()).toEqual(['P-0001', 'P-0002']);
		expect(pending.map((p) => p.status).sort()).toEqual(['on_hold', 'pending']);
		expect(pending.find((p) => p.display_id === 'P-0001')?.proposed_values).toEqual({
			qty: 25,
			avg_price: 71000
		});
		expect(pos).not.toHaveProperty('proposed_values');
		expect(pos).not.toHaveProperty('owner_id');
	});

	it('positions without proposals get an empty array', async () => {
		const res = await listPositionsHandler(input({ status: 'planned' }));
		expect((res.data.positions as Row[])[0]?.pending_proposals).toEqual([]);
	});
});

describe('get_dashboard_context', () => {
	it('returns latest_report, holdings, pending_proposals, open decisions, 14-day events', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-21T03:00:00Z'));
		const res = await getDashboardContextHandler(input({}));
		const d = res.data;
		expect(Object.keys(d).sort()).toEqual(
			['decisions', 'latest_report', 'pending_proposals', 'positions', 'upcoming_events'].sort()
		);
		expect((d.latest_report as Row).id).toBe(R_LIVE);
		expect(d.latest_report).not.toHaveProperty('body_md');
		expect(ids(d.positions)).toEqual([POS_HOLD]);
		expect((d.positions as Row[])[0]).toMatchObject({ qty: 10, avg_price: 70000 });
		expect((d.pending_proposals as Row[]).map((p) => p.display_id)).toEqual([
			'P-0004',
			'P-0002',
			'P-0001'
		]);
		expect((d.decisions as Row[]).map((x) => x.title)).toEqual(['Trim Samsung?']);
		expect((d.upcoming_events as Row[]).map((e) => e.title)).toEqual(['FOMC']);
	});

	it('latest_report is null when the owner has no reports', async () => {
		const res = await getDashboardContextHandler(
			input({}, fakeRepo('00000000-0000-4000-8000-0000000000cc'))
		);
		expect(res.data.latest_report).toBeNull();
		expect(res.data.positions).toEqual([]);
	});
});

describe('list_events default window', () => {
	it('starts at today (KST) when from/to are omitted', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-21T03:00:00Z'));
		const res = await listEventsHandler(input({}));
		expect((res.data.events as Row[]).map((e) => e.title)).not.toContain('Past');
		const explicit = await listEventsHandler(input({ from: '2026-11-01', to: '2026-11-02' }));
		expect((explicit.data.events as Row[]).map((e) => e.title)).toEqual(['Past']);
	});
});

describe('owner isolation via owner-scoped repo (R-SYS-01)', () => {
	it('passes the registration repo (and nothing else) to every repo helper', async () => {
		const repo = fakeRepo();
		for (const def of READ_TOOL_DEFS.filter(
			(d) => d.name !== 'whoami' && d.name !== 'get_report'
		)) {
			db.calls.length = 0;
			await def.handler(input(def.name === 'search' ? { q: 'kospi' } : {}, repo));
			expect(db.calls.length).toBeGreaterThan(0);
			for (const c of db.calls) expect(c.repo).toBe(repo);
		}
	});

	it('another owner sees none of owner A rows', async () => {
		const other = fakeRepo(OWNER_B);
		const reports = await listReportsHandler(input({ include_archived: true }, other));
		expect(ids(reports.data.reports)).toEqual([R_OTHER_OWNER]);
		const positions = await listPositionsHandler(input({}, other));
		expect((positions.data.positions as Row[]).map((p) => p.qty)).toEqual([777]);
		expect((positions.data.positions as Row[])[0]?.pending_proposals).toEqual([]);
	});

	it('env mode (no repo / no owner) fails with INTERNAL and a clear message', async () => {
		for (const def of READ_TOOL_DEFS.filter((d) => d.name !== 'whoami')) {
			const args =
				def.name === 'get_report' ? { id: R_LIVE } : def.name === 'search' ? { q: 'x' } : {};
			await expect(def.handler(input(args, null))).rejects.toMatchObject({
				code: 'INTERNAL',
				message: expect.stringContaining('owner')
			});
		}
	});
});

describe('scope-filtered tool list', () => {
	it('read scope lists all read tools', () => {
		expect(toolsForContext({ scopes: ['read'] }).sort()).toEqual([...READ_TOOL_NAMES].sort());
		expect(READ_TOOL_DEFS.map((d) => d.name).sort()).toEqual([...READ_TOOL_NAMES].sort());
	});

	it('without read scope none of the read tools are listed', () => {
		for (const scopes of [[], ['journal:write'], ['positions:propose']]) {
			const listed = toolsForContext({ scopes });
			for (const name of READ_TOOL_NAMES) expect(listed).not.toContain(name);
		}
	});
});

async function rpc(
	scopes: string[],
	method: string,
	params: Record<string, unknown> = {},
	repo: RepoClient | null = fakeRepo()
) {
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	const res = await handleMcp(
		new Request('https://mo-wa.pages.dev/api/mcp', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream'
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
		}),
		createStubMcpContext({ scopes }),
		{ recorder, repo, meta: { requestId: 'req-1' } }
	);
	await recorder.drain();
	return { body: await res.json(), rows: sink.rows };
}

describe('registered via runAuditedToolCall', () => {
	it('tools/list for a read key exposes read-only annotated read tools', async () => {
		const { body, rows } = await rpc(['read'], 'tools/list');
		const tools = body.result.tools as Array<{
			name: string;
			annotations?: { readOnlyHint?: boolean; idempotentHint?: boolean };
		}>;
		expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOL_NAMES].sort());
		for (const t of tools) {
			expect(t.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
		}
		expect(rows).toHaveLength(0);
	});

	it('tools/list for a key without read exposes no read tools (write scopes may list writes)', async () => {
		const { body } = await rpc(['prices:write'], 'tools/list');
		const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name);
		expect(names).not.toEqual(expect.arrayContaining([...READ_TOOL_NAMES]));
		expect(names).toContain('record_price_snapshots');
	});

	it('tools/list for empty scopes exposes nothing', async () => {
		const { body } = await rpc([], 'tools/list');
		expect(body.result.tools).toEqual([]);
	});

	it('list_positions call records one ok audit row (R-SYS-05)', async () => {
		const { body, rows } = await rpc(['read'], 'tools/call', {
			name: 'list_positions',
			arguments: { status: 'holding' }
		});
		expect(body.result.isError).toBeFalsy();
		expect(body.result.structuredContent.positions[0]).toMatchObject({ qty: 10 });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			tool: 'list_positions',
			result: 'ok',
			owner_id: OWNER_A,
			request_id: '1:req-1'
		});
	});

	it('get_report miss returns NOT_FOUND and audits an error', async () => {
		const { body, rows } = await rpc(['read'], 'tools/call', {
			name: 'get_report',
			arguments: { id: '10000000-0000-4000-8000-0000000000ff' }
		});
		expect(body.result.isError).toBe(true);
		expect(body.result.structuredContent.code).toBe('NOT_FOUND');
		expect(rows[0]).toMatchObject({ tool: 'get_report', result: 'error', error_code: 'NOT_FOUND' });
	});

	it('env-mode call (repo null) returns an INTERNAL error envelope, still audited', async () => {
		const { body, rows } = await rpc(
			['read'],
			'tools/call',
			{ name: 'list_reports', arguments: {} },
			null
		);
		expect(body.result.isError).toBe(true);
		expect(body.result.structuredContent.code).toBe('INTERNAL');
		expect(rows[0]).toMatchObject({ tool: 'list_reports', result: 'error' });
	});

	it('whoami still works without a repo', async () => {
		const { body, rows } = await rpc(
			['read'],
			'tools/call',
			{ name: 'whoami', arguments: {} },
			null
		);
		expect(body.result.structuredContent.bot).toBe('stub-bot');
		expect(rows[0]).toMatchObject({ tool: 'whoami', result: 'ok' });
	});
});
