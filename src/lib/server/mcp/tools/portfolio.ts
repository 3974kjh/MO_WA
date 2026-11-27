/**
 * BE-08 — portfolio / proposal MCP tools (design §5-2 / §5-5).
 *
 * Bots never write qty/avg_price directly (R-VAL-P01): holdings change only through
 * position_proposals (propose_position_change), approved by the user. Reference fields
 * (base/trigger/memo/…) are written directly via positions:annotate; trigger fields are
 * finance-manager only (R-PERM-17) and the DB audits their before/after.
 */
import { z } from 'zod';
import {
	createPosition,
	createPositionProposal,
	getInstrumentByTicker,
	getPositionProposalByDisplayId,
	getPositionProposalById,
	listInstruments,
	listJournalEntries,
	listPositionProposals,
	listPositions,
	updatePosition,
	updateProposalStatus,
	getReportById,
	type RepoClient
} from '$lib/server/repo';
import { ruleM03, ruleP09 } from '$lib/server/domain/validation';
import { hasAtMostNDecimals } from '$lib/server/domain/proposals/overrides';
import type { InstrumentRow, PositionRow } from '$lib/types/mowa.contract';
import { McpToolError } from '../errors';
import { filterToolsByScopes } from '../scopes';
import type { McpContext, McpRuleIssue } from '../types';
import { throwMappedDbError } from './db-error';
import {
	registerAuditedTool,
	type ToolHandlerOutcome,
	type ToolRegistrationContext
} from './register';

const FINANCE_MANAGER = 'finance-manager';
const CURRENCIES = ['KRW', 'USD'] as const;
const TRIGGER_DIRECTIONS = ['below', 'above'] as const;
const TRIGGER_FORBIDDEN_IN_PROPOSAL = [
	'trigger_price',
	'trigger_direction',
	'breakeven',
	'watch_only'
] as const;
const PROPOSAL_ALLOWED_VALUES: Record<string, readonly string[]> = {
	open_holding: ['qty', 'avg_price', 'currency'],
	set_qty_avg: ['qty', 'avg_price'],
	close: []
};
/** Fields only finance-manager may write on a position (R-PERM-17). */
const FM_ONLY_FIELDS = ['trigger_price', 'trigger_direction', 'watch_only'] as const;
const REFERENCE_FIELDS = [
	'base_price',
	'base_at',
	'memo',
	'trigger_price',
	'trigger_direction',
	'breakeven',
	'watch_only'
] as const;
const REFERENCE_AUDITED_FIELDS = ['trigger_price', 'trigger_direction', 'breakeven', 'watch_only'];

const PORTFOLIO_TOOL_NAMES = [
	'create_planned_position',
	'update_position_reference',
	'propose_position_change',
	'cancel_proposal'
];

type Obj = Record<string, unknown>;

function issue(rule: string, message: string, field?: string): McpRuleIssue {
	return { rule, message, ...(field ? { field } : {}) };
}

function validation(...issues: McpRuleIssue[]): McpToolError {
	return new McpToolError('VALIDATION', issues);
}

function failIfIssues(issues: McpRuleIssue[]): void {
	if (issues.length > 0) throw new McpToolError('VALIDATION', issues);
}

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) throw new Error('repo unavailable for portfolio tools');
	return repo;
}

function has(args: Obj, key: string): boolean {
	return Object.hasOwn(args, key) && args[key] !== undefined;
}

function isObject(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrap<T>(result: { data: T; error: Error | null }): T {
	if (result.error) throwMappedDbError(result.error);
	return result.data;
}

function assertNoDirectQtyAvg(args: Obj): void {
	const bad = (['qty', 'avg_price'] as const).filter((k) => Object.hasOwn(args, k));
	if (bad.length > 0) {
		throw validation(
			...bad.map((field) =>
				issue(
					'R-VAL-P01',
					`Bots cannot write ${field} directly; use propose_position_change`,
					field
				)
			)
		);
	}
}

function assertFinanceManagerFields(ctx: McpContext, args: Obj): void {
	if (ctx.profile === FINANCE_MANAGER) return;
	const present = FM_ONLY_FIELDS.filter((k) => has(args, k));
	if (present.length > 0) {
		throw new McpToolError(
			'FORBIDDEN_SCOPE',
			present.map((field) =>
				issue(
					'R-PERM-17',
					`Only finance-manager may write ${field} (profile '${ctx.profile}')`,
					field
				)
			)
		);
	}
}

/** Validate reference fields present in args; returns the DB patch (only provided keys). */
function collectReferencePatch(args: Obj, issues: McpRuleIssue[]): Obj {
	const patch: Obj = {};
	for (const field of ['base_price', 'trigger_price', 'breakeven'] as const) {
		if (!has(args, field)) continue;
		const v = args[field];
		if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
			issues.push(issue('R-VAL-M02', `${field} must be a positive number or null`, field));
			continue;
		}
		patch[field] = v;
	}
	if (has(args, 'base_at')) {
		const v = args.base_at;
		if (v !== null && !(typeof v === 'string' && !Number.isNaN(Date.parse(v)))) {
			issues.push(issue('R-VAL-P06', 'base_at must be an ISO timestamp or null', 'base_at'));
		} else {
			patch.base_at = v;
		}
	}
	if (has(args, 'memo')) {
		const v = args.memo;
		if (v !== null && typeof v !== 'string') {
			issues.push(issue('R-VAL-P06', 'memo must be a string or null', 'memo'));
		} else {
			patch.memo = v;
		}
	}
	if (has(args, 'trigger_direction')) {
		const v = args.trigger_direction;
		if (!(TRIGGER_DIRECTIONS as readonly unknown[]).includes(v)) {
			issues.push(
				issue('R-VAL-P15', "trigger_direction must be 'below' or 'above'", 'trigger_direction')
			);
		} else {
			patch.trigger_direction = v;
		}
	}
	if (has(args, 'watch_only')) {
		if (typeof args.watch_only !== 'boolean') {
			issues.push(issue('R-VAL-P13', 'watch_only must be a boolean', 'watch_only'));
		} else {
			patch.watch_only = args.watch_only;
		}
	}
	return patch;
}

function assertWatchOnlyHasNoTrigger(
	watchOnly: unknown,
	triggerPrice: unknown,
	issues: McpRuleIssue[]
): void {
	if (watchOnly === true && triggerPrice !== null && triggerPrice !== undefined) {
		issues.push(
			issue(
				'R-VAL-P13',
				'watch_only=true requires trigger_price to be null in the same write',
				'trigger_price'
			)
		);
	}
}

async function resolveInstrument(repo: RepoClient, args: Obj): Promise<InstrumentRow> {
	const ticker = typeof args.ticker === 'string' ? args.ticker.trim() : '';
	const instrumentId = typeof args.instrument_id === 'string' ? args.instrument_id : '';
	if (!ticker && !instrumentId) {
		throw validation(issue('R-VAL-C04', 'ticker or instrument_id is required', 'ticker'));
	}
	let instrument: InstrumentRow | null;
	if (ticker) {
		instrument = unwrap(await getInstrumentByTicker(repo, ticker));
	} else {
		const rows = unwrap(await listInstruments(repo, { includeArchived: true }));
		instrument = rows.find((r) => r.id === instrumentId) ?? null;
	}
	if (!instrument || instrument.archived_at) {
		throw new McpToolError('NOT_FOUND', [
			issue(
				'R-VAL-C04',
				`Instrument not found: ${ticker || instrumentId}`,
				ticker ? 'ticker' : 'instrument_id'
			)
		]);
	}
	return instrument;
}

async function findPosition(repo: RepoClient, positionId: string): Promise<PositionRow & Obj> {
	const rows = unwrap(await listPositions(repo));
	const row = rows.find((p) => p.id === positionId);
	if (!row) {
		throw new McpToolError('NOT_FOUND', [
			issue('R-VAL-P02', `Position not found: ${positionId}`, 'position_id')
		]);
	}
	return row as PositionRow & Obj;
}

function referenceSnapshot(row: Obj): Obj {
	const out: Obj = {};
	for (const f of REFERENCE_FIELDS) out[f] = row[f] ?? null;
	return out;
}

const referenceShape = {
	base_price: z.number().nullable().optional().describe('기준가 (>0, null=삭제)'),
	base_at: z.string().nullable().optional().describe('기준 시각 ISO8601'),
	memo: z.string().nullable().optional(),
	trigger_price: z
		.number()
		.nullable()
		.optional()
		.describe('트리거 가격 (finance-manager만, watch_only=true면 null)'),
	trigger_direction: z
		.string()
		.optional()
		.describe("'below' | 'above' — 생략하면 기존 값 유지(신규는 below)"),
	breakeven: z.number().nullable().optional(),
	watch_only: z.boolean().optional().describe('관찰 전용 (finance-manager만)')
};

const forbiddenQtyAvgShape = {
	qty: z
		.unknown()
		.optional()
		.describe('금지 — 보내면 R-VAL-P01 ERROR (propose_position_change 사용)'),
	avg_price: z
		.unknown()
		.optional()
		.describe('금지 — 보내면 R-VAL-P01 ERROR (propose_position_change 사용)')
};

function registerCreatePlannedPosition(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'create_planned_position',
		title: 'Create planned position',
		description:
			'관심/계획 포지션(status=planned, qty=0, avg_price=null)을 만든다. 수량·평단은 쓸 수 없다(R-VAL-P01).',
		inputSchema: {
			ticker: z.string().optional(),
			instrument_id: z.string().optional(),
			currency: z.string().describe("'KRW' | 'USD'"),
			...referenceShape,
			...forbiddenQtyAvgShape
		},
		annotations: { destructiveHint: false, idempotentHint: false },
		handler: async ({ args, ctx, repo }): Promise<ToolHandlerOutcome> => {
			assertNoDirectQtyAvg(args);
			assertFinanceManagerFields(ctx, args);
			const client = requireRepo(repo);

			const issues: McpRuleIssue[] = [];
			if (!(CURRENCIES as readonly unknown[]).includes(args.currency)) {
				issues.push(issue('R-VAL-M01', "currency must be 'KRW' or 'USD'", 'currency'));
			}
			const patch = collectReferencePatch(args, issues);
			assertWatchOnlyHasNoTrigger(patch.watch_only, patch.trigger_price, issues);
			failIfIssues(issues);

			const instrument = await resolveInstrument(client, args);
			const ruleIds: string[] = [];
			if (!has(args, 'trigger_direction')) ruleIds.push('R-VAL-P15');
			if (REFERENCE_AUDITED_FIELDS.some((f) => has(args, f))) ruleIds.push('R-PERM-17');

			const row = unwrap(
				await createPosition(client, {
					...patch,
					trigger_direction: (patch.trigger_direction as string | undefined) ?? 'below',
					instrument_id: instrument.id,
					status: 'planned',
					currency: args.currency as 'KRW' | 'USD',
					qty: 0,
					avg_price: null
				} as never)
			);
			if (!row) throw new Error('createPosition returned no row');

			return {
				data: {
					position_id: row.id,
					instrument_id: instrument.id,
					ticker: instrument.ticker,
					status: 'planned',
					qty: 0,
					avg_price: null,
					reference: referenceSnapshot(row as unknown as Obj)
				},
				affectedIds: [{ table: 'positions', id: row.id }],
				ruleIds
			};
		}
	});
}

function registerUpdatePositionReference(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'update_position_reference',
		title: 'Update position reference fields',
		description:
			'포지션의 기준가·기준시각·메모·트리거·손익분기·관찰전용을 직접 갱신한다. qty/avg_price는 쓸 수 없다(R-VAL-P01).',
		inputSchema: {
			position_id: z.string(),
			...referenceShape,
			...forbiddenQtyAvgShape
		},
		annotations: { destructiveHint: false, idempotentHint: true },
		handler: async ({ args, ctx, repo }): Promise<ToolHandlerOutcome> => {
			assertNoDirectQtyAvg(args);
			assertFinanceManagerFields(ctx, args);
			const client = requireRepo(repo);

			const issues: McpRuleIssue[] = [];
			const positionId = typeof args.position_id === 'string' ? args.position_id : '';
			if (!positionId) issues.push(issue('R-VAL-P02', 'position_id is required', 'position_id'));
			const patch = collectReferencePatch(args, issues);
			if (Object.keys(patch).length === 0 && issues.length === 0) {
				issues.push(issue('R-VAL-P06', `Provide at least one of: ${REFERENCE_FIELDS.join(', ')}`));
			}
			failIfIssues(issues);

			const existing = await findPosition(client, positionId);
			const effectiveWatchOnly = has(patch, 'watch_only') ? patch.watch_only : existing.watch_only;
			const effectiveTrigger = has(patch, 'trigger_price')
				? patch.trigger_price
				: existing.trigger_price;
			assertWatchOnlyHasNoTrigger(effectiveWatchOnly, effectiveTrigger, issues);
			failIfIssues(issues);

			const ruleIds: string[] = [];
			if (!has(args, 'trigger_direction')) ruleIds.push('R-VAL-P15');
			if (REFERENCE_AUDITED_FIELDS.some((f) => has(patch, f))) ruleIds.push('R-PERM-17');

			const before = referenceSnapshot(existing);
			const updated = unwrap(await updatePosition(client, positionId, patch as never));
			if (!updated) throw new Error('updatePosition returned no row');
			const after = referenceSnapshot(updated as unknown as Obj);

			return {
				data: {
					position_id: positionId,
					before,
					after,
					version: (updated as unknown as Obj).version ?? null
				},
				affectedIds: [{ table: 'positions', id: positionId }],
				ruleIds
			};
		}
	});
}

type EvidenceItem = { report_id?: string; journal_entry_id?: string } & Obj;

async function assertEvidenceExists(repo: RepoClient, evidence: EvidenceItem[]): Promise<void> {
	const issues: McpRuleIssue[] = [];
	let journalIds: Set<string> | null = null;
	for (const [i, item] of evidence.entries()) {
		if (item.report_id) {
			const report = unwrap(await getReportById(repo, item.report_id));
			if (!report) {
				issues.push(
					issue(
						'R-VAL-P10',
						`evidence report not found: ${item.report_id}`,
						`evidence[${i}].report_id`
					)
				);
			}
		}
		if (item.journal_entry_id) {
			if (!journalIds) {
				const rows = unwrap(await listJournalEntries(repo, { includeArchived: true }));
				journalIds = new Set(rows.map((r) => r.id));
			}
			if (!journalIds.has(item.journal_entry_id)) {
				issues.push(
					issue(
						'R-VAL-P10',
						`evidence journal entry not found: ${item.journal_entry_id}`,
						`evidence[${i}].journal_entry_id`
					)
				);
			}
		}
	}
	failIfIssues(issues);
}

function parseEvidence(raw: unknown): EvidenceItem[] {
	if (!Array.isArray(raw) || raw.length < 1) {
		throw validation(
			issue(
				'R-VAL-P07',
				'evidence requires at least one item with report_id or journal_entry_id',
				'evidence'
			)
		);
	}
	const issues: McpRuleIssue[] = [];
	const items: EvidenceItem[] = [];
	for (const [i, item] of raw.entries()) {
		if (!isObject(item)) {
			issues.push(issue('R-VAL-P07', 'evidence item must be an object', `evidence[${i}]`));
			continue;
		}
		const clean: Obj = { ...item };
		for (const key of ['report_id', 'journal_entry_id']) {
			const v = clean[key];
			if (typeof v === 'string' && v) continue;
			delete clean[key];
		}
		if (!clean.report_id && !clean.journal_entry_id) {
			issues.push(
				issue(
					'R-VAL-P07',
					'evidence item needs report_id and/or journal_entry_id',
					`evidence[${i}]`
				)
			);
			continue;
		}
		items.push(clean as EvidenceItem);
	}
	failIfIssues(issues);
	return items;
}

function validateProposedValues(
	changeType: string,
	values: Obj,
	assetType: InstrumentRow['asset_type'] | null
): McpRuleIssue[] {
	const issues: McpRuleIssue[] = [];
	for (const key of TRIGGER_FORBIDDEN_IN_PROPOSAL) {
		if (Object.hasOwn(values, key)) {
			issues.push(
				issue(
					'R-VAL-P07',
					`${key} is a direct-write field and cannot be proposed (R-PERM-17); use update_position_reference`,
					`proposed_values.${key}`
				)
			);
		}
	}
	const allowed = PROPOSAL_ALLOWED_VALUES[changeType] ?? [];
	for (const key of Object.keys(values)) {
		if ((TRIGGER_FORBIDDEN_IN_PROPOSAL as readonly string[]).includes(key)) continue;
		if (!allowed.includes(key)) {
			issues.push(
				issue('R-PERM-13', `field ${key} not allowed for ${changeType}`, `proposed_values.${key}`)
			);
		}
	}
	if (issues.length > 0) return issues;

	if (changeType === 'open_holding' && !(has(values, 'qty') && has(values, 'avg_price'))) {
		issues.push(issue('R-VAL-P04', 'open_holding needs qty and avg_price', 'proposed_values'));
	}
	if (changeType === 'set_qty_avg' && !has(values, 'qty') && !has(values, 'avg_price')) {
		issues.push(issue('R-VAL-P07', 'set_qty_avg needs qty and/or avg_price', 'proposed_values'));
	}
	if (has(values, 'qty')) {
		const qty = values.qty;
		if (typeof qty !== 'number' || !Number.isFinite(qty)) {
			issues.push(issue('R-VAL-M03', 'qty must be a finite number', 'proposed_values.qty'));
		} else if (qty <= 0) {
			issues.push(issue('R-VAL-P04', 'qty must be greater than 0', 'proposed_values.qty'));
		} else if (assetType) {
			const finding = ruleM03.check({ qty, asset_type: assetType, status: 'holding' }, 'strict');
			for (const f of Array.isArray(finding) ? finding : finding ? [finding] : []) {
				issues.push(issue(f.id, f.message, 'proposed_values.qty'));
			}
		}
	}
	if (has(values, 'avg_price')) {
		const v = values.avg_price;
		if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
			issues.push(
				issue('R-VAL-M02', 'avg_price must be a positive number', 'proposed_values.avg_price')
			);
		} else if (!hasAtMostNDecimals(v, 4)) {
			// D-4 / R-FMT-13: same 4-decimal cap as the approve/correct web paths.
			issues.push(
				issue(
					'R-FMT-13',
					'[R-FMT-13] USD/KRW unit prices keep at most 4 decimals on write',
					'proposed_values.avg_price'
				)
			);
		}
	}
	if (has(values, 'currency') && !(CURRENCIES as readonly unknown[]).includes(values.currency)) {
		issues.push(issue('R-VAL-M01', "currency must be 'KRW' or 'USD'", 'proposed_values.currency'));
	}
	return issues;
}

function sameValue(a: unknown, b: unknown): boolean {
	if (a === null || a === undefined || b === null || b === undefined) {
		return (a ?? null) === (b ?? null);
	}
	const na = Number(a);
	const nb = Number(b);
	if (typeof a !== 'string' && typeof b !== 'string' && !Number.isNaN(na) && !Number.isNaN(nb)) {
		return na === nb;
	}
	return a === b;
}

function currentValuesOf(position: Obj): Obj {
	return {
		status: position.status,
		qty: position.qty ?? null,
		avg_price: position.avg_price ?? null,
		currency: position.currency,
		breakeven: position.breakeven ?? null,
		trigger_price: position.trigger_price ?? null
	};
}

async function resolveProposalTarget(
	repo: RepoClient,
	changeType: string,
	args: Obj
): Promise<{ position: (PositionRow & Obj) | null; instrument: InstrumentRow }> {
	const instruments = unwrap(await listInstruments(repo, { includeArchived: true }));
	const positionId = typeof args.position_id === 'string' ? args.position_id : '';

	if (positionId) {
		const position = await findPosition(repo, positionId);
		const instrument = instruments.find((i) => i.id === position.instrument_id);
		if (!instrument) {
			throw new McpToolError('NOT_FOUND', [
				issue('R-VAL-C04', 'Instrument of position not found', 'position_id')
			]);
		}
		return { position, instrument };
	}

	const instrument = await resolveInstrument(repo, args);
	if (changeType === 'open_holding') return { position: null, instrument };

	const positions = unwrap(await listPositions(repo)).filter(
		(p) => p.instrument_id === instrument.id
	);
	const wanted =
		changeType === 'close'
			? (positions.find((p) => p.status === 'holding') ??
				positions.find((p) => p.status === 'planned'))
			: positions.find((p) => p.status === 'holding');
	if (!wanted) {
		throw new McpToolError('NOT_FOUND', [
			issue(
				'R-VAL-P02',
				`${changeType} needs an active ${changeType === 'close' ? 'holding/planned' : 'holding'} position for ${instrument.ticker}`,
				'ticker'
			)
		]);
	}
	return { position: wanted as PositionRow & Obj, instrument };
}

function assertPositionState(changeType: string, position: Obj): void {
	const status = position.status;
	if (status === 'closed') {
		throw validation(issue('R-VAL-P02', 'position is not active', 'position_id'));
	}
	if (changeType === 'open_holding' && status !== 'planned') {
		throw validation(
			issue('R-VAL-P02', 'open_holding with position_id requires a planned position', 'position_id')
		);
	}
	if (changeType === 'set_qty_avg' && status !== 'holding') {
		throw validation(issue('R-VAL-P02', 'set_qty_avg requires a holding position', 'position_id'));
	}
}

function registerProposePositionChange(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'propose_position_change',
		title: 'Propose position change',
		description:
			'보유 변경(open_holding | set_qty_avg | close)을 승인 큐에 올린다. 트리거·손익분기·관찰전용은 제안 불가(update_position_reference). evidence 1건 이상 필수.',
		inputSchema: {
			change_type: z.string().describe("'open_holding' | 'set_qty_avg' | 'close'"),
			position_id: z.string().optional(),
			ticker: z.string().optional(),
			instrument_id: z.string().optional(),
			proposed_values: z
				.record(z.string(), z.unknown())
				.describe(
					'open_holding: {qty, avg_price, currency?}; set_qty_avg: {qty?, avg_price?}; close: {}'
				),
			evidence: z
				.array(z.record(z.string(), z.unknown()))
				.describe('[{report_id?, journal_entry_id?, note?}] 최소 1건'),
			reason_md: z.string().optional(),
			calc_note: z
				.string()
				.optional()
				.describe('한 줄 ≤200자 계산 근거 (open_holding/set_qty_avg 권장)'),
			client_ref: z.string().optional()
		},
		annotations: { destructiveHint: false, idempotentHint: false },
		handler: async ({ args, repo }): Promise<ToolHandlerOutcome> => {
			const client = requireRepo(repo);
			const changeType = typeof args.change_type === 'string' ? args.change_type : '';

			if (changeType === 'set_trigger' || changeType === 'set_breakeven') {
				throw validation(
					issue(
						'R-VAL-P07',
						`${changeType} is not allowed; write trigger/breakeven via update_position_reference (R-PERM-17)`,
						'change_type'
					)
				);
			}
			if (!(changeType in PROPOSAL_ALLOWED_VALUES)) {
				throw validation(
					issue(
						'R-VAL-P07',
						"change_type must be one of 'open_holding', 'set_qty_avg', 'close'",
						'change_type'
					)
				);
			}
			if (!isObject(args.proposed_values)) {
				throw validation(
					issue('R-VAL-P07', 'proposed_values must be an object', 'proposed_values')
				);
			}
			const proposedValues = { ...args.proposed_values };

			const preIssues: McpRuleIssue[] = [];
			for (const key of TRIGGER_FORBIDDEN_IN_PROPOSAL) {
				if (Object.hasOwn(proposedValues, key)) {
					preIssues.push(
						issue(
							'R-VAL-P07',
							`${key} is a direct-write field and cannot be proposed (R-PERM-17)`,
							`proposed_values.${key}`
						)
					);
				}
			}
			failIfIssues(preIssues);

			const evidence = parseEvidence(args.evidence);

			const { position, instrument } = await resolveProposalTarget(client, changeType, args);
			if (position) assertPositionState(changeType, position);

			failIfIssues(validateProposedValues(changeType, proposedValues, instrument.asset_type));

			await assertEvidenceExists(client, evidence);

			const current = position ? currentValuesOf(position) : null;
			if (current && changeType !== 'close') {
				const entries = Object.entries(proposedValues);
				if (entries.every(([k, v]) => sameValue(v, current[k]))) {
					throw validation(
						issue('R-VAL-P07', 'proposed values equal current approved values', 'proposed_values')
					);
				}
			}

			const warnings: McpRuleIssue[] = [];
			const calcNote =
				typeof args.calc_note === 'string' && args.calc_note !== '' ? args.calc_note : null;
			const findings = ruleP09.check(
				{
					calc_note: calcNote,
					change_type: changeType as 'open_holding' | 'set_qty_avg' | 'close',
					proposed_by_type: 'bot'
				},
				'strict'
			);
			const calcIssues = Array.isArray(findings) ? findings : findings ? [findings] : [];
			const calcErrors = calcIssues.filter((f) => f.level === 'ERROR');
			failIfIssues(calcErrors.map((f) => issue(f.id, f.message, 'calc_note')));
			for (const f of calcIssues) warnings.push(issue(f.id, f.message, 'calc_note'));

			const row = unwrap(
				await createPositionProposal(client, {
					change_type: changeType,
					...(position ? { position_id: position.id } : { instrument_id: instrument.id }),
					proposed_values: proposedValues,
					evidence,
					reason_md: typeof args.reason_md === 'string' ? args.reason_md : null,
					calc_note: calcNote,
					client_ref: typeof args.client_ref === 'string' ? args.client_ref : null
				} as never)
			);
			if (!row) throw new Error('createPositionProposal returned no row');

			const supersededIds = await listSupersededBy(client, row.id);
			const rowObj = row as unknown as Obj;

			return {
				data: {
					proposal_id: row.id,
					display_id: row.display_id,
					status: row.status,
					current_values: (rowObj.current_values as Obj | null | undefined) ?? current,
					...(supersededIds.length > 0 ? { superseded_ids: supersededIds } : {})
				},
				warnings,
				affectedIds: [
					{ table: 'position_proposals', id: row.id },
					...supersededIds.map((id) => ({ table: 'position_proposals', id }))
				]
			};
		}
	});
}

/** Proposals the DB supersede trigger retired because of this insert (decision_note marker). */
async function listSupersededBy(repo: RepoClient, newId: string): Promise<string[]> {
	const { data, error } = await listPositionProposals(repo);
	if (error) return [];
	return data
		.filter((p) => {
			const o = p as unknown as Obj;
			return p.status === 'superseded' && o.decision_note === `superseded by ${newId}`;
		})
		.map((p) => p.id);
}

function registerCancelProposal(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'cancel_proposal',
		title: 'Cancel own position proposal',
		description:
			'내가 올린 pending/on_hold 보유 제안을 취소한다(proposal_id 또는 display_id P-xxxx).',
		inputSchema: {
			proposal_id: z.string().optional(),
			display_id: z.string().optional().describe('서버 표시 ID (예: P-0412)')
		},
		annotations: { destructiveHint: false, idempotentHint: true },
		handler: async ({ args, ctx, repo }): Promise<ToolHandlerOutcome> => {
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
					? await getPositionProposalById(client, proposalId)
					: await getPositionProposalByDisplayId(client, displayId)
			);
			if (!proposal) {
				throw new McpToolError('NOT_FOUND', [
					issue('R-PERM-05', `Proposal not found: ${proposalId || displayId}`, 'proposal_id')
				]);
			}
			if (proposal.proposed_by_type !== 'bot' || proposal.proposed_by !== ctx.botClientId) {
				throw new McpToolError('FORBIDDEN_SCOPE', [
					issue('R-PERM-05', 'Bots can only cancel their own proposals', 'proposal_id')
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
				await updateProposalStatus(client, proposal.id, {
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
				affectedIds: [{ table: 'position_proposals', id: cancelled.id }]
			};
		}
	});
}

export function registerPortfolioTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(filterToolsByScopes(PORTFOLIO_TOOL_NAMES, reg.ctx));
	if (allowed.has('create_planned_position')) registerCreatePlannedPosition(reg);
	if (allowed.has('update_position_reference')) registerUpdatePositionReference(reg);
	if (allowed.has('propose_position_change')) registerProposePositionChange(reg);
	if (allowed.has('cancel_proposal')) registerCancelProposal(reg);
}
