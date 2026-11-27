import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { createStubMcpContext } from '../testing';
import type { McpContext, McpToolResult } from '../types';
import { revalidateMergedForApprove } from '$lib/server/domain/proposals/revalidate';
import { proposedProblem, proposedProblemNote } from '$lib/queue/proposals';
import { makeItem } from '../../../../../tests/queue/testItem';

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

/**
 * 패리티: 봇 값 검증 규칙은 5곳(MCP validateProposedValues · revalidate.ts · validateOverrides · DB 트리거/RPC · 클라이언트
 * checkOverrideDraft/proposedProblem)에 따로 있다. 같은 케이스 표를 MCP propose 핸들러(소스 수정 없음)와 revalidate,
 * 클라이언트 proposedProblem 에 모두 돌려 첫 규칙 ID 가 같은지 고정한다(DB 쪽은 supabase/tests/approve_proposal_g3.psql 이 같은 표를 본다).
 * 규칙을 바꾸면 이 표와 DB 테스트를 같이 고친다. 공유 검증 모듈은 이후 별도 고위험 MCP 변경.
 */
type Case = {
	name: string;
	type: 'set_qty_avg' | 'open_holding';
	/** set_qty_avg 대상 종목 종류 */
	asset?: 'stock' | 'cash';
	values: Record<string, unknown>;
	/** 기대 첫 규칙 ID. null = 통과 */
	rule: string | null;
	/** MCP 가 다르게 말하는 경우(알려진 차이) */
	mcp?: string | null;
	/** 클라이언트 proposedProblem 이 다르게 말하는 경우(알려진 차이) */
	client?: string | null;
};

const CASES: Case[] = [
	{ name: 'qty 정상', type: 'set_qty_avg', values: { qty: 12 }, rule: null },
	{ name: 'avg 정상 4자리', type: 'set_qty_avg', values: { avg_price: 23090.0123 }, rule: null },
	{ name: 'qty 0', type: 'set_qty_avg', values: { qty: 0 }, rule: 'R-VAL-P04' },
	{ name: 'qty 음수', type: 'set_qty_avg', values: { qty: -1 }, rule: 'R-VAL-P04' },
	{ name: '주식 소수 qty', type: 'set_qty_avg', values: { qty: 1.5 }, rule: 'R-VAL-M03' },
	{ name: 'qty 문자열', type: 'set_qty_avg', values: { qty: '3' }, rule: 'R-VAL-M03' },
	{ name: 'qty null', type: 'set_qty_avg', values: { qty: null }, rule: 'R-VAL-M03' },
	{ name: '현금 소수 둘째', type: 'set_qty_avg', asset: 'cash', values: { qty: 2.55 }, rule: null },
	{
		name: '현금 소수 셋째',
		type: 'set_qty_avg',
		asset: 'cash',
		values: { qty: 2.555 },
		rule: 'R-VAL-M03'
	},
	{ name: 'avg 0', type: 'set_qty_avg', values: { avg_price: 0 }, rule: 'R-VAL-M02' },
	{ name: 'avg 음수', type: 'set_qty_avg', values: { avg_price: -1 }, rule: 'R-VAL-M02' },
	{ name: 'avg 문자열', type: 'set_qty_avg', values: { avg_price: '5' }, rule: 'R-VAL-M02' },
	{ name: 'avg null', type: 'set_qty_avg', values: { avg_price: null }, rule: 'R-VAL-M02' },
	{ name: 'avg 5자리', type: 'set_qty_avg', values: { avg_price: 1.00005 }, rule: 'R-FMT-13' },
	{ name: 'avg 6자리', type: 'set_qty_avg', values: { avg_price: 10.123456 }, rule: 'R-FMT-13' },
	{
		name: '두 값 모두 없음',
		type: 'set_qty_avg',
		values: {},
		rule: 'R-VAL-P07',
		client: 'R-VAL-P04'
	},
	{
		name: '직접 쓰기 필드(trigger_price)',
		type: 'set_qty_avg',
		values: { qty: 2, trigger_price: 5 },
		rule: 'R-VAL-P07',
		client: null
	},
	{
		name: '직접 쓰기 필드(breakeven)',
		type: 'set_qty_avg',
		values: { qty: 2, breakeven: 5 },
		rule: 'R-VAL-P07',
		client: null
	},
	{
		name: 'open_holding 정상',
		type: 'open_holding',
		values: { qty: 3, avg_price: 10, currency: 'KRW' },
		rule: null
	},
	{
		name: 'open_holding avg 없음',
		type: 'open_holding',
		values: { qty: 3, currency: 'KRW' },
		rule: 'R-VAL-P04'
	},
	{
		name: 'open_holding qty 없음',
		type: 'open_holding',
		values: { avg_price: 10, currency: 'KRW' },
		rule: 'R-VAL-P04'
	},
	{
		name: '통화 EUR',
		type: 'open_holding',
		values: { qty: 3, avg_price: 10, currency: 'EUR' },
		rule: 'R-VAL-M01'
	},
	{
		name: '통화 소문자',
		type: 'open_holding',
		values: { qty: 3, avg_price: 10, currency: 'usd' },
		rule: 'R-VAL-M01'
	},
	{
		name: '통화 숫자',
		type: 'open_holding',
		values: { qty: 3, avg_price: 10, currency: 1 },
		rule: 'R-VAL-M01'
	},
	{
		name: 'open_holding avg 5자리 USD',
		type: 'open_holding',
		values: { qty: 3, avg_price: 1.00005, currency: 'USD' },
		rule: 'R-FMT-13'
	}
];

describe('규칙 패리티: MCP propose · revalidate.ts · 클라이언트 proposedProblem (같은 케이스 표)', () => {
	beforeEach(() => {
		db.instruments.push(
			{ id: 'ins-new', ticker: '000660', name: 'Hynix', asset_type: 'stock', archived_at: null },
			{ id: 'ins-cash2', ticker: 'KRW-CASH2', name: 'Cash2', asset_type: 'cash', archived_at: null }
		);
		db.positions.push({
			id: 'pos-cash-holding',
			instrument_id: 'ins-cash2',
			status: 'holding',
			currency: 'KRW',
			qty: 100,
			avg_price: 1,
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
		});
	});

	for (const c of CASES) {
		it(`${c.type} · ${c.name} → ${c.rule ?? '통과'}`, async () => {
			const asset = c.type === 'open_holding' ? 'stock' : (c.asset ?? 'stock');
			const target =
				c.type === 'open_holding'
					? { ticker: '000660' }
					: { position_id: c.asset === 'cash' ? 'pos-cash-holding' : 'pos-holding' };

			// 1) MCP propose 핸들러
			const h = await harness();
			const res = await h.call('propose_position_change', {
				change_type: c.type,
				...target,
				proposed_values: c.values,
				evidence: EVIDENCE,
				calc_note: '기존 수량에 추가 매수를 더해 새 값을 계산했습니다'
			});
			const mcpRule: string | null = res.isError
				? ((res as Extract<McpToolResult, { isError: true }>).structuredContent.errors[0]?.rule ??
					'NO-RULE')
				: null;

			// 2) 승인 시점 재검증
			const rv = revalidateMergedForApprove({
				changeType: c.type,
				proposedByType: 'bot',
				proposedValues: c.values,
				overrides: {},
				assetType: asset,
				hasPosition: c.type !== 'open_holding' ? true : undefined
			});
			const rvRule = rv.ok ? null : rv.ruleId;

			// 3) 클라이언트 미리 막힘 (proposedProblem)
			const item = makeItem({
				change_type: c.type,
				proposed_values: c.values as never,
				asset_type: asset,
				position_id: c.type === 'open_holding' ? 'pos-x' : 'pos-1'
			});
			const clientRule = proposedProblem(item)?.ruleId ?? null;

			expect({ mcp: mcpRule, revalidate: rvRule, client: clientRule }).toEqual({
				mcp: c.mcp === undefined ? c.rule : c.mcp,
				revalidate: c.rule,
				client: c.client === undefined ? c.rule : c.client
			});
		});
	}

	it('알려진 차이: 포지션 없는 open_holding 에 통화가 없으면 MCP 는 통과시키지만 RPC·revalidate·클라이언트는 M01', async () => {
		const values = { qty: 3, avg_price: 10 };
		const h = await harness();
		const res = await h.call('propose_position_change', {
			change_type: 'open_holding',
			ticker: '000660',
			proposed_values: values,
			evidence: EVIDENCE,
			calc_note: '계산 근거 한 줄입니다'
		});
		const mcpPassed = !res.isError;
		const rv = revalidateMergedForApprove({
			changeType: 'open_holding',
			proposedValues: values,
			overrides: {},
			assetType: 'stock',
			hasPosition: false
		});
		const item = makeItem({
			change_type: 'open_holding',
			proposed_values: values as never,
			position_id: null
		});
		const clientRule = proposedProblem(item)?.ruleId;
		expect({ mcpPassed, rv: rv.ok ? null : rv.ruleId, clientRule }).toEqual({
			mcpPassed: true,
			rv: 'R-VAL-M01',
			clientRule: 'R-VAL-M01'
		});
		// L-B: 카드·서버 안내 모두 '통화가 빠져 있어요'(수량·단가 누락이나 '원화·달러가 아니라서'가 아님).
		expect(rv.ok).toBe(false);
		if (!rv.ok) expect(rv.missing).toBe(true);
		const note = proposedProblemNote(item);
		expect(note).toContain('통화가 빠져 있어요');
		expect(note).toContain('통화를 고르거나');
		expect(note).not.toContain('수량이나 평균 단가');
		expect(note).not.toContain('원화·달러가 아니라서');
	});
});
