import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from '../audit';
import { createStubMcpContext } from '../testing';
import type { McpContext, McpToolResult } from '../types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
	const state = {
		reports: [] as Row[],
		proposals: [] as Row[],
		journal: [] as Row[],
		nextDisplayNo: 1,
		createdInputs: [] as Row[]
	};
	return state;
});

vi.mock('$lib/server/repo', () => {
	const ok = <T>(data: T) => ({ data, error: null });
	return {
		getReportById: async (_r: unknown, id: string) =>
			ok(db.reports.find((r) => r.id === id) ?? null),
		listJournalEntries: async () => ok(db.journal),
		listPrincipleProposals: async () => ok(db.proposals),
		getPrincipleProposalById: async (_r: unknown, id: string) =>
			ok(db.proposals.find((p) => p.id === id) ?? null),
		getPrincipleProposalByDisplayId: async (_r: unknown, displayId: string) =>
			ok(db.proposals.find((p) => p.display_id === displayId) ?? null),
		createPrincipleProposal: async (_r: unknown, input: Row) => {
			db.createdInputs.push(input);
			// Client proposer fields must never reach insert (stripClientIdentity in real repo).
			expect(input).not.toHaveProperty('proposed_by');
			expect(input).not.toHaveProperty('proposed_by_type');
			expect(input).not.toHaveProperty('proposed_by_user');
			const no = db.nextDisplayNo++;
			const row = {
				...input,
				id: `pp-${db.proposals.length + 1}`,
				display_no: no,
				display_id: `R-${String(no).padStart(4, '0')}`,
				status: 'pending',
				base_version: 1,
				proposed_by_type: 'bot',
				proposed_by: '00000000-0000-4000-8000-000000000001',
				proposed_by_user: null,
				created_at: new Date().toISOString()
			};
			db.proposals.push(row);
			return ok(row);
		},
		updatePrincipleProposalStatus: async (
			_r: unknown,
			id: string,
			t: { from: string[]; to: string }
		) => {
			const row = db.proposals.find((p) => p.id === id && t.from.includes(p.status as string));
			if (!row) return ok(null);
			row.status = t.to;
			return ok(row);
		}
	};
});

const BOT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_BOT = '00000000-0000-4000-8000-000000000099';
const SCOPES = ['principles:propose'];

type ToolCb = (args: unknown, extra?: unknown) => Promise<McpToolResult>;

async function harness(ctxOverrides: Partial<McpContext> = {}) {
	const { registerPrincipleTools } = await import('./principles');
	const ctx = createStubMcpContext({
		scopes: SCOPES,
		profile: 'finance-manager',
		botClientId: BOT_ID,
		...ctxOverrides
	});
	const tools = new Map<string, ToolCb>();
	const server = {
		registerTool: (name: string, _config: unknown, cb: ToolCb) => tools.set(name, cb)
	} as unknown as McpServer;
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	registerPrincipleTools({
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
	return result.structuredContent as Row;
}

beforeEach(() => {
	db.reports = [
		{
			id: 'prin-1',
			kind: 'principles',
			archived_at: null,
			version: 1,
			body_md: '# base'
		}
	];
	db.proposals = [];
	db.journal = [{ id: 'jnl-1' }];
	db.nextDisplayNo = 1;
	db.createdInputs = [];
});

describe('BE-17 tools/list registration', () => {
	it('registers propose/cancel/list for principles:propose; no approve/reject/hold', async () => {
		const h = await harness();
		expect([...h.tools.keys()].sort()).toEqual(
			['cancel_principle_proposal', 'list_principle_proposals', 'propose_principle_change'].sort()
		);
		expect(h.tools.has('approve_principle_proposal')).toBe(false);
		expect(h.tools.has('decide_principle_proposal')).toBe(false);
	});

	it('equity-analyst with principles:propose still registers tools but propose is rejected', async () => {
		const h = await harness({ profile: 'equity-analyst', scopes: ['principles:propose'] });
		expect(h.tools.has('propose_principle_change')).toBe(true);
		const err = errorOf(
			await h.call('propose_principle_change', {
				principle_id: 'prin-1',
				proposed_body_md: '# new',
				reason_md: 'why',
				evidence: [{ url: 'https://x' }]
			})
		);
		expect(err.code).toBe('FORBIDDEN_SCOPE');
		expect(err.errors?.[0]?.rule).toBe('R-PERM-04');
	});
});

describe('propose_principle_change', () => {
	it('R-PERM-15 missing min fields → VALIDATION ERROR', async () => {
		const h = await harness();
		const err = errorOf(
			await h.call('propose_principle_change', {
				principle_id: '',
				proposed_body_md: '',
				reason_md: '',
				evidence: []
			})
		);
		expect(err.code).toBe('VALIDATION');
		const rules = (err.errors ?? []).map((e) => e.rule);
		expect(rules).toContain('R-PERM-15');
	});

	it('ignores client-supplied proposer fields; server fills bot identity', async () => {
		const h = await harness();
		const res = dataOf(
			await h.call('propose_principle_change', {
				principle_id: 'prin-1',
				proposed_body_md: '# revised',
				reason_md: 'volatility',
				evidence: [{ user_statement: 'cut stop' }],
				proposed_by_type: 'user',
				proposed_by_user: 'spoof-user',
				proposed_by: 'spoof-bot',
				proposed_by_bot_id: 'spoof-bot',
				proposed_by_user_id: 'spoof-user'
			})
		);
		expect(res).toMatchObject({
			display_id: 'R-0001',
			status: 'pending',
			proposed_by_type: 'bot',
			proposed_by: BOT_ID
		});
		expect(db.createdInputs[0]).not.toHaveProperty('proposed_by_type');
	});

	it('rejects non-principles target', async () => {
		db.reports = [{ id: 'daily-1', kind: 'daily_brief', archived_at: null }];
		const h = await harness();
		const err = errorOf(
			await h.call('propose_principle_change', {
				principle_id: 'daily-1',
				proposed_body_md: 'x',
				reason_md: 'y',
				evidence: [{ url: 'https://x' }]
			})
		);
		expect(err.code).toBe('VALIDATION');
		expect(err.errors?.[0]?.rule).toBe('R-PERM-15');
	});
});

describe('cancel_principle_proposal', () => {
	it('bot cancels own pending proposal', async () => {
		db.proposals = [
			{
				id: 'pp-own',
				display_id: 'R-0002',
				status: 'pending',
				proposed_by_type: 'bot',
				proposed_by: BOT_ID
			}
		];
		const h = await harness();
		const res = dataOf(await h.call('cancel_principle_proposal', { proposal_id: 'pp-own' }));
		expect(res).toMatchObject({ proposal_id: 'pp-own', status: 'cancelled' });
	});

	it('refuses cancel of another bot proposal (R-VAL-P14)', async () => {
		db.proposals = [
			{
				id: 'pp-other',
				display_id: 'R-0003',
				status: 'pending',
				proposed_by_type: 'bot',
				proposed_by: OTHER_BOT
			}
		];
		const h = await harness();
		const err = errorOf(await h.call('cancel_principle_proposal', { proposal_id: 'pp-other' }));
		expect(err.code).toBe('FORBIDDEN_SCOPE');
		expect(err.errors?.[0]?.rule).toBe('R-VAL-P14');
	});

	it('refuses cancel of user proposal', async () => {
		db.proposals = [
			{
				id: 'pp-user',
				display_id: 'R-0004',
				status: 'pending',
				proposed_by_type: 'user',
				proposed_by: null,
				proposed_by_user: 'user-1'
			}
		];
		const h = await harness();
		const err = errorOf(await h.call('cancel_principle_proposal', { display_id: 'R-0004' }));
		expect(err.code).toBe('FORBIDDEN_SCOPE');
	});
});

describe('list_principle_proposals', () => {
	it('lists active proposals for finance-manager', async () => {
		db.proposals = [
			{
				id: 'a',
				display_id: 'R-0001',
				status: 'pending',
				created_at: '2026-11-21T10:00:00Z',
				principle_id: 'prin-1',
				proposed_body_md: 'x',
				reason_md: 'y',
				base_version: 1,
				proposed_by_type: 'bot'
			},
			{
				id: 'b',
				display_id: 'R-0002',
				status: 'approved',
				created_at: '2026-11-20T10:00:00Z',
				principle_id: 'prin-1',
				proposed_body_md: 'x',
				reason_md: 'y',
				base_version: 1,
				proposed_by_type: 'bot'
			}
		];
		const h = await harness();
		const res = dataOf(await h.call('list_principle_proposals', {}));
		expect(res.count).toBe(1);
		expect((res.principle_proposals as Row[])[0]?.display_id).toBe('R-0001');
	});
});

describe('no undo / no approve MCP tools', () => {
	it('undo_principle_proposal is not registered', async () => {
		const h = await harness();
		expect(h.tools.has('undo_principle_proposal')).toBe(false);
		expect(h.tools.has('approve_principle_proposal')).toBe(false);
	});
});
