import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { createStubMcpContext } from '../testing';
import type { McpContext, McpToolResult } from '../types';

type Row = Record<string, unknown>;

const BOT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_BOT = '00000000-0000-4000-8000-000000000002';
const INSTR_ID = '11111111-1111-4111-8111-111111111111';

const db = vi.hoisted(() => ({
	journal: [] as Row[],
	instruments: [] as Row[],
	created: [] as Row[],
	updated: [] as Array<{ id: string; patch: Row }>,
	archivedIds: [] as string[],
	positionWrites: [] as string[]
}));

vi.mock('$lib/server/repo', () => {
	const ok = <T>(data: T) => ({ data, error: null });
	const positionWrite = (name: string) => async () => {
		db.positionWrites.push(name);
		return ok(null);
	};
	return {
		listInstruments: async () => ok(db.instruments),
		getInstrumentByTicker: async (_r: unknown, ticker: string) =>
			ok(db.instruments.find((i) => i.ticker === ticker) ?? null),
		listJournalEntries: async () => ok(db.journal),
		createJournalEntry: async (_r: unknown, input: Row) => {
			const existing = input.client_ref
				? db.journal.find((r) => r.client_ref === input.client_ref)
				: undefined;
			if (existing) return ok(existing);
			db.created.push(input);
			const row = {
				id: `je-${db.journal.length + 1}`,
				archived_at: null,
				source_bot_id: BOT_ID,
				client_ref: null,
				tickers: [],
				...input
			};
			db.journal.push(row);
			return ok(row);
		},
		updateJournalEntry: async (_r: unknown, id: string, patch: Row) => {
			db.updated.push({ id, patch });
			const row = db.journal.find((r) => r.id === id);
			if (row) Object.assign(row, patch);
			return ok(row ?? null);
		},
		archiveJournalEntry: async (_r: unknown, id: string) => {
			db.archivedIds.push(id);
			const row = db.journal.find((r) => r.id === id);
			if (row) row.archived_at = '2026-11-21T00:00:00Z';
			return { error: null };
		},
		createPosition: positionWrite('createPosition'),
		updatePosition: positionWrite('updatePosition'),
		createPositionProposal: positionWrite('createPositionProposal')
	};
});

const ALL_SCOPES = ['read', 'journal:write'];

type ToolCb = (args: unknown, extra?: unknown) => Promise<McpToolResult>;

async function harness(ctxOverrides: Partial<McpContext> = {}) {
	const { registerJournalTools } = await import('./journal');
	const ctx = createStubMcpContext({
		scopes: ALL_SCOPES,
		botClientId: BOT_ID,
		...ctxOverrides
	});
	const tools = new Map<string, ToolCb>();
	const server = {
		registerTool: (name: string, _config: unknown, cb: ToolCb) => tools.set(name, cb)
	} as unknown as McpServer;
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	registerJournalTools({
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
	return result.structuredContent as Row & { warnings?: Array<{ rule: string; message: string }> };
}

function ruleIds(result: McpToolResult): string[] {
	return errorOf(result).errors.map((e) => e.rule);
}

function buyArgs(overrides: Row = {}): Row {
	return {
		entry_date: '2026-11-20',
		kind: 'buy',
		state: 'done',
		title: '삼성전자 매수',
		ticker: '005930',
		price: 70000,
		qty: 10,
		currency: 'KRW',
		...overrides
	};
}

function thoughtArgs(overrides: Row = {}): Row {
	return {
		entry_date: '2026-11-20',
		kind: 'thought',
		state: 'pending',
		title: '시장 메모',
		...overrides
	};
}

beforeEach(() => {
	db.journal = [];
	db.created = [];
	db.updated = [];
	db.archivedIds = [];
	db.positionWrites = [];
	db.instruments = [
		{ id: INSTR_ID, ticker: '005930', name: '삼성전자', market: 'KRX', archived_at: null },
		{
			id: '22222222-2222-4222-8222-222222222222',
			ticker: 'GOOGL',
			name: 'Alphabet',
			market: 'NASDAQ',
			archived_at: null
		}
	];
});

describe('registration', () => {
	it('registers the journal tools only for keys with journal:write', async () => {
		const withScope = await harness();
		expect([...withScope.tools.keys()].sort()).toEqual([
			'add_journal_entry',
			'archive_journal_entry',
			'update_journal_entry'
		]);
		const readOnly = await harness({ scopes: ['read'] });
		expect(readOnly.tools.size).toBe(0);
	});
});

describe('add_journal_entry', () => {
	it('creates a thought without an instrument', async () => {
		const h = await harness();
		const out = dataOf(await h.call('add_journal_entry', thoughtArgs()));
		expect(out).toMatchObject({ id: 'je-1', created: true });
		expect(out.warnings).toBeUndefined();
		expect(db.created[0]).toMatchObject({ kind: 'thought', title: '시장 메모' });
		expect(db.created[0].instrument_id).toBeUndefined();
		expect(h.sink.rows[0].affected_ids).toEqual([{ table: 'journal_entries', id: 'je-1' }]);
	});

	it('replays the same client_ref with created:false and no second row (Q-08)', async () => {
		const h = await harness();
		const args = thoughtArgs({ client_ref: 'bot-run-42' });
		const first = dataOf(await h.call('add_journal_entry', args));
		const second = dataOf(await h.call('add_journal_entry', args));
		expect(first).toMatchObject({ id: 'je-1', created: true });
		expect(second).toMatchObject({ id: 'je-1', created: false });
		expect(db.created).toHaveLength(1);
	});

	it('rejects a buy missing price with R-VAL-J02', async () => {
		const h = await harness();
		const result = await h.call('add_journal_entry', buyArgs({ price: undefined }));
		expect(ruleIds(result)).toContain('R-VAL-J02');
		expect(errorOf(result).code).toBe('VALIDATION');
		expect(db.created).toHaveLength(0);
	});

	it('rejects a buy without any instrument (J02 + J03)', async () => {
		const h = await harness();
		const result = await h.call('add_journal_entry', buyArgs({ ticker: undefined }));
		expect(ruleIds(result)).toEqual(expect.arrayContaining(['R-VAL-J02', 'R-VAL-J03']));
		expect(db.created).toHaveLength(0);
	});

	it('rejects a buy whose ticker is unknown', async () => {
		const h = await harness();
		const result = await h.call('add_journal_entry', buyArgs({ ticker: 'NOPE' }));
		expect(ruleIds(result)).toContain('R-VAL-C04');
		expect(db.created).toHaveLength(0);
	});

	it('rejects price without currency (R-VAL-J05)', async () => {
		const h = await harness();
		const result = await h.call(
			'add_journal_entry',
			thoughtArgs({ price: 1000, currency: undefined })
		);
		expect(ruleIds(result)).toContain('R-VAL-J05');
	});

	it('buy success resolves the ticker and warns R-PERM-02 without touching positions', async () => {
		const h = await harness();
		const out = dataOf(await h.call('add_journal_entry', buyArgs()));
		expect(out).toMatchObject({ id: 'je-1', created: true });
		expect(out.warnings).toEqual([{ rule: 'R-PERM-02', message: '제안 필요' }]);
		expect(db.created[0]).toMatchObject({ kind: 'buy', instrument_id: INSTR_ID, price: 70000 });
		expect(db.created[0].ticker).toBeUndefined();
		// FE-10 filters on tickers[] — instrument code is filled in even when omitted
		expect(db.created[0].tickers).toEqual(['005930']);
		expect(db.positionWrites).toEqual([]);
		expect(h.sink.rows[0].warnings).toEqual([{ rule: 'R-PERM-02', message: '제안 필요' }]);
	});

	it('buy/sell fills instrument ticker into tickers[] without duplicating', async () => {
		const h = await harness();
		dataOf(await h.call('add_journal_entry', buyArgs({ tickers: ['005930', 'GOOGL'] })));
		expect(db.created[0].tickers).toEqual(['005930', 'GOOGL']);
		dataOf(
			await h.call(
				'add_journal_entry',
				buyArgs({
					kind: 'sell',
					ticker: undefined,
					instrument_id: INSTR_ID,
					client_ref: 'sell-1',
					tickers: undefined
				})
			)
		);
		expect(db.created[1].tickers).toEqual(['005930']);
	});

	it('sell success with instrument_id also warns R-PERM-02, no position writes', async () => {
		const h = await harness();
		const out = dataOf(
			await h.call(
				'add_journal_entry',
				buyArgs({ kind: 'sell', ticker: undefined, instrument_id: INSTR_ID })
			)
		);
		expect(out.warnings?.map((w) => w.rule)).toEqual(['R-PERM-02']);
		expect(db.created[0].tickers).toEqual(['005930']);
		expect(db.positionWrites).toEqual([]);
	});

	it('rejects an unknown code in tickers[]', async () => {
		const h = await harness();
		const result = await h.call('add_journal_entry', thoughtArgs({ tickers: ['005930', 'ZZZZ'] }));
		expect(errorOf(result).errors).toEqual([
			expect.objectContaining({ rule: 'R-VAL-C04', field: 'tickers' })
		]);
		expect(db.created).toHaveLength(0);
	});

	it('accepts known tickers[] and warns R-VAL-J08 when tags carry ticker codes', async () => {
		const h = await harness();
		const out = dataOf(
			await h.call('add_journal_entry', thoughtArgs({ tickers: ['005930'], tags: ['GOOGL', 'AI'] }))
		);
		expect(out.warnings?.map((w) => w.rule)).toEqual(['R-VAL-J08']);
		expect(db.created[0]).toMatchObject({ tickers: ['005930'] });
		expect(db.created[0].tags).toBeUndefined();
	});

	it('validates required fields and enums', async () => {
		const h = await harness();
		const result = await h.call('add_journal_entry', {
			entry_date: '2026-13-40',
			kind: 'dream',
			state: 'done',
			title: ''
		});
		expect(ruleIds(result)).toEqual(
			expect.arrayContaining(['R-VAL-T01', 'R-VAL-J01', 'R-VAL-S05'])
		);
	});
});

describe('update_journal_entry', () => {
	it('updates own entry with a patch', async () => {
		const h = await harness();
		await h.call('add_journal_entry', thoughtArgs());
		const out = dataOf(
			await h.call('update_journal_entry', {
				id: 'je-1',
				patch: { state: 'done', memo_md: '정리' }
			})
		);
		expect(out).toMatchObject({ id: 'je-1', updated: true });
		expect(db.updated[0]).toEqual({ id: 'je-1', patch: { state: 'done', memo_md: '정리' } });
	});

	it('rejects another bot row with R-PERM-01', async () => {
		db.journal = [
			{ id: 'je-x', kind: 'thought', archived_at: null, source_bot_id: OTHER_BOT, tickers: [] }
		];
		const h = await harness();
		const result = await h.call('update_journal_entry', { id: 'je-x', patch: { state: 'done' } });
		expect(ruleIds(result)).toEqual(['R-PERM-01']);
		expect(db.updated).toHaveLength(0);
	});

	it('rejects a user-written row (null source_bot_id) with R-PERM-01', async () => {
		db.journal = [{ id: 'je-u', kind: 'thought', archived_at: null, source_bot_id: null }];
		const h = await harness();
		const result = await h.call('update_journal_entry', { id: 'je-u', patch: { state: 'done' } });
		expect(ruleIds(result)).toEqual(['R-PERM-01']);
	});

	it('re-checks trade rules on the merged row and warns on success', async () => {
		const h = await harness();
		await h.call('add_journal_entry', buyArgs());
		const bad = await h.call('update_journal_entry', { id: 'je-1', patch: { currency: null } });
		expect(ruleIds(bad)).toEqual(expect.arrayContaining(['R-VAL-J02']));
		const good = dataOf(
			await h.call('update_journal_entry', { id: 'je-1', patch: { price: 71000 } })
		);
		expect(good.warnings?.map((w) => w.rule)).toEqual(['R-PERM-02']);
		expect(db.positionWrites).toEqual([]);
	});

	it('rejects unknown tickers in a patch and non-updatable keys', async () => {
		const h = await harness();
		await h.call('add_journal_entry', thoughtArgs());
		const unknownTicker = await h.call('update_journal_entry', {
			id: 'je-1',
			patch: { tickers: ['ZZZZ'] }
		});
		expect(ruleIds(unknownTicker)).toContain('R-VAL-C04');
		const clientRef = await h.call('update_journal_entry', {
			id: 'je-1',
			patch: { client_ref: 'new' }
		});
		expect(errorOf(clientRef).code).toBe('VALIDATION');
		expect(db.updated).toHaveLength(0);
	});

	it('returns NOT_FOUND for a missing id', async () => {
		const h = await harness();
		const result = await h.call('update_journal_entry', { id: 'nope', patch: { state: 'done' } });
		expect(errorOf(result).code).toBe('NOT_FOUND');
	});
});

describe('archive_journal_entry', () => {
	it('archives own entry', async () => {
		const h = await harness();
		await h.call('add_journal_entry', thoughtArgs());
		const out = dataOf(await h.call('archive_journal_entry', { id: 'je-1' }));
		expect(out).toMatchObject({ id: 'je-1', archived: true });
		expect(db.archivedIds).toEqual(['je-1']);
	});

	it('rejects archiving another bot row with R-PERM-01', async () => {
		db.journal = [{ id: 'je-x', archived_at: null, source_bot_id: OTHER_BOT }];
		const h = await harness();
		const result = await h.call('archive_journal_entry', { id: 'je-x' });
		expect(ruleIds(result)).toEqual(['R-PERM-01']);
		expect(db.archivedIds).toHaveLength(0);
	});

	it('is idempotent on an already archived own entry', async () => {
		db.journal = [{ id: 'je-a', archived_at: '2026-11-01T00:00:00Z', source_bot_id: BOT_ID }];
		const h = await harness();
		const out = dataOf(await h.call('archive_journal_entry', { id: 'je-a' }));
		expect(out.archived).toBe(true);
		expect(db.archivedIds).toHaveLength(0);
	});
});
