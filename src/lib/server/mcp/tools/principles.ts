/**
 * BE-17 — principle revision proposal MCP tools.
 * Scope: principles:propose. Profile: finance-manager only (D8).
 * Approve / reject / hold are web RPCs only — never registered here.
 */
import { z } from 'zod';
import {
	createPrincipleProposal,
	getPrincipleProposalByDisplayId,
	getPrincipleProposalById,
	getReportById,
	listJournalEntries,
	listPrincipleProposals,
	updatePrincipleProposalStatus,
	type RepoClient
} from '$lib/server/repo';
import { McpToolError } from '../errors';
import { filterToolsByScopes } from '../scopes';
import type { McpContext, McpRuleIssue } from '../types';
import { throwMappedDbError, unwrapDb } from './db-error';
import {
	registerAuditedTool,
	type ToolHandler,
	type ToolHandlerOutcome,
	type ToolRegistrationContext
} from './register';

const FINANCE_MANAGER = 'finance-manager';

const PRINCIPLE_TOOL_NAMES = [
	'propose_principle_change',
	'cancel_principle_proposal',
	'list_principle_proposals'
] as const;

const ACTIVE_STATUSES = ['pending', 'on_hold'] as const;
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

const PRINCIPLE_PROPOSAL_FIELDS = [
	'id',
	'display_id',
	'display_no',
	'principle_id',
	'clause_ref',
	'status',
	'reason_md',
	'proposed_body_md',
	'base_version',
	'proposed_by_type',
	'proposed_by',
	'evidence',
	'expires_at',
	'held_at',
	'decided_at',
	'decision_note',
	'attention_started_at',
	'acknowledged_at',
	'created_at',
	'updated_at'
] as const;

type Obj = Record<string, unknown>;
type Row = Record<string, unknown>;

function issue(rule: string, message: string, field?: string): McpRuleIssue {
	return field ? { rule, message, field } : { rule, message };
}

function validation(...issues: McpRuleIssue[]): McpToolError {
	return new McpToolError('VALIDATION', issues);
}

function failIfIssues(issues: McpRuleIssue[]): void {
	if (issues.length > 0) throw new McpToolError('VALIDATION', issues);
}

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) throw new Error('RepoClient required');
	return repo;
}

function unwrap<T>(result: { data: T; error: Error | null }): T {
	if (result.error) throwMappedDbError(result.error);
	return result.data;
}

function isObject(v: unknown): v is Obj {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pick(row: Row, fields: readonly string[]): Row {
	const out: Row = {};
	for (const f of fields) {
		if (Object.hasOwn(row, f)) out[f] = row[f];
	}
	return out;
}

function assertFinanceManager(ctx: McpContext): void {
	if (ctx.profile !== FINANCE_MANAGER) {
		throw new McpToolError('FORBIDDEN_SCOPE', [
			issue(
				'R-PERM-04',
				`Only finance-manager may use principle proposal tools (profile '${ctx.profile}')`
			)
		]);
	}
}

/**
 * R-PERM-15 evidence: non-empty array. Items may be user_statement / url /
 * report_id / journal_entry_id. Missing referenced report/journal → R-VAL-P10.
 */
async function parseAndCheckEvidence(repo: RepoClient, raw: unknown): Promise<Obj[]> {
	if (!Array.isArray(raw) || raw.length < 1) {
		throw validation(issue('R-PERM-15', 'evidence requires at least one item', 'evidence'));
	}
	const issues: McpRuleIssue[] = [];
	const items: Obj[] = [];
	let journalIds: Set<string> | null = null;

	for (const [i, item] of raw.entries()) {
		if (!isObject(item)) {
			issues.push(issue('R-PERM-15', 'evidence item must be an object', `evidence[${i}]`));
			continue;
		}
		const clean: Obj = { ...item };
		items.push(clean);

		if (typeof clean.report_id === 'string' && clean.report_id) {
			const report = unwrap(await getReportById(repo, clean.report_id));
			if (!report) {
				issues.push(
					issue(
						'R-VAL-P10',
						`evidence report not found: ${clean.report_id}`,
						`evidence[${i}].report_id`
					)
				);
			}
		}
		if (typeof clean.journal_entry_id === 'string' && clean.journal_entry_id) {
			if (!journalIds) {
				const rows = unwrap(await listJournalEntries(repo, { includeArchived: true }));
				journalIds = new Set(rows.map((r) => r.id));
			}
			if (!journalIds.has(clean.journal_entry_id as string)) {
				issues.push(
					issue(
						'R-VAL-P10',
						`evidence journal entry not found: ${clean.journal_entry_id}`,
						`evidence[${i}].journal_entry_id`
					)
				);
			}
		}
	}
	failIfIssues(issues);
	return items;
}

function registerProposePrincipleChange(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'propose_principle_change',
		title: 'Propose principle change',
		description:
			'원칙 개정 제안을 큐에 올린다(finance-manager + principles:propose). 승인 전 principles 직접 쓰기 금지. 제안 주체는 서버가 채운다.',
		inputSchema: {
			principle_id: z.string().describe('대상 principles 리포트 id (현재 유효본)'),
			proposed_body_md: z.string().describe('제안 본문 전체 (새 원칙 문구)'),
			reason_md: z.string().describe('변경 사유'),
			evidence: z
				.array(z.record(z.string(), z.unknown()))
				.describe('근거 1건 이상 [{report_id?, journal_entry_id?, user_statement?, url?, …}]'),
			clause_ref: z.string().optional().describe("선택: 주로 바뀌는 조항 (예: '3-2 손절')"),
			client_ref: z.string().optional(),
			// Client-supplied proposer fields are ignored (stripped); accepted only so bots
			// that echo them do not fail schema parse — server/DB overwrite.
			proposed_by_type: z.string().optional(),
			proposed_by: z.string().optional(),
			proposed_by_user: z.string().optional(),
			proposed_by_bot_id: z.string().optional(),
			proposed_by_user_id: z.string().optional()
		},
		annotations: { destructiveHint: false, idempotentHint: false },
		handler: async ({ args, ctx, repo }): Promise<ToolHandlerOutcome> => {
			assertFinanceManager(ctx);
			const client = requireRepo(repo);

			const principleId = typeof args.principle_id === 'string' ? args.principle_id.trim() : '';
			const proposedBody =
				typeof args.proposed_body_md === 'string' ? args.proposed_body_md.trim() : '';
			const reason = typeof args.reason_md === 'string' ? args.reason_md.trim() : '';

			const missing: McpRuleIssue[] = [];
			if (!principleId) {
				missing.push(issue('R-PERM-15', 'principle_id is required', 'principle_id'));
			}
			if (!proposedBody) {
				missing.push(issue('R-PERM-15', 'proposed_body_md is required', 'proposed_body_md'));
			}
			if (!reason) {
				missing.push(issue('R-PERM-15', 'reason_md is required', 'reason_md'));
			}
			failIfIssues(missing);

			const evidence = await parseAndCheckEvidence(client, args.evidence);

			const report = unwrap(await getReportById(client, principleId));
			if (!report || report.kind !== 'principles' || report.archived_at) {
				throw validation(
					issue('R-PERM-15', 'target must be an active principles report', 'principle_id')
				);
			}

			const row = unwrap(
				await createPrincipleProposal(client, {
					principle_id: principleId,
					proposed_body_md: proposedBody,
					reason_md: reason,
					evidence,
					clause_ref:
						typeof args.clause_ref === 'string' && args.clause_ref.trim()
							? args.clause_ref.trim()
							: null,
					client_ref: typeof args.client_ref === 'string' ? args.client_ref : null
				})
			);
			if (!row) throw new Error('createPrincipleProposal returned no row');

			return {
				data: {
					proposal_id: row.id,
					display_id: row.display_id,
					status: row.status,
					principle_id: row.principle_id,
					base_version: row.base_version,
					proposed_by_type: row.proposed_by_type,
					proposed_by: row.proposed_by
				},
				affectedIds: [{ table: 'principle_proposals', id: row.id }]
			};
		}
	});
}

function registerCancelPrincipleProposal(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'cancel_principle_proposal',
		title: 'Cancel own principle proposal',
		description:
			'내가 올린 pending/on_hold 원칙 제안을 취소한다(proposal_id 또는 display_id R-xxxx). 타 봇·사용자 제안은 취소 불가(R-VAL-P14).',
		inputSchema: {
			proposal_id: z.string().optional(),
			display_id: z.string().optional().describe('서버 표시 ID (예: R-0001)')
		},
		annotations: { destructiveHint: false, idempotentHint: true },
		handler: async ({ args, ctx, repo }): Promise<ToolHandlerOutcome> => {
			assertFinanceManager(ctx);
			const client = requireRepo(repo);
			const proposalId = typeof args.proposal_id === 'string' ? args.proposal_id : '';
			const displayId = typeof args.display_id === 'string' ? args.display_id : '';
			if (!proposalId && !displayId) {
				throw validation(
					issue('R-PERM-05', 'proposal_id or display_id is required', 'proposal_id')
				);
			}

			const proposal = unwrap(
				proposalId
					? await getPrincipleProposalById(client, proposalId)
					: await getPrincipleProposalByDisplayId(client, displayId)
			);
			if (!proposal) {
				throw new McpToolError('NOT_FOUND', [
					issue('R-PERM-05', `Proposal not found: ${proposalId || displayId}`, 'proposal_id')
				]);
			}
			if (proposal.proposed_by_type !== 'bot' || proposal.proposed_by !== ctx.botClientId) {
				throw new McpToolError('FORBIDDEN_SCOPE', [
					issue('R-VAL-P14', 'Bots can only cancel their own proposals', 'proposal_id')
				]);
			}
			if (proposal.status !== 'pending' && proposal.status !== 'on_hold') {
				throw new McpToolError('CONFLICT', [
					issue(
						'R-PERM-13',
						`Only pending/on_hold proposals can be cancelled (status=${proposal.status})`,
						'proposal_id'
					)
				]);
			}

			const cancelled = unwrap(
				await updatePrincipleProposalStatus(client, proposal.id, {
					from: ['pending', 'on_hold'],
					to: 'cancelled'
				})
			);
			if (!cancelled) {
				throw new McpToolError('CONFLICT', [
					issue('R-PERM-13', 'Proposal is no longer pending/on_hold', 'proposal_id')
				]);
			}

			return {
				data: {
					proposal_id: cancelled.id,
					display_id: cancelled.display_id,
					status: cancelled.status
				},
				affectedIds: [{ table: 'principle_proposals', id: cancelled.id }]
			};
		}
	});
}

const listPrincipleProposalsShape = {
	status: z
		.enum([...PROPOSAL_STATUSES, 'active', 'all'])
		.default('active')
		.describe("상태 필터. 'active'=pending+on_hold (기본), 'all'=전체"),
	limit: z.number().int().min(1).max(200).default(50)
};

function matchesStatus(row: Row, status: string): boolean {
	const s = String(row.status ?? '');
	if (status === 'all') return true;
	if (status === 'active') return (ACTIVE_STATUSES as readonly string[]).includes(s);
	return s === status;
}

export const listPrincipleProposalsHandler: ToolHandler = async ({ args, ctx, repo }) => {
	assertFinanceManager(ctx);
	const client = requireRepo(repo);
	const status = typeof args.status === 'string' && args.status ? args.status : 'active';
	const limit =
		typeof args.limit === 'number' && Number.isFinite(args.limit)
			? Math.min(200, Math.max(1, Math.trunc(args.limit)))
			: 50;

	const filtered = (unwrapDb(await listPrincipleProposals(client)) as Row[])
		.filter((p) => matchesStatus(p, status))
		.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
	const items = filtered.slice(0, limit).map((p) => pick(p, PRINCIPLE_PROPOSAL_FIELDS));
	return {
		data: {
			principle_proposals: items,
			count: items.length,
			total: filtered.length,
			truncated: items.length < filtered.length
		}
	};
};

function registerListPrincipleProposals(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'list_principle_proposals',
		title: 'List principle proposals',
		description:
			'원칙 변경 제안 목록(finance-manager + principles:propose). 기본은 pending+on_hold.',
		inputSchema: listPrincipleProposalsShape,
		annotations: { readOnlyHint: true, idempotentHint: true },
		handler: listPrincipleProposalsHandler
	});
}

export function registerPrincipleTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(filterToolsByScopes(PRINCIPLE_TOOL_NAMES, reg.ctx));
	if (allowed.has('propose_principle_change')) registerProposePrincipleChange(reg);
	if (allowed.has('cancel_principle_proposal')) registerCancelPrincipleProposal(reg);
	if (allowed.has('list_principle_proposals')) registerListPrincipleProposals(reg);
}
