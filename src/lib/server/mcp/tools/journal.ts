/**
 * BE-09 — journal write MCP tools (scope `journal:write`): add / update / archive.
 *
 * - client_ref (Q-08, R-PERM-11): the repo makes create idempotent (same ref + same content →
 *   existing row, different content → CONFLICT). We only report `created:false` on replay.
 * - Validation lives here (M-5: repo never runs rules): R-VAL-J02/J03 for buy/sell, J05 price
 *   vs currency, C04 tickers must exist in instruments, J08 tags WARN.
 * - A buy/sell entry is a record, never a position change. No position mutation happens here;
 *   the bot gets an R-PERM-02 WARN pointing at the proposal flow instead.
 * - Bots may only modify/archive journal rows they created (R-PERM-01).
 */
import { z } from 'zod';
import {
	archiveJournalEntry,
	createJournalEntry,
	getInstrumentByTicker,
	listInstruments,
	listJournalEntries,
	updateJournalEntry,
	type RepoClient
} from '$lib/server/repo';
import {
	ruleJ02,
	ruleJ08,
	runRules,
	shouldHoldJournalForDbChecks,
	type ValidationIssue,
	type ValidationMode,
	type ValidationRule
} from '$lib/server/domain/validation';
import type { InstrumentRow, JournalEntryRow } from '$lib/types/mowa.contract';
import { McpToolError } from '../errors';
import { filterToolsByScopes } from '../scopes';
import type { McpContext, McpRuleIssue } from '../types';
import { throwMappedDbError, unwrapDb } from './db-error';
import {
	registerAuditedTool,
	type ToolHandlerInput,
	type ToolHandlerOutcome,
	type ToolRegistrationContext
} from './register';

const JOURNAL_TOOL_NAMES = ['add_journal_entry', 'update_journal_entry', 'archive_journal_entry'];

const KINDS = ['buy', 'sell', 'thought', 'plan', 'review'] as const;
const STATES = ['pending', 'done', 'hold', 'closed'] as const;
const CURRENCIES = ['KRW', 'USD'] as const;
const MAX_TICKERS = 30;
const SOURCE_URL_RE = /^https?:\/\/\S+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPOSAL_WARNING: McpRuleIssue = {
	rule: 'R-PERM-02',
	message: '제안 필요'
};

/** Columns an update patch may carry (client_ref is identity and immutable). */
const PATCH_KEYS = [
	'entry_date',
	'kind',
	'state',
	'instrument_id',
	'ticker',
	'tickers',
	'tags',
	'title',
	'price',
	'qty',
	'avg_price',
	'breakeven',
	'currency',
	'source_url',
	'memo_md',
	'report_id'
] as const;

const TRADE_KEYS = new Set(['kind', 'instrument_id', 'price', 'qty', 'currency']);

type Obj = Record<string, unknown>;

function issue(rule: string, message: string, field?: string): McpRuleIssue {
	return { rule, message, ...(field ? { field } : {}) };
}

function fromValidation(v: ValidationIssue): McpRuleIssue {
	return { rule: v.id, message: v.message };
}

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) throw new Error('repo unavailable for journal tools');
	return repo;
}

function isObject(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function present(value: unknown): boolean {
	return value !== undefined && value !== null;
}

function charCount(s: string): number {
	return [...s].length;
}

function isIsoDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const ms = Date.parse(`${value}T00:00:00Z`);
	return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

function validationMode(ctx: McpContext): ValidationMode {
	return ctx.scopes.includes('import:all') ? 'migration' : 'strict';
}

class IssueCollector {
	readonly errors: McpRuleIssue[] = [];
	readonly warnings: McpRuleIssue[] = [];
	readonly ruleIds: string[] = [];

	error(rule: string, message: string, field?: string): void {
		this.errors.push(issue(rule, message, field));
		this.ruleIds.push(rule);
	}

	rules<T>(rules: ValidationRule<T>[], input: T, mode: ValidationMode): void {
		const result = runRules(rules, input, mode);
		for (const e of result.errors) {
			this.errors.push(fromValidation(e));
			this.ruleIds.push(e.id);
		}
		for (const w of result.warnings) {
			this.warnings.push(fromValidation(w));
			this.ruleIds.push(w.id);
		}
	}

	throwIfErrors(): void {
		if (this.errors.length > 0) throw new McpToolError('VALIDATION', this.errors);
	}
}

function positiveNumber(
	c: IssueCollector,
	obj: Obj,
	field: string,
	rule: string
): number | null | undefined {
	const v = obj[field];
	if (v === undefined) return undefined;
	if (v === null) return null;
	if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
		c.error(rule, `${field} must be a positive number`, field);
		return undefined;
	}
	return v;
}

function stringList(c: IssueCollector, obj: Obj, field: string): string[] | undefined {
	const v = obj[field];
	if (v === undefined || v === null) return undefined;
	if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x.trim() === '')) {
		c.error('R-VAL-J08', `${field} must be an array of non-empty strings`, field);
		return undefined;
	}
	return v.map((x: string) => x.trim());
}

/**
 * Field-level checks for the keys in `touched` (every key on create). Values are normalised
 * into the returned column object; cross-field rules run on `merged` (existing row + patch).
 */
function validateFields(c: IssueCollector, input: Obj, touched: ReadonlySet<string>): Obj {
	const cols: Obj = {};
	const has = (k: string) => touched.has(k);

	if (has('entry_date')) {
		if (!isIsoDate(input.entry_date)) {
			c.error('R-VAL-T01', 'entry_date must be YYYY-MM-DD', 'entry_date');
		} else cols.entry_date = input.entry_date;
	}
	if (has('kind')) {
		if (!(KINDS as readonly unknown[]).includes(input.kind)) {
			c.error('R-VAL-J01', `kind must be one of: ${KINDS.join(', ')}`, 'kind');
		} else cols.kind = input.kind;
	}
	if (has('state')) {
		if (!(STATES as readonly unknown[]).includes(input.state)) {
			c.error('R-VAL-J01', `state must be one of: ${STATES.join(', ')}`, 'state');
		} else cols.state = input.state;
	}
	if (has('title')) {
		const t = input.title;
		if (typeof t !== 'string' || charCount(t) < 1 || charCount(t) > 200) {
			c.error('R-VAL-S05', 'title must be 1–200 chars', 'title');
		} else cols.title = t;
	}
	for (const field of ['price', 'qty', 'avg_price', 'breakeven'] as const) {
		if (!has(field)) continue;
		const v = positiveNumber(c, input, field, 'R-VAL-J05');
		if (v !== undefined) cols[field] = v;
	}
	if (has('currency')) {
		const cur = input.currency;
		if (cur === null) cols.currency = null;
		else if (!(CURRENCIES as readonly unknown[]).includes(cur)) {
			c.error('R-VAL-J05', `currency must be one of: ${CURRENCIES.join(', ')}`, 'currency');
		} else cols.currency = cur;
	}
	if (has('source_url') && input.source_url !== undefined) {
		const u = input.source_url;
		if (u === null) cols.source_url = null;
		else if (typeof u !== 'string' || !SOURCE_URL_RE.test(u)) {
			c.error('R-VAL-S04', 'source_url must be an http(s) URL', 'source_url');
		} else cols.source_url = u;
	}
	if (has('memo_md') && input.memo_md !== undefined) {
		if (input.memo_md !== null && typeof input.memo_md !== 'string') {
			c.error('R-SYS-01', 'memo_md must be a string', 'memo_md');
		} else cols.memo_md = input.memo_md;
	}
	if (has('report_id') && input.report_id !== undefined) {
		const r = input.report_id;
		if (r !== null && (typeof r !== 'string' || !UUID_RE.test(r))) {
			c.error('R-SYS-01', 'report_id must be a uuid', 'report_id');
		} else cols.report_id = r;
	}
	return cols;
}

type Resolved = {
	instrument: InstrumentRow | null;
	instrumentIdTouched: boolean;
};

/** Resolve `ticker` / `instrument_id` to a concrete owner instrument id (R-VAL-J03). */
async function resolveInstrument(
	repo: RepoClient,
	c: IssueCollector,
	input: Obj,
	instruments: InstrumentRow[],
	touched: ReadonlySet<string>
): Promise<Resolved> {
	const wantsId = touched.has('instrument_id') && present(input.instrument_id);
	const wantsTicker = touched.has('ticker') && present(input.ticker);
	let instrument: InstrumentRow | null = null;

	if (wantsTicker) {
		const ticker = input.ticker;
		if (typeof ticker !== 'string' || ticker.trim() === '') {
			c.error('R-VAL-J03', 'ticker must be a non-empty string', 'ticker');
		} else {
			instrument = unwrapDb(await getInstrumentByTicker(repo, ticker.trim()));
			if (!instrument) {
				c.error('R-VAL-C04', `ticker '${ticker.trim()}' does not exist in instruments`, 'ticker');
			}
		}
	}
	if (wantsId) {
		const id = input.instrument_id;
		const found =
			typeof id === 'string' && UUID_RE.test(id) ? instruments.find((i) => i.id === id) : null;
		if (!found) {
			c.error(
				'R-VAL-J03',
				`instrument_id does not match an instrument: ${String(id)}`,
				'instrument_id'
			);
		} else if (wantsTicker && instrument && instrument.id !== found.id) {
			c.error('R-VAL-J03', 'ticker and instrument_id refer to different instruments', 'ticker');
		} else if (!instrument) {
			instrument = found;
		}
	}
	return {
		instrument,
		instrumentIdTouched: wantsId || wantsTicker || touched.has('instrument_id')
	};
}

/** FE-10 filters on tickers[] only — include the instrument ticker for buy/sell (dedupe). */
function ensureTickerInList(tickers: string[], code: string): string[] {
	if (tickers.includes(code)) return tickers;
	return [...tickers, code];
}

/** Every tickers[] code must exist in instruments (R-VAL-C04). */
function checkTickers(c: IssueCollector, tickers: string[], known: ReadonlySet<string>): void {
	if (tickers.length > MAX_TICKERS) {
		c.error('R-VAL-C04', `tickers allows at most ${MAX_TICKERS} codes`, 'tickers');
	}
	for (const code of tickers) {
		if (!known.has(code)) {
			c.error('R-VAL-C04', `ticker '${code}' does not exist in instruments`, 'tickers');
		}
	}
}

type Merged = {
	kind: unknown;
	instrument_id: string | null;
	price: number | null;
	qty: number | null;
	currency: string | null;
};

/** J02 (strict ERROR / migration WARN) + the DB CHECKs J03/J05 that migration mode never loosens. */
function checkTradeShape(c: IssueCollector, merged: Merged, mode: ValidationMode): void {
	const input = {
		kind: String(merged.kind),
		instrument_id: merged.instrument_id,
		price: merged.price,
		qty: merged.qty,
		currency: merged.currency
	};
	c.rules([ruleJ02], input, mode);
	if (mode === 'migration' && shouldHoldJournalForDbChecks(input)) {
		if ((merged.kind === 'buy' || merged.kind === 'sell') && !merged.instrument_id) {
			c.error('R-VAL-J03', 'buy/sell requires instrument_id', 'instrument_id');
		}
		if (merged.price != null && !merged.currency) {
			c.error('R-VAL-J05', 'price requires currency', 'currency');
		}
	}
	if (mode === 'strict') {
		if ((merged.kind === 'buy' || merged.kind === 'sell') && !merged.instrument_id) {
			c.error('R-VAL-J03', 'buy/sell requires instrument_id (or a known ticker)', 'instrument_id');
		}
		if (merged.price != null && !merged.currency) {
			c.error('R-VAL-J05', 'price requires currency', 'currency');
		}
	}
}

async function loadInstruments(repo: RepoClient): Promise<InstrumentRow[]> {
	return unwrapDb(await listInstruments(repo, { includeArchived: true }));
}

function runTagRule(
	c: IssueCollector,
	tags: string[] | undefined,
	instruments: InstrumentRow[],
	mode: ValidationMode
): void {
	if (!tags) return;
	c.rules([ruleJ08], { tags, knownTickers: instruments.map((i) => i.ticker) }, mode);
}

async function findJournalById(repo: RepoClient, id: string): Promise<JournalEntryRow | null> {
	const rows = unwrapDb(await listJournalEntries(repo, { includeArchived: true }));
	return rows.find((r) => r.id === id) ?? null;
}

function requireId(args: Obj): string {
	const id = typeof args.id === 'string' ? args.id.trim() : '';
	if (!id) throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'id is required', 'id')]);
	return id;
}

async function loadOwnRow(
	repo: RepoClient,
	ctx: McpContext,
	id: string,
	verb: 'modify' | 'archive'
): Promise<JournalEntryRow> {
	const row = await findJournalById(repo, id);
	if (!row) {
		throw new McpToolError('NOT_FOUND', [
			issue('R-SYS-01', `Journal entry not found: ${id}`, 'id')
		]);
	}
	if (row.source_bot_id !== ctx.botClientId) {
		throw new McpToolError('VALIDATION', [
			issue('R-PERM-01', `Bots may only ${verb} journal entries they created`, 'id')
		]);
	}
	return row;
}

export async function addJournalEntryHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const repo = requireRepo(input.repo);
	const mode = validationMode(ctx);
	const c = new IssueCollector();

	const touched = new Set(Object.keys(args).filter((k) => args[k] !== undefined));
	for (const required of ['entry_date', 'kind', 'state', 'title']) {
		touched.add(required);
		if (!present(args[required])) {
			c.error(
				required === 'entry_date' ? 'R-VAL-T01' : required === 'title' ? 'R-VAL-S05' : 'R-VAL-J01',
				`${required} is required`,
				required
			);
		}
	}

	let clientRef: string | undefined;
	if (present(args.client_ref)) {
		const ref = args.client_ref;
		if (typeof ref !== 'string' || charCount(ref) < 1 || charCount(ref) > 120) {
			c.error('R-PERM-11', 'client_ref must be 1–120 chars', 'client_ref');
		} else clientRef = ref;
	}

	const cols = validateFields(c, args, touched);
	const tickers = stringList(c, args, 'tickers');
	const tags = stringList(c, args, 'tags');

	const instruments = await loadInstruments(repo);
	const resolved = await resolveInstrument(repo, c, args, instruments, touched);
	if (resolved.instrument) cols.instrument_id = resolved.instrument.id;

	let nextTickers = tickers ?? [];
	// FE-10 ticker filter reads tickers[] only — ensure buy/sell instrument code is present.
	const kind = (cols.kind ?? args.kind) as string;
	if ((kind === 'buy' || kind === 'sell') && resolved.instrument) {
		nextTickers = ensureTickerInList(nextTickers, resolved.instrument.ticker);
	}
	if (nextTickers.length > 0 || tickers) {
		checkTickers(c, nextTickers, new Set(instruments.map((i) => i.ticker)));
		cols.tickers = nextTickers;
	}
	runTagRule(c, tags, instruments, mode);

	checkTradeShape(
		c,
		{
			kind: cols.kind ?? args.kind,
			instrument_id: (cols.instrument_id as string | undefined) ?? null,
			price: (cols.price as number | null | undefined) ?? null,
			qty: (cols.qty as number | null | undefined) ?? null,
			currency: (cols.currency as string | null | undefined) ?? null
		},
		mode
	);
	c.throwIfErrors();

	let existedBefore = false;
	if (clientRef) {
		const rows = unwrapDb(await listJournalEntries(repo, { includeArchived: true }));
		existedBefore = rows.some((r) => r.client_ref === clientRef);
		cols.client_ref = clientRef;
	}

	const result = await createJournalEntry(repo, cols as never);
	if (result.error) throwMappedDbError(result.error);
	const row = result.data;
	if (!row) throw new Error('createJournalEntry returned no row');

	const warnings = [...c.warnings];
	if (cols.kind === 'buy' || cols.kind === 'sell') warnings.push(PROPOSAL_WARNING);

	return {
		data: { id: row.id, created: !existedBefore },
		warnings,
		affectedIds: [{ table: 'journal_entries', id: row.id }],
		ruleIds: c.ruleIds
	};
}

export async function updateJournalEntryHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const id = requireId(args);
	const repo = requireRepo(input.repo);
	const mode = validationMode(ctx);
	const c = new IssueCollector();

	if (!isObject(args.patch) || Object.keys(args.patch).length === 0) {
		throw new McpToolError('VALIDATION', [
			issue('R-SYS-01', 'patch must be a non-empty object', 'patch')
		]);
	}
	const patch = args.patch;
	const unknown = Object.keys(patch).filter(
		(k) => patch[k] !== undefined && !(PATCH_KEYS as readonly string[]).includes(k)
	);
	if (unknown.length > 0) {
		throw new McpToolError(
			'VALIDATION',
			unknown.map((k) => issue('R-SYS-01', `patch.${k} is not updatable`, `patch.${k}`))
		);
	}

	const row = await loadOwnRow(repo, ctx, id, 'modify');
	if (row.archived_at) {
		throw new McpToolError('CONFLICT', [
			issue('R-PERM-01', 'Archived journal entries cannot be modified by a bot', 'id')
		]);
	}

	const touched = new Set(Object.keys(patch).filter((k) => patch[k] !== undefined));
	const cols = validateFields(c, patch, touched);
	const tickers = touched.has('tickers') ? stringList(c, patch, 'tickers') : undefined;
	const tags = touched.has('tags') ? stringList(c, patch, 'tags') : undefined;

	const tradeTouched = [...touched].some((k) => TRADE_KEYS.has(k) || k === 'ticker');
	const needsInstruments =
		touched.has('instrument_id') || touched.has('ticker') || tickers || tags || tradeTouched;
	const instruments = needsInstruments ? await loadInstruments(repo) : [];
	const resolved = await resolveInstrument(repo, c, patch, instruments, touched);
	if (resolved.instrument) cols.instrument_id = resolved.instrument.id;
	else if (touched.has('instrument_id') && patch.instrument_id === null) cols.instrument_id = null;

	const merged: Merged = {
		kind: 'kind' in cols ? (cols.kind as string) : row.kind,
		instrument_id:
			'instrument_id' in cols ? (cols.instrument_id as string | null) : row.instrument_id,
		price: 'price' in cols ? (cols.price as number | null) : row.price,
		qty: 'qty' in cols ? (cols.qty as number | null) : row.qty,
		currency: 'currency' in cols ? (cols.currency as string | null) : row.currency
	};

	let nextTickers = tickers ?? (touched.has('tickers') ? [] : [...(row.tickers ?? [])]);
	if (merged.kind === 'buy' || merged.kind === 'sell') {
		const inst =
			resolved.instrument ??
			(merged.instrument_id
				? (instruments.find((i) => i.id === merged.instrument_id) ?? null)
				: null);
		if (inst) {
			nextTickers = ensureTickerInList(nextTickers, inst.ticker);
			cols.tickers = nextTickers;
		} else if (tickers) {
			cols.tickers = nextTickers;
		}
	} else if (tickers) {
		cols.tickers = nextTickers;
	}
	if (cols.tickers) {
		checkTickers(c, cols.tickers as string[], new Set(instruments.map((i) => i.ticker)));
	}
	runTagRule(c, tags, instruments, mode);

	if (tradeTouched) checkTradeShape(c, merged, mode);
	c.throwIfErrors();

	if (Object.keys(cols).length === 0) {
		throw new McpToolError('VALIDATION', [
			issue('R-SYS-01', 'patch contains no updatable values', 'patch')
		]);
	}

	const result = await updateJournalEntry(repo, id, cols as Partial<JournalEntryRow>);
	if (result.error) throwMappedDbError(result.error);
	if (!result.data) throw new Error('updateJournalEntry returned no row');

	const warnings = [...c.warnings];
	if (tradeTouched && (merged.kind === 'buy' || merged.kind === 'sell')) {
		warnings.push(PROPOSAL_WARNING);
	}

	return {
		data: { id, updated: true },
		warnings,
		affectedIds: [{ table: 'journal_entries', id }],
		ruleIds: c.ruleIds
	};
}

export async function archiveJournalEntryHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const id = requireId(args);
	const repo = requireRepo(input.repo);
	const row = await loadOwnRow(repo, ctx, id, 'archive');
	if (!row.archived_at) {
		const result = await archiveJournalEntry(repo, id);
		if (result.error) throwMappedDbError(result.error);
	}
	return {
		data: { id, archived: true },
		affectedIds: [{ table: 'journal_entries', id }]
	};
}

const optionalNumber = z.number().nullable().optional();

const entryFields = {
	instrument_id: z.string().nullable().optional().describe('instrument uuid (buy/sell 필수)'),
	ticker: z
		.string()
		.optional()
		.describe('instrument_id 대신 종목 코드로 지정 (instruments에 존재해야 함)'),
	tickers: z
		.array(z.string())
		.optional()
		.describe('다종목 연결 코드 목록 — 모두 instruments에 존재해야 함 (최대 30)'),
	tags: z
		.array(z.string())
		.optional()
		.describe('저장되지 않음. 종목 코드가 섞여 있으면 R-VAL-J08 WARN만 반환'),
	price: optionalNumber.describe('체결가/관측 종가 (>0, currency 필요)'),
	qty: optionalNumber.describe('수량 (>0)'),
	avg_price: optionalNumber,
	breakeven: optionalNumber,
	currency: z.enum(CURRENCIES).nullable().optional(),
	source_url: z.string().nullable().optional(),
	memo_md: z.string().nullable().optional(),
	report_id: z.string().nullable().optional()
};

function registerAddJournalEntry(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'add_journal_entry',
		title: 'Add journal entry',
		description:
			'매매일지/메모를 추가한다. kind=buy|sell은 instrument(또는 ticker), price, qty, currency 필수. client_ref가 같으면 재시도로 간주해 created:false로 기존 행을 돌려준다(내용이 다르면 CONFLICT). buy/sell 기록은 포지션을 바꾸지 않는다 — 수량/평단 변경은 propose_position_change로 제안해야 한다(R-PERM-02 WARN).',
		inputSchema: {
			entry_date: z.string().describe('YYYY-MM-DD'),
			kind: z.enum(KINDS),
			state: z.enum(STATES),
			title: z.string().describe('1–200자'),
			client_ref: z.string().optional().describe('멱등 키 (1–120자, 소유자 내 유일)'),
			...entryFields
		},
		annotations: { destructiveHint: false, idempotentHint: true },
		handler: addJournalEntryHandler
	});
}

function registerUpdateJournalEntry(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'update_journal_entry',
		title: 'Update journal entry',
		description:
			'자신(봇)이 작성한 일지를 수정한다. patch에 바꿀 필드만 담는다. 다른 봇/사용자 소유는 R-PERM-01로 거부. client_ref는 변경할 수 없다.',
		inputSchema: {
			id: z.string().describe('journal entry uuid'),
			patch: z
				.object({
					entry_date: z.string().optional(),
					kind: z.enum(KINDS).optional(),
					state: z.enum(STATES).optional(),
					title: z.string().optional(),
					...entryFields
				})
				.strict()
		},
		annotations: { destructiveHint: false, idempotentHint: true },
		handler: updateJournalEntryHandler
	});
}

function registerArchiveJournalEntry(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'archive_journal_entry',
		title: 'Archive journal entry',
		description: '자신(봇)이 작성한 일지를 보관 처리한다. 다른 봇/사용자 소유는 R-PERM-01로 거부.',
		inputSchema: { id: z.string().describe('journal entry uuid') },
		annotations: { destructiveHint: true, idempotentHint: true },
		handler: archiveJournalEntryHandler
	});
}

export function registerJournalTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(filterToolsByScopes(JOURNAL_TOOL_NAMES, reg.ctx));
	if (allowed.has('add_journal_entry')) registerAddJournalEntry(reg);
	if (allowed.has('update_journal_entry')) registerUpdateJournalEntry(reg);
	if (allowed.has('archive_journal_entry')) registerArchiveJournalEntry(reg);
}
