/**
 * BE-06 — MCP read tools (scope `read`). Every handler runs through
 * registerAuditedTool → runAuditedToolCall (scope gate + audit + error envelope).
 *
 * Owner scoping (R-SYS-01): handlers only call `$lib/server/repo` list/get helpers with
 * the registration-time RepoClient, which force `owner_id` on every query. They never
 * build their own queries.
 *
 * R-PERM-13: position numbers are the approved values only; proposed values appear
 * solely inside `pending_proposals[]` and are never merged into position fields.
 */
import { z } from 'zod';
import {
	getReportById,
	listDecisions,
	listEvents,
	listInstruments,
	listJournalEntries,
	listPositionProposals,
	listPositions,
	listReports,
	type RepoClient
} from '$lib/server/repo';
import { McpToolError } from '../errors';
import { assertToolScope } from '../scopes';
import { MCP_SERVER_VERSION } from '../version';
import { unwrapDb } from './db-error';
import { registerAuditedTool, type ToolHandler, type ToolRegistrationContext } from './register';

type Row = Record<string, unknown>;
type Shape = Record<string, z.ZodType>;

const ACTIVE_PROPOSAL_STATUSES = ['pending', 'on_hold'] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UPCOMING_EVENT_DAYS = 14;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const REPORT_KINDS = [
	'daily_brief',
	'weekly_report',
	'equity_analysis',
	'realestate_brief',
	'realestate_analysis',
	'strategy',
	'principles'
] as const;

const REPORT_LIST_FIELDS = [
	'id',
	'kind',
	'subtype',
	'domain',
	'slug',
	'title',
	'headline',
	'summary',
	'report_date',
	'period_start',
	'period_end',
	'tags',
	'tickers',
	'status',
	'version',
	'created_at',
	'updated_at',
	'archived_at'
] as const;

const REPORT_DETAIL_EXTRA_FIELDS = ['meta', 'toc', 'generated_at'] as const;

const INSTRUMENT_FIELDS = [
	'id',
	'ticker',
	'name',
	'market',
	'asset_type',
	'sector',
	'aliases',
	'is_watchlist',
	'updated_at',
	'archived_at'
] as const;

const POSITION_FIELDS = [
	'id',
	'instrument_id',
	'status',
	'currency',
	'qty',
	'avg_price',
	'breakeven',
	'base_price',
	'base_at',
	'trigger_price',
	'trigger_direction',
	'watch_only',
	'memo',
	'closed_at',
	'version',
	'approval_version',
	'updated_at',
	'archived_at'
] as const;

const PROPOSAL_FIELDS = [
	'id',
	'display_id',
	'display_no',
	'change_type',
	'status',
	'position_id',
	'instrument_id',
	'proposed_values',
	'current_values',
	'applied_values',
	'result_position_id',
	'reason_md',
	'calc_note',
	'evidence',
	'base_version',
	'proposed_by_type',
	'expires_at',
	'held_at',
	'decided_at',
	'decision_note',
	'created_at',
	'updated_at'
] as const;

const JOURNAL_FIELDS = [
	'id',
	'entry_date',
	'kind',
	'state',
	'instrument_id',
	'tickers',
	'title',
	'price',
	'qty',
	'avg_price',
	'breakeven',
	'currency',
	'report_id',
	'source_url',
	'created_at',
	'updated_at',
	'archived_at'
] as const;

const DECISION_FIELDS = [
	'id',
	'title',
	'status',
	'due_date',
	'decided_at',
	'context_md',
	'decision_md',
	'options',
	'instrument_id',
	'report_id',
	'created_at',
	'updated_at',
	'archived_at'
] as const;

const EVENT_FIELDS = [
	'id',
	'event_date',
	'event_time',
	'title',
	'domain',
	'kind',
	'status',
	'amount',
	'currency',
	'is_estimated',
	'link',
	'instrument_id',
	'meta',
	'created_at',
	'updated_at',
	'archived_at'
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const limitField = z
	.number()
	.int()
	.min(1)
	.max(MAX_LIMIT)
	.default(DEFAULT_LIMIT)
	.describe(`최대 반환 개수 (기본 ${DEFAULT_LIMIT}, 최대 ${MAX_LIMIT})`);
const includeArchivedField = z
	.boolean()
	.default(false)
	.describe('보관(archived)된 행 포함 여부 (기본 false)');

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) {
		throw new McpToolError(
			'INTERNAL',
			[
				{
					rule: 'R-SYS-01',
					message: 'owner-scoped repository is unavailable (env/spike mode has no owner)'
				}
			],
			'owner-scoped repository is unavailable'
		);
	}
	return repo;
}

function parseArgs<S extends Shape>(
	shape: S,
	args: Record<string, unknown>
): z.infer<z.ZodObject<S>> {
	const parsed = z.object(shape).safeParse(args);
	if (!parsed.success) {
		throw new McpToolError(
			'VALIDATION',
			parsed.error.issues.map((issue) => ({
				rule: 'R-VAL-ARGS',
				field: issue.path.join('.') || undefined,
				message: issue.message
			}))
		);
	}
	return parsed.data;
}

function pick(row: Row, fields: readonly string[]): Row {
	const out: Row = {};
	for (const f of fields) {
		if (f in row) out[f] = row[f];
	}
	return out;
}

function rowsOf(value: unknown[]): Row[] {
	return value as Row[];
}

function str(row: Row, field: string): string {
	const v = row[field];
	return typeof v === 'string' ? v : '';
}

function compareDesc(...fields: string[]) {
	return (a: Row, b: Row): number => {
		for (const f of fields) {
			const x = str(a, f);
			const y = str(b, f);
			if (x !== y) return x < y ? 1 : -1;
		}
		return 0;
	};
}

function kstToday(now = Date.now()): string {
	return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstDatePlusDays(days: number, now = Date.now()): string {
	return new Date(now + KST_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10);
}

function listResult(key: string, items: Row[], total: number) {
	return { [key]: items, count: items.length, total, truncated: items.length < total };
}

function projectReport(row: Row, includeBody: boolean, detail: boolean): Row {
	const fields = detail
		? [...REPORT_LIST_FIELDS, ...REPORT_DETAIL_EXTRA_FIELDS]
		: REPORT_LIST_FIELDS;
	const out = pick(row, fields);
	if (includeBody) {
		out.body_md = row.body_md ?? null;
		if (detail) out.body_blocks = row.body_blocks ?? null;
	}
	return out;
}

function isActiveProposal(row: Row): boolean {
	return (ACTIVE_PROPOSAL_STATUSES as readonly string[]).includes(str(row, 'status'));
}

function groupPendingByPosition(proposals: Row[]): Map<string, Row[]> {
	const map = new Map<string, Row[]>();
	for (const p of proposals) {
		if (!isActiveProposal(p)) continue;
		const positionId = str(p, 'position_id');
		if (!positionId) continue;
		const bucket = map.get(positionId) ?? [];
		bucket.push(pick(p, PROPOSAL_FIELDS));
		map.set(positionId, bucket);
	}
	return map;
}

type InstrumentBrief = { ticker: unknown; name: unknown; market: unknown; asset_type: unknown };

function instrumentIndex(instruments: Row[]): Map<string, InstrumentBrief> {
	const map = new Map<string, InstrumentBrief>();
	for (const i of instruments) {
		map.set(str(i, 'id'), {
			ticker: i.ticker,
			name: i.name,
			market: i.market,
			asset_type: i.asset_type
		});
	}
	return map;
}

/** Approved position values + instrument label. Proposed values are never merged in (R-PERM-13). */
function projectPosition(row: Row, instruments: Map<string, InstrumentBrief>): Row {
	const base = pick(row, POSITION_FIELDS);
	const instrument = instruments.get(str(row, 'instrument_id')) ?? null;
	return {
		...base,
		ticker: instrument?.ticker ?? null,
		name: instrument?.name ?? null,
		market: instrument?.market ?? null
	};
}

const whoamiHandler: ToolHandler = async ({ ctx }) => ({
	data: {
		bot: ctx.botName,
		bot_client_id: ctx.botClientId,
		scopes: [...ctx.scopes],
		auth_mode: ctx.mode,
		server_time: new Date().toISOString(),
		version: MCP_SERVER_VERSION
	}
});

const dashboardShape = {} satisfies Shape;

export const getDashboardContextHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	parseArgs(dashboardShape, args);
	const repo = requireRepo(maybeRepo);
	const from = kstToday();
	const to = kstDatePlusDays(UPCOMING_EVENT_DAYS);
	const [reports, positions, instruments, proposals, decisions, events] = await Promise.all([
		listReports(repo),
		listPositions(repo),
		listInstruments(repo, { includeArchived: true }),
		listPositionProposals(repo),
		listDecisions(repo, { status: 'open' }),
		listEvents(repo, { from, to })
	]);

	const latest = rowsOf(unwrapDb(reports)).sort(compareDesc('report_date', 'updated_at'))[0];
	const instrumentById = instrumentIndex(rowsOf(unwrapDb(instruments)));
	const holdings = rowsOf(unwrapDb(positions))
		.filter((p) => str(p, 'status') === 'holding')
		.map((p) => projectPosition(p, instrumentById));
	const pending = rowsOf(unwrapDb(proposals))
		.filter(isActiveProposal)
		.sort(compareDesc('created_at'))
		.map((p) => pick(p, PROPOSAL_FIELDS));
	const openDecisions = rowsOf(unwrapDb(decisions)).map((d) => pick(d, DECISION_FIELDS));
	const upcoming = rowsOf(unwrapDb(events))
		.filter((e) => str(e, 'status') !== 'cancelled')
		.map((e) => pick(e, EVENT_FIELDS));

	return {
		data: {
			latest_report: latest ? projectReport(latest, false, false) : null,
			positions: holdings,
			pending_proposals: pending,
			decisions: openDecisions,
			upcoming_events: upcoming
		}
	};
};

const getReportShape = {
	id: z.string().uuid().describe('report id (uuid)'),
	include_body: z.boolean().default(true).describe('본문(body_md) 포함 여부 (기본 true)')
} satisfies Shape;

export const getReportHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(getReportShape, args);
	const repo = requireRepo(maybeRepo);
	const row = unwrapDb(await getReportById(repo, input.id));
	if (!row) {
		throw new McpToolError('NOT_FOUND', [
			{ rule: 'R-SYS-01', field: 'id', message: `report '${input.id}' not found` }
		]);
	}
	return { data: { report: projectReport(row as Row, input.include_body, true) } };
};

const listReportsShape = {
	kind: z.enum(REPORT_KINDS).optional().describe('report kind 필터'),
	domain: z.enum(['macro', 'stock', 'realestate']).optional(),
	ticker: z.string().min(1).optional().describe('tickers[] 포함 필터'),
	from: isoDate.optional().describe('report_date >= from'),
	to: isoDate.optional().describe('report_date <= to'),
	include_body: z.boolean().default(false).describe('본문(body_md) 포함 여부 (기본 false)'),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

export const listReportsHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listReportsShape, args);
	const repo = requireRepo(maybeRepo);
	const all = rowsOf(
		unwrapDb(await listReports(repo, { includeArchived: input.include_archived }))
	);
	const filtered = all
		.filter((r) => !input.kind || r.kind === input.kind)
		.filter((r) => !input.domain || r.domain === input.domain)
		.filter((r) => !input.ticker || (Array.isArray(r.tickers) && r.tickers.includes(input.ticker)))
		.filter((r) => !input.from || str(r, 'report_date') >= input.from)
		.filter((r) => !input.to || str(r, 'report_date') <= input.to)
		.sort(compareDesc('report_date', 'updated_at'));
	const items = filtered
		.slice(0, input.limit)
		.map((r) => projectReport(r, input.include_body, false));
	return { data: listResult('reports', items, filtered.length) };
};

const searchShape = {
	q: z.string().trim().min(1).max(200).describe('검색어 (공백 구분, 모두 포함, 대소문자 무시)'),
	kind: z.enum(REPORT_KINDS).optional(),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

function searchHaystack(row: Row): string {
	const parts = [row.title, row.headline, row.summary]
		.filter((v): v is string => typeof v === 'string')
		.join(' ');
	return parts.toLowerCase();
}

export const searchHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(searchShape, args);
	const repo = requireRepo(maybeRepo);
	const terms = input.q.toLowerCase().split(/\s+/).filter(Boolean);
	const all = rowsOf(
		unwrapDb(await listReports(repo, { includeArchived: input.include_archived }))
	);
	const matched = all
		.filter((r) => !input.kind || r.kind === input.kind)
		.filter((r) => {
			const hay = searchHaystack(r);
			return terms.every((t) => hay.includes(t));
		})
		.sort(compareDesc('report_date', 'updated_at'));
	const items = matched.slice(0, input.limit).map((r) => projectReport(r, false, false));
	return { data: listResult('reports', items, matched.length) };
};

const listInstrumentsShape = {
	asset_type: z.enum(['stock', 'etf', 'bond', 'cash']).optional(),
	market: z.string().min(1).optional(),
	watchlist_only: z.boolean().default(false),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

export const listInstrumentsHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listInstrumentsShape, args);
	const repo = requireRepo(maybeRepo);
	const all = rowsOf(
		unwrapDb(await listInstruments(repo, { includeArchived: input.include_archived }))
	);
	const filtered = all
		.filter((i) => !input.asset_type || i.asset_type === input.asset_type)
		.filter((i) => !input.market || i.market === input.market)
		.filter((i) => !input.watchlist_only || i.is_watchlist === true)
		.sort((a, b) => str(a, 'ticker').localeCompare(str(b, 'ticker')));
	const items = filtered.slice(0, input.limit).map((i) => pick(i, INSTRUMENT_FIELDS));
	return { data: listResult('instruments', items, filtered.length) };
};

const listPositionsShape = {
	status: z.enum(['holding', 'planned', 'closed']).optional(),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

export const listPositionsHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listPositionsShape, args);
	const repo = requireRepo(maybeRepo);
	const [positions, instruments, proposals] = await Promise.all([
		listPositions(repo, { includeArchived: input.include_archived }),
		listInstruments(repo, { includeArchived: true }),
		listPositionProposals(repo)
	]);
	const instrumentById = instrumentIndex(rowsOf(unwrapDb(instruments)));
	const pendingByPosition = groupPendingByPosition(rowsOf(unwrapDb(proposals)));
	const filtered = rowsOf(unwrapDb(positions)).filter(
		(p) => !input.status || p.status === input.status
	);
	const items = filtered.slice(0, input.limit).map((p) => ({
		...projectPosition(p, instrumentById),
		pending_proposals: pendingByPosition.get(str(p, 'id')) ?? []
	}));
	return { data: listResult('positions', items, filtered.length) };
};

const PROPOSAL_STATUSES = [
	'pending',
	'on_hold',
	'approved',
	'rejected',
	'superseded',
	'cancelled',
	'expired',
	'conflict'
] as const;

const listProposalsShape = {
	status: z
		.enum([...PROPOSAL_STATUSES, 'active', 'all'])
		.default('active')
		.describe("상태 필터. 'active'=pending+on_hold (기본), 'all'=전체"),
	position_id: z.string().uuid().optional(),
	limit: limitField
} satisfies Shape;

function matchesProposalStatus(row: Row, status: string): boolean {
	if (status === 'all') return true;
	if (status === 'active') return isActiveProposal(row);
	return row.status === status;
}

export const listProposalsHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listProposalsShape, args);
	const repo = requireRepo(maybeRepo);
	const filtered = rowsOf(unwrapDb(await listPositionProposals(repo)))
		.filter((p) => matchesProposalStatus(p, input.status))
		.filter((p) => !input.position_id || p.position_id === input.position_id)
		.sort(compareDesc('created_at'));
	const items = filtered.slice(0, input.limit).map((p) => pick(p, PROPOSAL_FIELDS));
	return { data: listResult('proposals', items, filtered.length) };
};

const listJournalShape = {
	kind: z.enum(['buy', 'sell', 'thought', 'plan', 'review']).optional(),
	state: z.enum(['pending', 'done', 'hold', 'closed']).optional(),
	ticker: z.string().min(1).optional().describe('tickers[] 포함 필터'),
	from: isoDate.optional().describe('entry_date >= from'),
	to: isoDate.optional().describe('entry_date <= to'),
	include_body: z.boolean().default(false).describe('메모(memo_md) 포함 여부 (기본 false)'),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

export const listJournalEntriesHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listJournalShape, args);
	const repo = requireRepo(maybeRepo);
	const all = rowsOf(
		unwrapDb(await listJournalEntries(repo, { includeArchived: input.include_archived }))
	);
	const filtered = all
		.filter((j) => !input.kind || j.kind === input.kind)
		.filter((j) => !input.state || j.state === input.state)
		.filter((j) => !input.ticker || (Array.isArray(j.tickers) && j.tickers.includes(input.ticker)))
		.filter((j) => !input.from || str(j, 'entry_date') >= input.from)
		.filter((j) => !input.to || str(j, 'entry_date') <= input.to)
		.sort(compareDesc('entry_date', 'created_at'));
	const items = filtered.slice(0, input.limit).map((j) => {
		const out = pick(j, JOURNAL_FIELDS);
		if (input.include_body) out.memo_md = j.memo_md ?? null;
		return out;
	});
	return { data: listResult('journal_entries', items, filtered.length) };
};

const listDecisionsShape = {
	status: z.enum(['open', 'decided', 'dropped']).optional(),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

export const listDecisionsHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listDecisionsShape, args);
	const repo = requireRepo(maybeRepo);
	const all = rowsOf(
		unwrapDb(
			await listDecisions(repo, {
				status: input.status,
				includeArchived: input.include_archived
			})
		)
	);
	const items = all.slice(0, input.limit).map((d) => pick(d, DECISION_FIELDS));
	return { data: listResult('decisions', items, all.length) };
};

const listEventsShape = {
	from: isoDate.optional().describe('event_date >= from (from/to 모두 없으면 오늘(KST)부터)'),
	to: isoDate.optional().describe('event_date <= to'),
	domain: z.enum(['stock', 'realestate', 'macro']).optional(),
	status: z.enum(['scheduled', 'tentative', 'done', 'cancelled']).optional(),
	include_archived: includeArchivedField,
	limit: limitField
} satisfies Shape;

export const listEventsHandler: ToolHandler = async ({ args, repo: maybeRepo }) => {
	const input = parseArgs(listEventsShape, args);
	const repo = requireRepo(maybeRepo);
	const from = input.from ?? (input.to ? undefined : kstToday());
	const all = rowsOf(
		unwrapDb(
			await listEvents(repo, {
				from,
				to: input.to,
				domain: input.domain,
				includeArchived: input.include_archived
			})
		)
	);
	const filtered = all.filter((e) => !input.status || e.status === input.status);
	const items = filtered.slice(0, input.limit).map((e) => pick(e, EVENT_FIELDS));
	return { data: listResult('events', items, filtered.length) };
};

type ReadToolDef = {
	name: string;
	title: string;
	description: string;
	shape: Shape;
	handler: ToolHandler;
};

export const READ_TOOL_DEFS: readonly ReadToolDef[] = [
	{
		name: 'whoami',
		title: 'Who am I',
		description: '인증된 봇 이름·스코프·서버 시각을 돌려준다(연결 확인용).',
		shape: {},
		handler: whoamiHandler
	},
	{
		name: 'get_dashboard_context',
		title: 'Dashboard context',
		description:
			'대시보드 요약: 최신 리포트, 승인된 보유 종목, 대기 중 제안(pending/on_hold), 열린 의사결정, 향후 14일 이벤트.',
		shape: dashboardShape,
		handler: getDashboardContextHandler
	},
	{
		name: 'get_report',
		title: 'Get report',
		description: 'id로 리포트 1건을 조회한다. include_body=false면 본문을 제외한다.',
		shape: getReportShape,
		handler: getReportHandler
	},
	{
		name: 'list_reports',
		title: 'List reports',
		description:
			'리포트 목록(headline·summary 포함, 본문 제외가 기본). 보관된 리포트는 기본 제외. 최신순.',
		shape: listReportsShape,
		handler: listReportsHandler
	},
	{
		name: 'search',
		title: 'Search reports',
		description:
			'리포트 title/headline/summary 대소문자 무시 검색(모든 검색어 포함). 본문은 반환하지 않는다.',
		shape: searchShape,
		handler: searchHandler
	},
	{
		name: 'list_instruments',
		title: 'List instruments',
		description: '종목 마스터 목록. 보관된 종목은 기본 제외.',
		shape: listInstrumentsShape,
		handler: listInstrumentsHandler
	},
	{
		name: 'list_positions',
		title: 'List positions',
		description:
			'포지션 목록(승인된 수량·평단 등). 대기 중 제안은 pending_proposals[]로만 첨부되며 포지션 값에 합쳐지지 않는다(R-PERM-13).',
		shape: listPositionsShape,
		handler: listPositionsHandler
	},
	{
		name: 'list_proposals',
		title: 'List position proposals',
		description: '포지션 변경 제안 목록. 기본은 pending+on_hold.',
		shape: listProposalsShape,
		handler: listProposalsHandler
	},
	{
		name: 'list_journal_entries',
		title: 'List journal entries',
		description: '매매일지 목록(최신순). 메모 본문은 include_body=true일 때만.',
		shape: listJournalShape,
		handler: listJournalEntriesHandler
	},
	{
		name: 'list_decisions',
		title: 'List decisions',
		description: '의사결정 목록(마감일순).',
		shape: listDecisionsShape,
		handler: listDecisionsHandler
	},
	{
		name: 'list_events',
		title: 'List events',
		description: '일정/이벤트 목록(날짜 오름차순). from/to 모두 없으면 오늘(KST)부터.',
		shape: listEventsShape,
		handler: listEventsHandler
	}
];

/** Register the read tools the key's scopes allow (tools/list stays scope-filtered). */
export function registerReadTools(reg: ToolRegistrationContext): void {
	for (const def of READ_TOOL_DEFS) {
		if (assertToolScope(reg.ctx, def.name) !== null) continue;
		registerAuditedTool(reg, {
			name: def.name,
			title: def.title,
			description: def.description,
			inputSchema: def.shape,
			annotations: { readOnlyHint: true, idempotentHint: true },
			handler: def.handler
		});
	}
}
