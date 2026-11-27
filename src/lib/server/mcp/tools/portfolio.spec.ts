import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { createStubMcpContext } from '../testing';
import type { McpContext, McpToolResult } from '../types';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
	const state = {
		instruments: [] as Row[],
		positions: [] as Row[],
		proposals: [] as Row[],
		reports: [] as Row[],
		journal: [] as Row[],
		nextDisplayNo: 412,
		createdProposalInputs: [] as Row[],
		createdPositionInputs: [] as Row[],
		updatedPositionPatches: [] as Row[]
	};
	return state;
});

vi.mock('$lib/server/repo', () => {
	const ok = <T>(data: T) => ({ data, error: null });
	return {
		listInstruments: async () => ok(db.instruments),
		getInstrumentByTicker: async (_r: unknown, ticker: string) =>
			ok(db.instruments.find((i) => i.ticker === ticker) ?? null),
		listPositions: async () => ok(db.positions.filter((p) => !p.archived_at)),
		createPosition: async (_r: unknown, input: Row) => {
			db.createdPositionInputs.push(input);
			const row = {
				id: `pos-${db.positions.length + 1}`,
				version: 1,
				approval_version: 1,
				watch_only: false,
				trigger_price: null,
				breakeven: null,
				base_price: null,
				base_at: null,
				memo: null,
				archived_at: null,
				...input
			};
			db.positions.push(row);
			return ok(row);
		},
		updatePosition: async (_r: unknown, id: string, patch: Row) => {
			db.updatedPositionPatches.push(patch);
			const row = db.positions.find((p) => p.id === id);
			if (!row) return ok(null);
			Object.assign(row, patch, { version: (row.version as number) + 1 });
			return ok(row);
		},
		getReportById: async (_r: unknown, id: string) =>
			ok(db.reports.find((r) => r.id === id) ?? null),
		listJournalEntries: async () => ok(db.journal),
		listPositionProposals: async () => ok(db.proposals),
		getPositionProposalById: async (_r: unknown, id: string) =>
			ok(db.proposals.find((p) => p.id === id) ?? null),
		getPositionProposalByDisplayId: async (_r: unknown, displayId: string) =>
			ok(db.proposals.find((p) => p.display_id === displayId) ?? null),
		createPositionProposal: async (_r: unknown, input: Row) => {
			db.createdProposalInputs.push(input);
			const id = `prop-${db.proposals.length + 1}`;
			const no = db.nextDisplayNo++;
			const position = db.positions.find((p) => p.id === input.position_id);
			for (const p of db.proposals) {
				if (
					['pending', 'on_hold'].includes(p.status as string) &&
					p.position_id === input.position_id
				) {
					p.status = 'superseded';
					p.decision_note = `superseded by ${id}`;
				}
			}
			const row = {
				...input,
				id,
				display_no: no,
				display_id: `P-${String(no).padStart(4, '0')}`,
				status: 'pending',
				proposed_by_type: 'bot',
				proposed_by: 'bot-from-header',
				current_values: position
					? { status: position.status, qty: position.qty, avg_price: position.avg_price }
					: null
			};
			db.proposals.push(row);
			return ok(row);
		},
		updateProposalStatus: async (_r: unknown, id: string, t: { from: string[]; to: string }) => {
			const row = db.proposals.find((p) => p.id === id && t.from.includes(p.status as string));
			if (!row) return ok(null);
			row.status = t.to;
			return ok(row);
		}
	};
});

const BOT_ID = '00000000-0000-4000-8000-000000000001';

const ALL_SCOPES = ['read', 'positions:annotate', 'positions:propose'];

type ToolCb = (args: unknown, extra?: unknown) => Promise<McpToolResult>;

async function harness(ctxOverrides: Partial<McpContext> = {}) {
	const { registerPortfolioTools } = await import('./portfolio');
	const ctx = createStubMcpContext({ scopes: ALL_SCOPES, ...ctxOverrides });
	const tools = new Map<string, ToolCb>();
	const server = {
		registerTool: (name: string, _config: unknown, cb: ToolCb) => tools.set(name, cb)
	} as unknown as McpServer;
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	registerPortfolioTools({
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

const EVIDENCE = [{ report_id: 'rep-1' }];

beforeEach(() => {
	db.instruments = [
		{ id: 'ins-stock', ticker: '005930', name: 'Samsung', asset_type: 'stock', archived_at: null },
		{ id: 'ins-cash', ticker: 'KRW-CASH', name: 'Cash', asset_type: 'cash', archived_at: null }
	];
	db.positions = [
		{
			id: 'pos-holding',
			instrument_id: 'ins-stock',
			status: 'holding',
			currency: 'KRW',
			qty: 10,
			avg_price: 70000,
			trigger_price: 60000,
			trigger_direction: 'above',
			watch_only: false,
			breakeven: null,
			base_price: null,
			base_at: null,
			memo: null,
			version: 3,
			approval_version: 2,
			archived_at: null
		},
		{
			id: 'pos-planned',
			instrument_id: 'ins-cash',
			status: 'planned',
			currency: 'KRW',
			qty: 0,
			avg_price: null,
			trigger_price: null,
			trigger_direction: 'above',
			watch_only: false,
			breakeven: null,
			base_price: null,
			base_at: null,
			memo: null,
			version: 1,
			approval_version: 1,
			archived_at: null
		}
	];
	db.proposals = [];
	db.reports = [{ id: 'rep-1' }];
	db.journal = [{ id: 'jnl-1' }];
	db.nextDisplayNo = 412;
	db.createdProposalInputs = [];
	db.createdPositionInputs = [];
	db.updatedPositionPatches = [];
});

describe('create_planned_position', () => {
	it('creates status=planned qty=0 avg_price=null and defaults trigger_direction=below (R-VAL-P15)', async () => {
		const h = await harness();
		const res = dataOf(
			await h.call('create_planned_position', { ticker: '005930', currency: 'KRW', memo: 'watch' })
		);
		expect(res).toMatchObject({ status: 'planned', qty: 0, avg_price: null, ticker: '005930' });
		expect(db.createdPositionInputs[0]).toMatchObject({
			status: 'planned',
			qty: 0,
			avg_price: null,
			trigger_direction: 'below',
			instrument_id: 'ins-stock',
			memo: 'watch'
		});
		expect(h.sink.rows[0]).toMatchObject({ tool: 'create_planned_position', result: 'ok' });
		expect(h.sink.rows[0].rule_ids).toContain('R-VAL-P15');
	});

	it('accepts instrument_id instead of ticker', async () => {
		const h = await harness();
		dataOf(await h.call('create_planned_position', { instrument_id: 'ins-cash', currency: 'KRW' }));
		expect(db.createdPositionInputs[0].instrument_id).toBe('ins-cash');
	});

	it('qty / avg_price keys present -> ERROR R-VAL-P01', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('create_planned_position', {
				ticker: '005930',
				currency: 'KRW',
				qty: 5,
				avg_price: null
			})
		);
		expect(err.code).toBe('VALIDATION');
		expect(err.errors.map((e) => e.rule)).toEqual(['R-VAL-P01', 'R-VAL-P01']);
		expect(db.createdPositionInputs).toHaveLength(0);
		expect(h.sink.rows[0]).toMatchObject({ result: 'error', error_code: 'VALIDATION' });
	});

	it('watch_only=true + trigger_price -> ERROR R-VAL-P13', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('create_planned_position', {
				ticker: '005930',
				currency: 'KRW',
				watch_only: true,
				trigger_price: 300000
			})
		);
		expect(err.errors.map((e) => e.rule)).toContain('R-VAL-P13');
		expect(db.createdPositionInputs).toHaveLength(0);
	});

	it('non finance-manager writing trigger fields -> 403 R-PERM-17', async () => {
		const h = await harness({ profile: 'equity-analyst' });
		const err = errorOf(
			await h.call('create_planned_position', {
				ticker: '005930',
				currency: 'KRW',
				trigger_price: 50000
			})
		);
		expect(err.code).toBe('FORBIDDEN_SCOPE');
		expect(err.errors[0].rule).toBe('R-PERM-17');
		expect(h.sink.rows[0]).toMatchObject({ result: 'denied' });
		expect(db.createdPositionInputs).toHaveLength(0);
	});

	it('non finance-manager may create without trigger fields', async () => {
		const h = await harness({ profile: 'equity-analyst' });
		dataOf(await h.call('create_planned_position', { ticker: '005930', currency: 'KRW' }));
		expect(db.createdPositionInputs).toHaveLength(1);
	});

	it('unknown ticker -> NOT_FOUND', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('create_planned_position', { ticker: 'NOPE', currency: 'KRW' })
		);
		expect(err.code).toBe('NOT_FOUND');
	});
});

describe('update_position_reference', () => {
	it('qty / avg_price -> ERROR R-VAL-P01', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('update_position_reference', { position_id: 'pos-holding', qty: 99 })
		);
		expect(err.errors[0].rule).toBe('R-VAL-P01');
		expect(db.updatedPositionPatches).toHaveLength(0);
	});

	it('omitted trigger_direction keeps existing value (R-VAL-P15)', async () => {
		const h = await harness();
		const res = dataOf(
			await h.call('update_position_reference', {
				position_id: 'pos-holding',
				trigger_price: 55000
			})
		);
		expect(db.updatedPositionPatches[0]).toEqual({ trigger_price: 55000 });
		expect(Object.hasOwn(db.updatedPositionPatches[0], 'trigger_direction')).toBe(false);
		expect((res.after as Row).trigger_direction).toBe('above');
		expect((res.before as Row).trigger_price).toBe(60000);
		expect(h.sink.rows[0].rule_ids).toEqual(expect.arrayContaining(['R-VAL-P15', 'R-PERM-17']));
	});

	it('explicit trigger_direction is written', async () => {
		const h = await harness();
		dataOf(
			await h.call('update_position_reference', {
				position_id: 'pos-holding',
				trigger_direction: 'below'
			})
		);
		expect(db.updatedPositionPatches[0]).toEqual({ trigger_direction: 'below' });
	});

	it('watch_only=true + trigger_price -> ERROR R-VAL-P13', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('update_position_reference', {
				position_id: 'pos-planned',
				watch_only: true,
				trigger_price: 1000
			})
		);
		expect(err.errors.map((e) => e.rule)).toContain('R-VAL-P13');
	});

	it('watch_only=true while existing trigger_price stays set -> ERROR R-VAL-P13', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('update_position_reference', { position_id: 'pos-holding', watch_only: true })
		);
		expect(err.errors.map((e) => e.rule)).toContain('R-VAL-P13');
	});

	it('watch_only=true with trigger_price=null is allowed', async () => {
		const h = await harness();
		dataOf(
			await h.call('update_position_reference', {
				position_id: 'pos-holding',
				watch_only: true,
				trigger_price: null
			})
		);
		expect(db.updatedPositionPatches[0]).toEqual({ watch_only: true, trigger_price: null });
	});

	it('non finance-manager writing trigger/direction/watch_only -> 403 R-PERM-17', async () => {
		const h = await harness({ profile: 'equity-analyst' });
		for (const field of [
			{ trigger_price: 1 },
			{ trigger_direction: 'below' },
			{ watch_only: true }
		]) {
			const err = errorOf(
				await h.call('update_position_reference', { position_id: 'pos-holding', ...field })
			);
			expect(err.code).toBe('FORBIDDEN_SCOPE');
			expect(err.errors[0].rule).toBe('R-PERM-17');
		}
		expect(db.updatedPositionPatches).toHaveLength(0);
	});

	it('non finance-manager may update memo / base_price', async () => {
		const h = await harness({ profile: 'equity-analyst' });
		dataOf(
			await h.call('update_position_reference', {
				position_id: 'pos-holding',
				memo: 'note',
				base_price: 71000
			})
		);
		expect(db.updatedPositionPatches[0]).toEqual({ memo: 'note', base_price: 71000 });
	});

	it('unknown position -> NOT_FOUND', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('update_position_reference', { position_id: 'nope', memo: 'x' })
		);
		expect(err.code).toBe('NOT_FOUND');
	});
});

describe('propose_position_change', () => {
	const base = {
		change_type: 'set_qty_avg',
		position_id: 'pos-holding',
		proposed_values: { qty: 12 },
		evidence: EVIDENCE,
		calc_note: '10주 + 2주 추가매수'
	};

	it('creates a pending proposal with server display_id, current_values and no warnings', async () => {
		const h = await harness();
		const res = dataOf(await h.call('propose_position_change', base));
		expect(res).toMatchObject({
			proposal_id: 'prop-1',
			display_id: 'P-0412',
			status: 'pending'
		});
		expect(res.current_values).toMatchObject({ qty: 10, avg_price: 70000 });
		expect(res.warnings).toBeUndefined();
		expect(db.createdProposalInputs[0]).toMatchObject({
			change_type: 'set_qty_avg',
			position_id: 'pos-holding',
			proposed_values: { qty: 12 },
			evidence: EVIDENCE
		});
		expect(h.sink.rows[0]).toMatchObject({ tool: 'propose_position_change', result: 'ok' });
	});

	it('display_id comes from the server row, not computed by the tool', async () => {
		db.nextDisplayNo = 10000;
		const h = await harness();
		const res = dataOf(await h.call('propose_position_change', base));
		expect(res.display_id).toBe('P-10000');
	});

	it('reports superseded_ids for earlier pending proposals on the same position', async () => {
		db.proposals.push({
			id: 'old-1',
			position_id: 'pos-holding',
			status: 'pending',
			display_id: 'P-0411'
		});
		const h = await harness();
		const res = dataOf(await h.call('propose_position_change', base));
		expect(res.superseded_ids).toEqual(['old-1']);
	});

	it('missing calc_note on open_holding/set_qty_avg is a WARN (R-VAL-P09), not an error', async () => {
		const h = await harness();
		const res = dataOf(await h.call('propose_position_change', { ...base, calc_note: undefined }));
		expect(res.warnings?.map((w) => w.rule)).toEqual(['R-VAL-P09']);
		expect(h.sink.rows[0].warnings.map((w) => w.rule)).toContain('R-VAL-P09');
	});

	it('empty evidence -> ERROR R-VAL-P07', async () => {
		const h = await harness();
		for (const evidence of [[], undefined, [{ note: 'no ids' }]]) {
			const err = errorOf(await h.call('propose_position_change', { ...base, evidence }));
			expect(err.code).toBe('VALIDATION');
			expect(err.errors[0].rule).toBe('R-VAL-P07');
		}
		expect(db.createdProposalInputs).toHaveLength(0);
	});

	it('evidence pointing at a missing report/journal -> ERROR R-VAL-P10', async () => {
		const h = await harness();
		const e1 = errorOf(
			await h.call('propose_position_change', { ...base, evidence: [{ report_id: 'ghost' }] })
		);
		expect(e1.errors[0].rule).toBe('R-VAL-P10');
		const e2 = errorOf(
			await h.call('propose_position_change', {
				...base,
				evidence: [{ journal_entry_id: 'ghost' }]
			})
		);
		expect(e2.errors[0].rule).toBe('R-VAL-P10');
		dataOf(
			await h.call('propose_position_change', {
				...base,
				evidence: [{ journal_entry_id: 'jnl-1' }]
			})
		);
	});

	it('proposed_values with trigger_* / breakeven / watch_only -> ERROR R-VAL-P07', async () => {
		const h = await harness();
		for (const key of ['trigger_price', 'trigger_direction', 'breakeven', 'watch_only']) {
			const err = errorOf(
				await h.call('propose_position_change', {
					...base,
					proposed_values: { qty: 12, [key]: key === 'watch_only' ? true : 1 }
				})
			);
			expect(err.errors[0].rule).toBe('R-VAL-P07');
			expect(err.errors[0].field).toBe(`proposed_values.${key}`);
		}
		expect(db.createdProposalInputs).toHaveLength(0);
	});

	it('change_type set_trigger / set_breakeven -> ERROR R-VAL-P07', async () => {
		const h = await harness();
		for (const change_type of ['set_trigger', 'set_breakeven']) {
			const err = errorOf(
				await h.call('propose_position_change', { ...base, change_type, proposed_values: {} })
			);
			expect(err.errors[0].rule).toBe('R-VAL-P07');
			expect(err.errors[0].field).toBe('change_type');
		}
	});

	it('same values as current approved -> ERROR R-VAL-P07', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('propose_position_change', {
				...base,
				proposed_values: { qty: 10, avg_price: 70000 }
			})
		);
		expect(err.errors[0].rule).toBe('R-VAL-P07');
		expect(err.errors[0].message).toMatch(/equal current/);
		expect(db.createdProposalInputs).toHaveLength(0);
	});

	it('partially different values are accepted', async () => {
		const h = await harness();
		dataOf(
			await h.call('propose_position_change', {
				...base,
				proposed_values: { qty: 10, avg_price: 71000 }
			})
		);
	});

	it('M03: fractional stock qty -> ERROR R-VAL-M03', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('propose_position_change', { ...base, proposed_values: { qty: 12.5 } })
		);
		expect(err.errors.map((e) => e.rule)).toContain('R-VAL-M03');
		expect(db.createdProposalInputs).toHaveLength(0);
	});

	it('M03: cash allows 2 decimals but not 3', async () => {
		const h = await harness();
		const open = {
			change_type: 'open_holding',
			position_id: 'pos-planned',
			evidence: EVIDENCE,
			calc_note: 'cash'
		};
		dataOf(
			await h.call('propose_position_change', {
				...open,
				proposed_values: { qty: 100.25, avg_price: 1 }
			})
		);
		const err = errorOf(
			await h.call('propose_position_change', {
				...open,
				proposed_values: { qty: 100.255, avg_price: 1 }
			})
		);
		expect(err.errors.map((e) => e.rule)).toContain('R-VAL-M03');
	});

	it('open_holding needs qty and avg_price (R-VAL-P04)', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('propose_position_change', {
				change_type: 'open_holding',
				ticker: '005930',
				proposed_values: { qty: 3 },
				evidence: EVIDENCE
			})
		);
		expect(err.errors[0].rule).toBe('R-VAL-P04');
	});

	it('open_holding by ticker proposes against the instrument', async () => {
		const h = await harness();
		dataOf(
			await h.call('propose_position_change', {
				change_type: 'open_holding',
				ticker: '005930',
				proposed_values: { qty: 3, avg_price: 70000, currency: 'KRW' },
				evidence: EVIDENCE,
				calc_note: '3주 @ 70,000'
			})
		);
		expect(db.createdProposalInputs[0]).toMatchObject({ instrument_id: 'ins-stock' });
		expect(Object.hasOwn(db.createdProposalInputs[0], 'position_id')).toBe(false);
	});

	it('close needs no proposed values', async () => {
		const h = await harness();
		const res = dataOf(
			await h.call('propose_position_change', {
				change_type: 'close',
				position_id: 'pos-holding',
				proposed_values: {},
				evidence: EVIDENCE
			})
		);
		expect(res.status).toBe('pending');
		expect(res.warnings).toBeUndefined();
	});

	it('proposed_by* claims are ignored (R-VAL-P11 / R-PERM-03)', async () => {
		const h = await harness();
		dataOf(
			await h.call('propose_position_change', {
				...base,
				proposed_by: '99999999-9999-4999-8999-999999999999',
				proposed_by_type: 'user',
				proposed_by_user: 'user-1',
				owner_id: 'someone-else'
			})
		);
		const sent = db.createdProposalInputs[0];
		for (const key of ['proposed_by', 'proposed_by_type', 'proposed_by_user', 'owner_id']) {
			expect(Object.hasOwn(sent, key)).toBe(false);
		}
		expect(h.sink.rows[0].rule_ids).toContain('R-PERM-03');
	});

	it('equity-analyst without positions:propose is denied by the gate', async () => {
		const h = await harness({ profile: 'equity-analyst', scopes: ['read', 'positions:annotate'] });
		expect(h.tools.has('propose_position_change')).toBe(false);
		expect(h.tools.has('cancel_proposal')).toBe(false);
		expect(h.tools.has('update_position_reference')).toBe(true);

		const { assertToolScope } = await import('../scopes');
		const denied = assertToolScope(
			{ scopes: ['read', 'positions:annotate'] },
			'propose_position_change'
		);
		expect(denied?.structuredContent.code).toBe('FORBIDDEN_SCOPE');
		expect(denied?.structuredContent.errors[0].rule).toBe('R-PERM-04');
	});

	it('import:all does not unlock proposal tools', async () => {
		const h = await harness({ scopes: ['import:all'] });
		expect(h.tools.has('propose_position_change')).toBe(false);
		expect(h.tools.has('cancel_proposal')).toBe(false);
	});

	it('R-FMT-13: avg_price keeps at most 4 decimals on open_holding (D-4)', async () => {
		const h = await harness();
		const open = {
			change_type: 'open_holding',
			ticker: '005930',
			evidence: EVIDENCE,
			calc_note: 'decimals'
		};
		const accepted = [23090.01, 1350.063, 8192.0001, 123456789.1234];
		for (const avg of accepted) {
			const res = dataOf(
				await h.call('propose_position_change', {
					...open,
					proposed_values: { qty: 1, avg_price: avg, currency: 'USD' }
				})
			);
			expect(res.status, String(avg)).toBe('pending');
			expect(db.createdProposalInputs.at(-1)).toMatchObject({
				proposed_values: expect.objectContaining({ avg_price: avg })
			});
		}
		const storedBeforeReject = db.createdProposalInputs.length;
		for (const avg of [1.00005, 0.00001]) {
			const err = errorOf(
				await h.call('propose_position_change', {
					...open,
					proposed_values: { qty: 1, avg_price: avg, currency: 'USD' }
				})
			);
			expect(err.code, String(avg)).toBe('VALIDATION');
			expect(
				err.errors.map((e) => e.rule),
				String(avg)
			).toContain('R-FMT-13');
			const fmt = err.errors.find((e) => e.rule === 'R-FMT-13');
			expect(fmt?.field).toBe('proposed_values.avg_price');
			expect(fmt?.message).toBe('[R-FMT-13] USD/KRW unit prices keep at most 4 decimals on write');
		}
		expect(db.createdProposalInputs).toHaveLength(storedBeforeReject);
	});

	it('R-FMT-13: avg_price keeps at most 4 decimals on set_qty_avg', async () => {
		const h = await harness();
		const base = {
			change_type: 'set_qty_avg',
			position_id: 'pos-holding',
			evidence: EVIDENCE,
			calc_note: 'decimals'
		};
		dataOf(
			await h.call('propose_position_change', {
				...base,
				proposed_values: { avg_price: 8192.0001 }
			})
		);
		const stored = db.createdProposalInputs.length;
		const err = errorOf(
			await h.call('propose_position_change', {
				...base,
				proposed_values: { avg_price: 1.00005 }
			})
		);
		expect(err.code).toBe('VALIDATION');
		expect(err.errors.map((e) => e.rule)).toContain('R-FMT-13');
		expect(db.createdProposalInputs).toHaveLength(stored);
	});
});

describe('cancel_proposal', () => {
	function seed(overrides: Row) {
		db.proposals.push({
			id: 'p-1',
			display_id: 'P-0001',
			status: 'pending',
			proposed_by_type: 'bot',
			proposed_by: BOT_ID,
			...overrides
		});
	}

	it('cancels own pending and on_hold proposals', async () => {
		const h = await harness();
		seed({});
		seed({ id: 'p-2', display_id: 'P-0002', status: 'on_hold' });
		const r1 = dataOf(await h.call('cancel_proposal', { proposal_id: 'p-1' }));
		expect(r1).toMatchObject({ proposal_id: 'p-1', status: 'cancelled', display_id: 'P-0001' });
		const r2 = dataOf(await h.call('cancel_proposal', { display_id: 'P-0002' }));
		expect(r2.status).toBe('cancelled');
		expect(h.sink.rows[0].affected_ids).toEqual([{ table: 'position_proposals', id: 'p-1' }]);
	});

	it("rejects someone else's proposal", async () => {
		const h = await harness();
		seed({ proposed_by: '11111111-1111-4111-8111-111111111111' });
		const err = errorOf(await h.call('cancel_proposal', { proposal_id: 'p-1' }));
		expect(err.code).toBe('FORBIDDEN_SCOPE');
		expect(db.proposals[0].status).toBe('pending');
	});

	it('rejects user-authored proposals', async () => {
		const h = await harness();
		seed({ proposed_by_type: 'user', proposed_by: null });
		const err = errorOf(await h.call('cancel_proposal', { proposal_id: 'p-1' }));
		expect(err.code).toBe('FORBIDDEN_SCOPE');
	});

	it('rejects non pending/on_hold statuses', async () => {
		const h = await harness();
		for (const status of [
			'approved',
			'rejected',
			'superseded',
			'cancelled',
			'expired',
			'conflict'
		]) {
			db.proposals = [];
			seed({ status });
			const err = errorOf(await h.call('cancel_proposal', { proposal_id: 'p-1' }));
			expect(err.code).toBe('CONFLICT');
			expect(db.proposals[0].status).toBe(status);
		}
	});

	it('unknown proposal -> NOT_FOUND', async () => {
		const h = await harness();
		const err = errorOf(await h.call('cancel_proposal', { proposal_id: 'ghost' }));
		expect(err.code).toBe('NOT_FOUND');
	});
});

describe('through the real MCP SDK (zod schemas keep qty/avg_price reachable)', () => {
	it('qty direct write returns R-VAL-P01 instead of being stripped', async () => {
		const { registerPortfolioTools } = await import('./portfolio');
		const ctx = createStubMcpContext({ scopes: ALL_SCOPES });
		const server = new McpServer({ name: 't', version: '0' }, { capabilities: { tools: {} } });
		const sink = createMemoryAuditSink();
		const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
		registerPortfolioTools({
			server,
			ctx,
			repo: { actor: { kind: 'bot', ownerId: ctx.ownerId, botClientId: ctx.botClientId } } as never,
			recorder,
			metaBase: {}
		});
		const [clientT, serverT] = InMemoryTransport.createLinkedPair();
		await server.connect(serverT);
		const client = new Client({ name: 'c', version: '0' });
		await client.connect(clientT);

		const listed = await client.listTools();
		expect(listed.tools.map((t) => t.name).sort()).toEqual([
			'cancel_proposal',
			'create_planned_position',
			'propose_position_change',
			'update_position_reference'
		]);

		const res = (await client.callTool({
			name: 'update_position_reference',
			arguments: { position_id: 'pos-holding', qty: 5 }
		})) as unknown as { isError?: boolean; structuredContent: { errors: Array<{ rule: string }> } };
		expect(res.isError).toBe(true);
		expect(res.structuredContent.errors[0].rule).toBe('R-VAL-P01');

		const proposed = (await client.callTool({
			name: 'propose_position_change',
			arguments: {
				change_type: 'set_qty_avg',
				position_id: 'pos-holding',
				proposed_values: { qty: 11 },
				evidence: EVIDENCE,
				calc_note: 'n',
				proposed_by_type: 'user'
			}
		})) as unknown as { isError?: boolean; structuredContent: { display_id: string } };
		expect(proposed.isError).toBeFalsy();
		expect(proposed.structuredContent.display_id).toBe('P-0412');
		expect(Object.hasOwn(db.createdProposalInputs[0], 'proposed_by_type')).toBe(false);
		await client.close();
	});
});
