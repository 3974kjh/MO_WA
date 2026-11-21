import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { createStubMcpContext } from '../testing';
import type { McpContext, McpToolResult } from '../types';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
	reports: [] as Row[],
	sources: [] as Array<{ reportId: string; sources: Row[] }>,
	created: [] as Row[],
	updated: [] as Array<{ id: string; patch: Row }>,
	renderCaches: [] as Array<{ id: string; body_blocks: unknown; toc: unknown }>,
	archivedIds: [] as string[],
	replaceError: null as Error | null
}));

vi.mock('$lib/server/repo', () => {
	const ok = <T>(data: T) => ({ data, error: null });
	return {
		getReportByNaturalKey: async (
			_r: unknown,
			key: { kind: string; reportDate: string; slug: string }
		) =>
			ok(
				db.reports.find(
					(r) => r.kind === key.kind && r.report_date === key.reportDate && r.slug === key.slug
				) ?? null
			),
		getReportById: async (_r: unknown, id: string) =>
			ok(db.reports.find((r) => r.id === id) ?? null),
		createReport: async (_r: unknown, input: Row) => {
			db.created.push(input);
			const row = {
				id: `rep-${db.reports.length + 1}`,
				version: 1,
				archived_at: null,
				source_bot_id: BOT_ID,
				...input
			};
			db.reports.push(row);
			return ok(row);
		},
		updateReport: async (_r: unknown, id: string, patch: Row) => {
			db.updated.push({ id, patch });
			const row = db.reports.find((r) => r.id === id);
			if (!row) return ok(null);
			const changed = row.body_md !== patch.body_md || row.title !== patch.title;
			Object.assign(row, patch, { version: (row.version as number) + (changed ? 1 : 0) });
			return ok(row);
		},
		setReportRenderCache: async (
			_r: unknown,
			id: string,
			columns: { body_blocks: unknown; toc: unknown }
		) => {
			db.renderCaches.push({ id, ...columns });
			const row = db.reports.find((r) => r.id === id);
			if (row) {
				row.body_blocks = columns.body_blocks;
				row.toc = columns.toc;
			}
			return { error: null };
		},
		replaceReportSources: async (_r: unknown, reportId: string, sources: Row[]) => {
			if (db.replaceError) return { error: db.replaceError };
			db.sources = db.sources.filter((s) => s.reportId !== reportId);
			db.sources.push({ reportId, sources });
			return { error: null };
		},
		archiveReport: async (_r: unknown, id: string) => {
			db.archivedIds.push(id);
			const row = db.reports.find((r) => r.id === id);
			if (row) row.archived_at = '2026-11-21T00:00:00Z';
			return { error: null };
		}
	};
});

const renderReport = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/markdown/render', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/markdown/render')>();
	renderReport.mockImplementation(actual.renderReport);
	return { ...actual, renderReport };
});

const BOT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_BOT = '00000000-0000-4000-8000-000000000002';

const ALL_SCOPES = [
	'read',
	'reports:daily_brief',
	'reports:weekly_report',
	'reports:equity_analysis',
	'reports:buy_plan_draft'
];

type ToolCb = (args: unknown, extra?: unknown) => Promise<McpToolResult>;

async function harness(ctxOverrides: Partial<McpContext> = {}) {
	const { registerReportsTools } = await import('./reports');
	const ctx = createStubMcpContext({ scopes: ALL_SCOPES, ...ctxOverrides });
	const tools = new Map<string, ToolCb>();
	const server = {
		registerTool: (name: string, _config: unknown, cb: ToolCb) => tools.set(name, cb)
	} as unknown as McpServer;
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	registerReportsTools({
		server,
		ctx,
		repo: { actor: { kind: 'bot', ownerId: ctx.ownerId, botClientId: ctx.botClientId } } as never,
		recorder,
		metaBase: {}
	});
	return {
		tools,
		sink,
		async call(name: string, args: Record<string, unknown>) {
			const cb = tools.get(name);
			if (!cb) throw new Error(`tool not registered: ${name}`);
			const result = await cb(args);
			await recorder.drain();
			return result;
		}
	};
}

function errorOf(result: McpToolResult) {
	expect(result.isError).toBe(true);
	return (result as Extract<McpToolResult, { isError: true }>).structuredContent;
}

function dataOf(result: McpToolResult) {
	expect(result.isError).not.toBe(true);
	return result.structuredContent as Row & { warnings?: Array<{ rule: string }> };
}

const SOURCES = [
	{
		label: 'BOK',
		publisher: '한국은행',
		accessed_at: '2026-11-21T00:00:00Z',
		url: 'https://bok.or.kr/x'
	}
];

function dailyArgs(overrides: Row = {}): Row {
	return {
		kind: 'daily_brief',
		report_date: '2026-11-20',
		slug: 'daily-2026-11-20',
		title: '데일리 브리핑',
		summary: '코스피 상승 마감',
		body_md: '## 시장\n\n본문입니다.\n\n> 본 자료는 투자 권유 아님.',
		sources: SOURCES,
		...overrides
	};
}

function ruleIds(result: McpToolResult): string[] {
	return errorOf(result).errors.map((e) => e.rule);
}

beforeEach(() => {
	db.reports = [];
	db.sources = [];
	db.created = [];
	db.updated = [];
	db.renderCaches = [];
	db.archivedIds = [];
	db.replaceError = null;
	renderReport.mockClear();
});

describe('registration', () => {
	it('registers only the report tools the key scopes allow', async () => {
		const withScope = await harness();
		expect([...withScope.tools.keys()].sort()).toEqual(['archive_report', 'upsert_report']);
		const readOnly = await harness({ scopes: ['read'] });
		expect(readOnly.tools.size).toBe(0);
	});
});

describe('upsert_report — create / update', () => {
	it('creates a report with defaults, sources and server-built cache', async () => {
		const h = await harness();
		const out = dataOf(await h.call('upsert_report', dailyArgs({ headline: '한 줄 요약' })));
		expect(out).toMatchObject({ id: 'rep-1', version: 1, created: true });
		expect(db.created).toHaveLength(1);
		expect(db.created[0]).toMatchObject({
			kind: 'daily_brief',
			domain: 'macro',
			status: 'published',
			headline: '한 줄 요약'
		});
		expect(typeof db.created[0].generated_at).toBe('string');
		expect(db.sources[0]).toMatchObject({ reportId: 'rep-1' });
		expect(db.sources[0].sources[0]).toMatchObject({ label: 'BOK', publisher: '한국은행' });
		expect(h.sink.rows[0].affected_ids).toEqual([{ table: 'reports', id: 'rep-1' }]);
	});

	it('same bot re-upsert updates in place with a version bump (created=false)', async () => {
		const h = await harness();
		await h.call('upsert_report', dailyArgs());
		const out = dataOf(
			await h.call(
				'upsert_report',
				dailyArgs({
					body_md: '## 수정\n\n변경 본문\n\n투자 조언이 아님.',
					sources: [{ label: 'KRX', publisher: '한국거래소' }]
				})
			)
		);
		expect(out).toMatchObject({ id: 'rep-1', version: 2, created: false });
		expect(db.reports).toHaveLength(1);
		expect(db.updated).toHaveLength(1);
		expect(db.sources).toHaveLength(1);
		expect(db.sources[0].sources).toHaveLength(1);
		expect(db.sources[0].sources[0].label).toBe('KRX');
	});

	it('another bot owning the key → CONFLICT (R-PERM-16 / R-VAL-R11) and no write', async () => {
		db.reports = [
			{
				id: 'rep-x',
				kind: 'daily_brief',
				report_date: '2026-11-20',
				slug: 'daily-2026-11-20',
				source_bot_id: OTHER_BOT,
				version: 1,
				archived_at: null
			}
		];
		const h = await harness();
		const err = errorOf(await h.call('upsert_report', dailyArgs()));
		expect(err.code).toBe('CONFLICT');
		expect(err.errors.map((e) => e.rule)).toEqual(['R-PERM-16', 'R-VAL-R11']);
		expect(err.errors[0].message).toMatch(/different slug/);
		expect(db.updated).toHaveLength(0);
		expect(db.created).toHaveLength(0);
	});

	it('user-owned key (null source_bot_id) → CONFLICT', async () => {
		db.reports = [
			{
				id: 'rep-u',
				kind: 'daily_brief',
				report_date: '2026-11-20',
				slug: 'daily-2026-11-20',
				source_bot_id: null,
				version: 1,
				archived_at: null
			}
		];
		const h = await harness();
		expect(errorOf(await h.call('upsert_report', dailyArgs())).code).toBe('CONFLICT');
	});

	it('own archived row cannot be silently reused', async () => {
		db.reports = [
			{
				id: 'rep-a',
				kind: 'daily_brief',
				report_date: '2026-11-20',
				slug: 'daily-2026-11-20',
				source_bot_id: BOT_ID,
				version: 1,
				archived_at: '2026-11-21T00:00:00Z'
			}
		];
		const h = await harness();
		expect(errorOf(await h.call('upsert_report', dailyArgs())).code).toBe('CONFLICT');
	});

	it('domain defaults follow R-VAL-R02', async () => {
		const h = await harness();
		await h.call('upsert_report', dailyArgs());
		await h.call(
			'upsert_report',
			dailyArgs({ kind: 'equity_analysis', slug: 'samsung-analysis', tickers: ['005930'] })
		);
		expect(db.created.map((c) => c.domain)).toEqual(['macro', 'stock']);
	});

	it('mismatched explicit domain is rejected (R-VAL-R02)', async () => {
		const h = await harness();
		expect(ruleIds(await h.call('upsert_report', dailyArgs({ domain: 'stock' })))).toContain(
			'R-VAL-R02'
		);
	});
});

describe('upsert_report — validation', () => {
	it('R-VAL-R09: body without disclaimer is rejected', async () => {
		const h = await harness();
		const res = await h.call('upsert_report', dailyArgs({ body_md: '## 시장\n\n면책 없음' }));
		expect(errorOf(res).code).toBe('VALIDATION');
		expect(ruleIds(res)).toContain('R-VAL-R09');
		expect(db.created).toHaveLength(0);
	});

	it('R-VAL-R07: empty or missing sources are rejected', async () => {
		const h = await harness();
		expect(ruleIds(await h.call('upsert_report', dailyArgs({ sources: [] })))).toContain(
			'R-VAL-R07'
		);
		const { sources: _s, ...noSources } = dailyArgs();
		void _s;
		expect(ruleIds(await h.call('upsert_report', noSources))).toContain('R-VAL-R07');
	});

	it('kind=principles is forbidden (R-PERM-04)', async () => {
		const h = await harness({ scopes: [...ALL_SCOPES, 'import:all'] });
		const err = errorOf(await h.call('upsert_report', dailyArgs({ kind: 'principles' })));
		expect(err.code).toBe('FORBIDDEN_SCOPE');
		expect(err.errors[0].rule).toBe('R-PERM-04');
		expect(db.created).toHaveLength(0);
	});

	it('buy_plan requires status=draft and the buy_plan_draft scope', async () => {
		const h = await harness();
		const base = dailyArgs({
			kind: 'equity_analysis',
			subtype: 'buy_plan',
			slug: 'samsung-buy-plan'
		});
		const published = await h.call('upsert_report', { ...base, status: 'published' });
		expect(errorOf(published).code).toBe('VALIDATION');
		expect(ruleIds(published)).toContain('R-VAL-R05');

		dataOf(await h.call('upsert_report', { ...base, status: 'draft' }));
		dataOf(await h.call('upsert_report', { ...base, slug: 'samsung-buy-plan-2' }));
		expect(db.created.map((c) => c.status)).toEqual(['draft', 'draft']);
		expect(db.created[0].subtype).toBe('buy_plan');

		const noScope = await harness({ scopes: ['reports:equity_analysis'] });
		const denied = errorOf(await noScope.call('upsert_report', base));
		expect(denied.code).toBe('FORBIDDEN_SCOPE');
	});

	it('kind scope mismatch is forbidden even with another report scope', async () => {
		const h = await harness({ scopes: ['reports:daily_brief'] });
		const err = errorOf(
			await h.call('upsert_report', dailyArgs({ kind: 'weekly_report', report_date: '2026-11-22' }))
		);
		expect(err.code).toBe('FORBIDDEN_SCOPE');
		expect(db.created).toHaveLength(0);
	});

	it('R-VAL-R12: headline over 120 chars or with newline is an ERROR; 81–120 is a WARN', async () => {
		const h = await harness();
		expect(
			ruleIds(await h.call('upsert_report', dailyArgs({ headline: 'a'.repeat(121) })))
		).toContain('R-VAL-R12');
		expect(ruleIds(await h.call('upsert_report', dailyArgs({ headline: 'a\nb' })))).toContain(
			'R-VAL-R12'
		);
		const warn = dataOf(await h.call('upsert_report', dailyArgs({ headline: 'a'.repeat(100) })));
		expect(warn.warnings?.map((w) => w.rule)).toContain('R-VAL-R12');
		expect(db.created).toHaveLength(1);
	});

	it('R-VAL-R04: summary over 3 lines is an ERROR; long line is a WARN', async () => {
		const h = await harness();
		expect(ruleIds(await h.call('upsert_report', dailyArgs({ summary: '1\n2\n3\n4' })))).toContain(
			'R-VAL-R04'
		);
		expect(ruleIds(await h.call('upsert_report', dailyArgs({ summary: '  ' })))).toContain(
			'R-VAL-R04'
		);
		const warn = dataOf(await h.call('upsert_report', dailyArgs({ summary: 'a'.repeat(130) })));
		expect(warn.warnings?.map((w) => w.rule)).toContain('R-VAL-R04');
	});

	it('R-VAL-T05: weekly_report must be a Sunday with period_start=date-6, period_end=date', async () => {
		const h = await harness();
		const weekly = (o: Row) =>
			dailyArgs({
				kind: 'weekly_report',
				slug: 'weekly-2026-11-22',
				report_date: '2026-11-22',
				...o
			});

		expect(ruleIds(await h.call('upsert_report', weekly({ report_date: '2026-11-21' })))).toContain(
			'R-VAL-T05'
		);
		expect(
			ruleIds(await h.call('upsert_report', weekly({ period_start: '2026-11-15' })))
		).toContain('R-VAL-T05');
		expect(ruleIds(await h.call('upsert_report', weekly({ period_end: '2026-11-21' })))).toContain(
			'R-VAL-T05'
		);

		dataOf(
			await h.call(
				'upsert_report',
				weekly({ period_start: '2026-11-16', period_end: '2026-11-22' })
			)
		);
		expect(db.created[0]).toMatchObject({
			period_start: '2026-11-16',
			period_end: '2026-11-22',
			domain: 'macro'
		});
	});

	it('weekly_report without explicit period gets the derived period filled in', async () => {
		const h = await harness();
		dataOf(
			await h.call(
				'upsert_report',
				dailyArgs({ kind: 'weekly_report', slug: 'weekly-2026-11-22', report_date: '2026-11-22' })
			)
		);
		expect(db.created[0]).toMatchObject({ period_start: '2026-11-16', period_end: '2026-11-22' });
	});

	it('R-VAL-R13: finance-manager equity_analysis target price is a WARN, not a rejection', async () => {
		const h = await harness({ profile: 'finance-manager' });
		const out = dataOf(
			await h.call(
				'upsert_report',
				dailyArgs({
					kind: 'equity_analysis',
					slug: 'samsung-analysis',
					body_md: '목표가 90,000원.\n\n투자 권유 아님.'
				})
			)
		);
		expect(out.warnings?.map((w) => w.rule)).toContain('R-VAL-R13');
		expect(h.sink.rows[0].warnings.map((w) => w.rule)).toContain('R-VAL-R13');
		expect(db.created).toHaveLength(1);
	});

	it('R-VAL-R14/R15 meta ERRORs reject the write', async () => {
		const h = await harness();
		expect(
			ruleIds(await h.call('upsert_report', dailyArgs({ meta: { candidates: [{ rank: 1 }] } })))
		).toContain('R-VAL-R14');
		expect(
			ruleIds(await h.call('upsert_report', dailyArgs({ meta: { alignment: 'aligned' } })))
		).toContain('R-VAL-R15');
		expect(db.created).toHaveLength(0);
	});

	it('rejects bad slug / date / title', async () => {
		const h = await harness();
		const res = await h.call(
			'upsert_report',
			dailyArgs({ slug: 'Bad Slug', report_date: '2026-13-40', title: '' })
		);
		expect(ruleIds(res)).toEqual(expect.arrayContaining(['R-VAL-S06', 'R-VAL-T05', 'R-VAL-S05']));
	});
});

describe('upsert_report — render cache (fe15-r3 + column RPC)', () => {
	it('ignores client body_blocks/toc/bodyBlocks; create/update omit them; RPC writes fe15-r3', async () => {
		const h = await harness();
		dataOf(
			await h.call(
				'upsert_report',
				dailyArgs({
					body_blocks: { a: '<script>evil()</script>', b: '', hasSplit: false },
					bodyBlocks: { a: 'evil' },
					toc: [{ id: 'evil', text: 'evil', level: 2 }]
				})
			)
		);
		const input = db.created[0];
		expect(input.body_blocks).toBeUndefined();
		expect(input.toc).toBeUndefined();
		expect(input).not.toHaveProperty('bodyBlocks');
		expect(db.renderCaches).toHaveLength(1);
		const cache = db.renderCaches[0];
		const blocks = cache.body_blocks as {
			key: string;
			bodyBlocks: { a: string; hasSplit: boolean };
		};
		expect(blocks.key).toContain('fe15-r3');
		expect(blocks.bodyBlocks.a).not.toContain('evil');
		expect(blocks.bodyBlocks.a).toContain('본문입니다');
		expect((cache.toc as Array<{ text: string }>).map((t) => t.text)).toEqual(['시장']);
	});

	it('update refreshes the cache via RPC with the new body', async () => {
		const h = await harness();
		await h.call('upsert_report', dailyArgs());
		await h.call(
			'upsert_report',
			dailyArgs({ body_md: '## 새 제목\n\n새 본문\n\n투자 권유 아님.' })
		);
		expect(db.updated[0].patch.body_blocks).toBeUndefined();
		const cache = db.renderCaches[1];
		expect((cache.toc as Array<{ text: string }>).map((t) => t.text)).toEqual(['새 제목']);
		expect((cache.body_blocks as { key: string }).key).toContain('fe15-r3');
	});

	it('render failure still saves body_md but clears the cache via RPC', async () => {
		renderReport.mockImplementationOnce(() => {
			throw new Error('boom');
		});
		const h = await harness();
		const out = dataOf(await h.call('upsert_report', dailyArgs()));
		expect(out.created).toBe(true);
		const input = db.created[0];
		expect(input.body_md).toContain('본문입니다');
		expect(input.body_blocks).toBeUndefined();
		expect(db.renderCaches[0]).toEqual({
			id: expect.any(String),
			body_blocks: null,
			toc: []
		});
	});

	it('fallback too-large is not cached (cleared via RPC)', async () => {
		renderReport.mockImplementationOnce(() => ({
			a: '…' as never,
			b: '' as never,
			hasSplit: false,
			toc: [],
			fallback: 'too-large' as const
		}));
		const h = await harness();
		dataOf(await h.call('upsert_report', dailyArgs()));
		expect(db.renderCaches[0].body_blocks).toBeNull();
		expect(db.renderCaches[0].toc).toEqual([]);
	});
});

describe('upsert_report — errors', () => {
	it('maps a replaceReportSources DB failure instead of leaking raw text', async () => {
		db.replaceError = Object.assign(new Error('boom'), { code: 'XX000' });
		const h = await harness();
		const res = await h.call('upsert_report', dailyArgs());
		expect(errorOf(res).code).toBe('INTERNAL');
	});
});

describe('archive_report', () => {
	beforeEach(() => {
		db.reports = [
			{
				id: 'rep-own',
				kind: 'daily_brief',
				subtype: null,
				source_bot_id: BOT_ID,
				archived_at: null
			},
			{
				id: 'rep-other',
				kind: 'daily_brief',
				subtype: null,
				source_bot_id: OTHER_BOT,
				archived_at: null
			},
			{
				id: 'rep-user',
				kind: 'daily_brief',
				subtype: null,
				source_bot_id: null,
				archived_at: null
			},
			{
				id: 'rep-weekly',
				kind: 'weekly_report',
				subtype: null,
				source_bot_id: BOT_ID,
				archived_at: null
			}
		];
	});

	it('archives own bot rows', async () => {
		const h = await harness();
		const out = dataOf(await h.call('archive_report', { id: 'rep-own' }));
		expect(out).toMatchObject({ id: 'rep-own', archived: true });
		expect(db.archivedIds).toEqual(['rep-own']);
	});

	it('rejects other bot / user rows with CONFLICT', async () => {
		const h = await harness();
		for (const id of ['rep-other', 'rep-user']) {
			expect(errorOf(await h.call('archive_report', { id })).code).toBe('CONFLICT');
		}
		expect(db.archivedIds).toHaveLength(0);
	});

	it('missing id → NOT_FOUND; missing kind scope → FORBIDDEN_SCOPE', async () => {
		const h = await harness({ scopes: ['reports:daily_brief'] });
		expect(errorOf(await h.call('archive_report', { id: 'nope' })).code).toBe('NOT_FOUND');
		expect(errorOf(await h.call('archive_report', { id: 'rep-weekly' })).code).toBe(
			'FORBIDDEN_SCOPE'
		);
		expect(errorOf(await h.call('archive_report', {})).code).toBe('VALIDATION');
	});

	it('is idempotent for an already archived own row', async () => {
		const h = await harness();
		await h.call('archive_report', { id: 'rep-own' });
		const again = dataOf(await h.call('archive_report', { id: 'rep-own' }));
		expect(again.archived).toBe(true);
		expect(db.archivedIds).toEqual(['rep-own']);
	});
});
