import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { createStubMcpContext } from '../testing';
import type { McpToolResult } from '../types';
import { MAX_SNAPSHOT_BATCH } from '$lib/server/repo';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
	instruments: [] as Row[],
	created: [] as Row[],
	updated: [] as Array<{ id: string; patch: Row }>,
	priceBatches: [] as Row[][],
	portfolio: [] as Row[],
	indicators: [] as Row[][],
	decisions: [] as Row[],
	events: [] as Row[]
}));

vi.mock('$lib/server/repo', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/repo')>();
	const ok = <T>(data: T) => ({ data, error: null });
	return {
		...actual,
		listInstruments: async () => ok(db.instruments),
		getInstrumentByTicker: async (_r: unknown, ticker: string) =>
			ok(db.instruments.find((i) => i.ticker === ticker) ?? null),
		createInstrument: async (_r: unknown, input: Row) => {
			db.created.push(input);
			const row = { id: `inst-${db.instruments.length + 1}`, ...input };
			db.instruments.push(row);
			return ok(row);
		},
		updateInstrument: async (_r: unknown, id: string, patch: Row) => {
			db.updated.push({ id, patch });
			const row = db.instruments.find((i) => i.id === id);
			if (row) Object.assign(row, patch);
			return ok(row ?? null);
		},
		upsertPriceSnapshots: async (_r: unknown, rows: Row[]) => {
			if (rows.length > actual.MAX_SNAPSHOT_BATCH) {
				return {
					inserted: 0,
					updated: 0,
					error: new Error(`batch exceeds ${actual.MAX_SNAPSHOT_BATCH} rows`)
				};
			}
			db.priceBatches.push(rows);
			return { inserted: rows.length, updated: 0, error: null };
		},
		upsertPortfolioSnapshot: async (_r: unknown, input: Row) => {
			db.portfolio.push(input);
			return ok({ id: 1, as_of: input.as_of as string });
		},
		upsertMarketIndicators: async (_r: unknown, rows: Row[]) => {
			db.indicators.push(rows);
			return { count: rows.length, error: null };
		},
		createDecision: async (_r: unknown, input: Row) => {
			const row = { id: `dec-${db.decisions.length + 1}`, ...input };
			db.decisions.push(row);
			return ok(row);
		},
		getDecisionById: async (_r: unknown, id: string) =>
			ok(db.decisions.find((d) => d.id === id) ?? null),
		archiveDecision: async () => ({ error: null }),
		createEvent: async (_r: unknown, input: Row) => {
			const row = { id: `ev-${db.events.length + 1}`, ...input };
			db.events.push(row);
			return ok(row);
		},
		getEventById: async (_r: unknown, id: string) => ok(db.events.find((e) => e.id === id) ?? null),
		archiveEvent: async () => ({ error: null })
	};
});

const SCOPES = [
	'read',
	'instruments:write',
	'instruments:enrich',
	'prices:write',
	'portfolio:snapshot',
	'indicators:write',
	'decisions:write',
	'events:stock',
	'events:macro'
];

type ToolCb = (args: unknown, extra?: unknown) => Promise<McpToolResult>;

async function harness(scopes: string[] = SCOPES, profile = 'finance-manager') {
	const { registerMarketTools } = await import('./market');
	const ctx = createStubMcpContext({ scopes, profile });
	const tools = new Map<string, ToolCb>();
	const server = {
		registerTool: (name: string, _c: unknown, cb: ToolCb) => tools.set(name, cb)
	} as unknown as McpServer;
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	registerMarketTools({
		server,
		ctx,
		repo: { actor: { kind: 'bot', ownerId: ctx.ownerId!, botClientId: ctx.botClientId } } as never,
		recorder,
		metaBase: {}
	});
	return {
		tools,
		async call(name: string, args: Record<string, unknown>) {
			const cb = tools.get(name);
			if (!cb) throw new Error(`missing ${name}`);
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

beforeEach(() => {
	db.instruments = [];
	db.created = [];
	db.updated = [];
	db.priceBatches = [];
	db.portfolio = [];
	db.indicators = [];
	db.decisions = [];
	db.events = [];
});

describe('BE-10 market tools', () => {
	it('R-VAL-C01 rejects non-6-digit KRX ticker', async () => {
		const h = await harness();
		const res = await h.call('upsert_instrument', {
			ticker: '00593A',
			name: 'x',
			market: 'KRX',
			asset_type: 'stock'
		});
		expect(errorOf(res).errors[0]?.rule).toBe('R-VAL-C01');
	});

	it('R-VAL-C05 rejects alias input and returns candidates', async () => {
		db.instruments = [
			{
				id: 'i1',
				ticker: '005930',
				name: '삼성전자',
				market: 'KRX',
				asset_type: 'stock',
				aliases: ['삼성', 'Samsung']
			}
		];
		const h = await harness();
		const res = await h.call('upsert_instrument', {
			ticker: '삼성',
			name: 'x',
			market: 'KRX',
			asset_type: 'stock'
		});
		const err = errorOf(res).errors[0] as { rule: string; candidates?: unknown };
		expect(err.rule).toBe('R-VAL-C05');
		expect(err.candidates).toEqual([{ ticker: '005930', name: '삼성전자' }]);
	});

	it('instruments:enrich cannot change ticker/market/asset_type on existing', async () => {
		db.instruments = [
			{ id: 'i1', ticker: '005930', name: '삼성전자', market: 'KRX', asset_type: 'stock' }
		];
		const h = await harness(['instruments:enrich']);
		const res = await h.call('upsert_instrument', {
			ticker: '005930',
			name: '삼성전자',
			market: 'NASDAQ',
			asset_type: 'stock'
		});
		expect(errorOf(res).code).toBe('FORBIDDEN_SCOPE');
	});

	it('rejects batch > 500', async () => {
		const h = await harness();
		const rows = Array.from({ length: MAX_SNAPSHOT_BATCH + 1 }, (_, i) => ({
			instrument_id: 'i',
			as_of: '2026-11-20',
			close: i + 1,
			currency: 'KRW'
		}));
		expect(errorOf(await h.call('record_price_snapshots', { rows })).errors[0]?.message).toMatch(
			/500/
		);
	});

	it('R-VAL-I03 rejects unknown indicator keys', async () => {
		const h = await harness();
		const res = await h.call('record_market_indicators', {
			rows: [{ key: 'not_a_key', as_of: '2026-11-20', value: 1 }]
		});
		expect(errorOf(res).errors[0]?.rule).toBe('R-VAL-I03');
	});

	it('G-9 weights zod rejects non-object weights', async () => {
		const h = await harness();
		const res = await h.call('record_portfolio_snapshot', {
			as_of: '2026-11-20',
			weights: 'nope'
		});
		expect(errorOf(res).errors[0]?.field).toBe('weights');
	});

	it('event domain outside scope is FORBIDDEN', async () => {
		const h = await harness(['events:stock']);
		const res = await h.call('upsert_event', {
			event_date: '2026-12-01',
			title: '금리',
			domain: 'macro',
			kind: 'fomc'
		});
		expect(errorOf(res).code).toBe('FORBIDDEN_SCOPE');
	});

	it('upsert_instrument create + portfolio snapshot success path', async () => {
		const h = await harness();
		const created = await h.call('upsert_instrument', {
			ticker: '005930',
			name: '삼성전자',
			market: 'KRX',
			asset_type: 'stock'
		});
		expect(created.isError).not.toBe(true);
		expect(db.created[0]).toMatchObject({ ticker: '005930' });
		const snap = await h.call('record_portfolio_snapshot', {
			as_of: '2026-11-20',
			weights: { dollar_pct: 40, risk_pct: 26 },
			plan_distances: { items: [{ key: 'ai', current_pct: 26, limit_pct: 30 }] }
		});
		expect(snap.isError).not.toBe(true);
		expect(db.portfolio[0]).toMatchObject({ as_of: '2026-11-20' });
	});
});
