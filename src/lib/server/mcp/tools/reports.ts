/**
 * BE-07 — report write MCP tools (design §5-5): upsert_report / archive_report.
 *
 * Natural key (owner, kind, report_date, slug): the same bot re-posting a key updates it
 * (version+1 via DB trigger), another bot/user owning the key is a CONFLICT (R-PERM-16 /
 * R-VAL-R11). The render cache (body_blocks/toc) is always server-built; client-sent cache
 * fields are dropped first (R-VAL-S03). A failed render never blocks saving body_md.
 */
import { z } from 'zod';
import {
	archiveReport,
	createReport,
	getReportById,
	getReportByNaturalKey,
	replaceReportSources,
	updateReport,
	type ReportSourceInput,
	type RepoClient
} from '$lib/server/repo';
import {
	ruleR04,
	ruleR12,
	ruleR13,
	ruleR14,
	ruleR15,
	runRules,
	type ValidationIssue,
	type ValidationMode,
	type ValidationRule
} from '$lib/server/domain/validation';
import type { ReportRow } from '$lib/types/mowa.contract';
import { McpToolError } from '../errors';
import { assertReportKindScope, filterToolsByScopes } from '../scopes';
import type { McpContext, McpRuleIssue } from '../types';
import {
	buildCachedRender,
	cachedRenderToColumns,
	clearedRenderColumns,
	stripClientRenderCache
} from './cached-render';
import { throwMappedDbError } from './db-error';
import {
	registerAuditedTool,
	type ToolHandlerInput,
	type ToolHandlerOutcome,
	type ToolRegistrationContext
} from './register';

const REPORT_TOOL_NAMES = ['upsert_report', 'archive_report'];

const REPORT_KINDS = [
	'daily_brief',
	'weekly_report',
	'equity_analysis',
	'realestate_brief',
	'realestate_analysis',
	'strategy',
	'principles'
] as const;
const DOMAINS = ['macro', 'stock', 'realestate'] as const;
const STATUSES = ['draft', 'published'] as const;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DISCLAIMER_RE = /투자\s*권유\s*아님|투자\s*자문이\s*아님|투자\s*조언이\s*아님/;
const SOURCE_URL_RE = /^https?:\/\/\S+$/;
const MAX_BODY_BYTES = 1_048_576;
const DAY_MS = 86_400_000;

type Obj = Record<string, unknown>;

function issue(rule: string, message: string, field?: string): McpRuleIssue {
	return { rule, message, ...(field ? { field } : {}) };
}

function fromValidation(v: ValidationIssue): McpRuleIssue {
	return { rule: v.id, message: v.message };
}

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) throw new Error('repo unavailable for report tools');
	return repo;
}

function unwrap<T>(result: { data: T; error: Error | null }): T {
	if (result.error) throwMappedDbError(result.error);
	return result.data;
}

function has(args: Obj, key: string): boolean {
	return Object.hasOwn(args, key) && args[key] !== undefined && args[key] !== null;
}

function isObject(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function charCount(s: string): number {
	return [...s].length;
}

function parseIsoDate(value: unknown): number | null {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const ms = Date.parse(`${value}T00:00:00Z`);
	if (Number.isNaN(ms)) return null;
	return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

function isoDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

function throwScopeResult(result: ReturnType<typeof assertReportKindScope>): void {
	if (result)
		throw new McpToolError(result.structuredContent.code, result.structuredContent.errors);
}

function defaultDomain(kind: string): (typeof DOMAINS)[number] | null {
	if (kind === 'daily_brief' || kind === 'weekly_report') return 'macro';
	if (kind === 'equity_analysis') return 'stock';
	if (kind.startsWith('realestate_')) return 'realestate';
	return null;
}

function stringArray(
	value: unknown,
	field: string,
	rule: string,
	issues: McpRuleIssue[]
): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
		issues.push(issue(rule, `${field} must be an array of strings`, field));
		return undefined;
	}
	return value as string[];
}

function parseSources(raw: unknown, issues: McpRuleIssue[]): ReportSourceInput[] {
	if (!Array.isArray(raw) || raw.length < 1) {
		issues.push(issue('R-VAL-R07', 'sources requires at least 1 item', 'sources'));
		return [];
	}
	const out: ReportSourceInput[] = [];
	for (const [i, item] of raw.entries()) {
		const at = `sources[${i}]`;
		if (!isObject(item)) {
			issues.push(issue('R-VAL-R07', 'source must be an object', at));
			continue;
		}
		const label = typeof item.label === 'string' ? item.label.trim() : '';
		const publisher = typeof item.publisher === 'string' ? item.publisher.trim() : '';
		if (!label) issues.push(issue('R-VAL-R07', 'source.label is required', `${at}.label`));
		if (!publisher) {
			issues.push(issue('R-VAL-R07', 'source.publisher is required', `${at}.publisher`));
		}
		let accessedAt = new Date().toISOString();
		if (item.accessed_at !== undefined && item.accessed_at !== null) {
			if (typeof item.accessed_at !== 'string' || Number.isNaN(Date.parse(item.accessed_at))) {
				issues.push(
					issue('R-VAL-R07', 'source.accessed_at must be an ISO timestamp', `${at}.accessed_at`)
				);
			} else {
				accessedAt = item.accessed_at;
			}
		}
		let url: string | null = null;
		if (item.url !== undefined && item.url !== null) {
			if (typeof item.url !== 'string' || !SOURCE_URL_RE.test(item.url)) {
				issues.push(issue('R-VAL-R07', 'source.url must be an http(s) URL', `${at}.url`));
			} else {
				url = item.url;
			}
		}
		if (item.is_primary !== undefined && typeof item.is_primary !== 'boolean') {
			issues.push(issue('R-VAL-R07', 'source.is_primary must be boolean', `${at}.is_primary`));
		}
		if (label && publisher) {
			out.push({
				label,
				publisher,
				accessed_at: accessedAt,
				url,
				is_primary: item.is_primary === true
			});
		}
	}
	return out;
}

type ValidatedReport = {
	kind: string;
	subtype: 'buy_plan' | null;
	domain: (typeof DOMAINS)[number];
	row: Obj;
	sources: ReportSourceInput[];
	warnings: McpRuleIssue[];
	ruleIds: string[];
};

function validationMode(ctx: McpContext): ValidationMode {
	return ctx.scopes.includes('import:all') ? 'migration' : 'strict';
}

function applyRules<T>(
	rules: ValidationRule<T>[],
	input: T,
	mode: ValidationMode,
	errors: McpRuleIssue[],
	warnings: McpRuleIssue[],
	ruleIds: string[]
): void {
	const result = runRules(rules, input, mode);
	for (const e of result.errors) {
		errors.push(fromValidation(e));
		ruleIds.push(e.id);
	}
	for (const w of result.warnings) {
		warnings.push(fromValidation(w));
		ruleIds.push(w.id);
	}
}

/** Resolve kind/subtype and enforce the kind-level scope (before any other validation). */
function resolveKindAndScope(
	ctx: McpContext,
	args: Obj
): { kind: string; subtype: 'buy_plan' | null } {
	const kind = args.kind;
	if (typeof kind !== 'string' || !(REPORT_KINDS as readonly string[]).includes(kind)) {
		throw new McpToolError('VALIDATION', [
			issue('R-VAL-R01', `kind must be one of: ${REPORT_KINDS.join(', ')}`, 'kind')
		]);
	}
	let subtype: 'buy_plan' | null = null;
	if (has(args, 'subtype')) {
		if (args.subtype !== 'buy_plan' || kind !== 'equity_analysis') {
			throw new McpToolError('VALIDATION', [
				issue('R-VAL-R01', "subtype may only be 'buy_plan' on equity_analysis", 'subtype')
			]);
		}
		subtype = 'buy_plan';
	}
	throwScopeResult(assertReportKindScope(ctx, kind, subtype));
	return { kind, subtype };
}

function validateUpsert(ctx: McpContext, args: Obj): ValidatedReport {
	const { kind, subtype } = resolveKindAndScope(ctx, args);
	const mode = validationMode(ctx);
	const errors: McpRuleIssue[] = [];
	const warnings: McpRuleIssue[] = [];
	const ruleIds: string[] = [];

	const reportDate = args.report_date;
	const dateMs = parseIsoDate(reportDate);
	if (dateMs === null) {
		errors.push(issue('R-VAL-T05', 'report_date must be YYYY-MM-DD', 'report_date'));
	}

	const slug = args.slug;
	if (typeof slug !== 'string' || slug.length < 1 || slug.length > 80 || !SLUG_RE.test(slug)) {
		errors.push(
			issue('R-VAL-S06', 'slug must be 1–80 chars of lowercase a-z, 0-9 and hyphens', 'slug')
		);
	}

	const title = args.title;
	if (typeof title !== 'string' || charCount(title) < 1 || charCount(title) > 200) {
		errors.push(issue('R-VAL-S05', 'title must be 1–200 chars', 'title'));
	}

	const summary = args.summary;
	if (typeof summary !== 'string' || summary.trim() === '') {
		errors.push(issue('R-VAL-R04', 'summary is required (1–3 lines)', 'summary'));
	}

	const body = args.body_md;
	if (typeof body !== 'string' || body.trim() === '') {
		errors.push(issue('R-VAL-S02', 'body_md is required', 'body_md'));
	} else {
		if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
			errors.push(issue('R-VAL-S02', 'body_md must be at most 1MB', 'body_md'));
		}
		if (!DISCLAIMER_RE.test(body)) {
			errors.push(
				issue(
					'R-VAL-R09',
					'body_md must contain a disclaimer (투자 권유 아님 / 투자 자문이 아님 / 투자 조언이 아님)',
					'body_md'
				)
			);
		}
	}

	const sources = parseSources(args.sources, errors);

	let domain = defaultDomain(kind);
	if (has(args, 'domain')) {
		if (!(DOMAINS as readonly unknown[]).includes(args.domain)) {
			errors.push(issue('R-VAL-R02', `domain must be one of: ${DOMAINS.join(', ')}`, 'domain'));
		} else {
			const expected = defaultDomain(kind);
			if (expected && args.domain !== expected) {
				errors.push(issue('R-VAL-R02', `kind '${kind}' requires domain '${expected}'`, 'domain'));
			} else if (!expected && args.domain === 'realestate') {
				errors.push(
					issue('R-VAL-R02', "domain 'realestate' requires a realestate_* kind", 'domain')
				);
			}
			domain = args.domain as (typeof DOMAINS)[number];
		}
	} else if (!domain) {
		errors.push(issue('R-VAL-R02', `domain is required for kind '${kind}'`, 'domain'));
	}

	let status: (typeof STATUSES)[number] = subtype === 'buy_plan' ? 'draft' : 'published';
	if (has(args, 'status')) {
		if (!(STATUSES as readonly unknown[]).includes(args.status)) {
			errors.push(issue('R-VAL-R05', "status must be 'draft' or 'published'", 'status'));
		} else {
			status = args.status as (typeof STATUSES)[number];
		}
	}
	if (subtype === 'buy_plan' && status !== 'draft') {
		errors.push(
			issue('R-VAL-R05', 'buy_plan reports may only be written with status=draft', 'status')
		);
	}

	let meta: Obj | undefined;
	if (has(args, 'meta')) {
		if (!isObject(args.meta)) {
			errors.push(issue('R-VAL-R14', 'meta must be an object', 'meta'));
		} else {
			meta = args.meta;
		}
	}
	const tags = stringArray(args.tags, 'tags', 'R-VAL-R06', errors);
	const tickers = stringArray(args.tickers, 'tickers', 'R-VAL-R06', errors);

	if (has(args, 'headline') && typeof args.headline !== 'string') {
		errors.push(issue('R-VAL-R12', 'headline must be a string', 'headline'));
	}

	let generatedAt = new Date().toISOString();
	if (has(args, 'generated_at')) {
		if (typeof args.generated_at !== 'string' || Number.isNaN(Date.parse(args.generated_at))) {
			errors.push(issue('R-VAL-T02', 'generated_at must be an ISO timestamp', 'generated_at'));
		} else {
			generatedAt = args.generated_at;
		}
	}

	let periodStart: string | undefined;
	let periodEnd: string | undefined;
	for (const field of ['period_start', 'period_end'] as const) {
		if (!has(args, field)) continue;
		if (parseIsoDate(args[field]) === null) {
			errors.push(issue('R-VAL-T05', `${field} must be YYYY-MM-DD`, field));
		} else if (field === 'period_start') {
			periodStart = args[field] as string;
		} else {
			periodEnd = args[field] as string;
		}
	}
	if (periodStart && periodEnd && periodStart > periodEnd) {
		errors.push(issue('R-VAL-T05', 'period_start must not be after period_end', 'period_start'));
	}
	if (kind === 'weekly_report' && dateMs !== null) {
		const expectedStart = isoDay(dateMs - 6 * DAY_MS);
		if (new Date(dateMs).getUTCDay() !== 0) {
			errors.push(issue('R-VAL-T05', 'weekly_report report_date must be a Sunday', 'report_date'));
		}
		if (periodStart !== undefined && periodStart !== expectedStart) {
			errors.push(
				issue('R-VAL-T05', `weekly_report period_start must be ${expectedStart}`, 'period_start')
			);
		}
		if (periodEnd !== undefined && periodEnd !== reportDate) {
			errors.push(
				issue('R-VAL-T05', 'weekly_report period_end must equal report_date', 'period_end')
			);
		}
		periodStart = expectedStart;
		periodEnd = reportDate as string;
	}

	const headline = typeof args.headline === 'string' ? args.headline : null;
	applyRules([ruleR12], { headline }, mode, errors, warnings, ruleIds);
	applyRules(
		[ruleR04],
		{ summary: typeof summary === 'string' ? summary : null },
		mode,
		errors,
		warnings,
		ruleIds
	);
	applyRules(
		[ruleR13],
		{
			kind,
			profile: ctx.profile,
			meta: meta ?? null,
			body_md: typeof body === 'string' ? body : null
		},
		mode,
		errors,
		warnings,
		ruleIds
	);
	applyRules([ruleR14], { meta: meta ?? null }, mode, errors, warnings, ruleIds);
	applyRules([ruleR15], { kind, meta: meta ?? null }, mode, errors, warnings, ruleIds);

	if (errors.length > 0) throw new McpToolError('VALIDATION', errors);

	const row: Obj = {
		kind,
		domain,
		slug,
		title,
		report_date: reportDate,
		summary,
		body_md: body,
		status,
		generated_at: generatedAt
	};
	if (subtype) row.subtype = subtype;
	if (headline !== null) row.headline = headline;
	if (periodStart !== undefined) row.period_start = periodStart;
	if (periodEnd !== undefined) row.period_end = periodEnd;
	if (tags !== undefined) row.tags = tags;
	if (tickers !== undefined) row.tickers = tickers;
	if (meta !== undefined) row.meta = meta;

	return {
		kind,
		subtype,
		domain: domain as (typeof DOMAINS)[number],
		row,
		sources,
		warnings,
		ruleIds
	};
}

function conflictOnOwnership(slug: string, existing: ReportRow): McpToolError {
	const owner = existing.source_bot_id === null ? 'a user' : 'another bot';
	const message = `Report (${existing.kind}, ${existing.report_date}, ${slug}) is owned by ${owner}; use a different slug`;
	return new McpToolError('CONFLICT', [
		issue('R-PERM-16', message, 'slug'),
		issue('R-VAL-R11', message, 'slug')
	]);
}

export async function upsertReportHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const { ctx } = input;
	const args = stripClientRenderCache(input.args) as Obj;
	const v = validateUpsert(ctx, args);
	const repo = requireRepo(input.repo);

	const existing = unwrap(
		await getReportByNaturalKey(repo, {
			kind: v.kind,
			reportDate: v.row.report_date as string,
			slug: v.row.slug as string
		})
	);
	if (existing && existing.source_bot_id !== ctx.botClientId) {
		throw conflictOnOwnership(v.row.slug as string, existing);
	}
	if (existing?.archived_at) {
		throw new McpToolError('CONFLICT', [
			issue('R-VAL-R03', 'An archived report already uses this key; use a different slug', 'slug')
		]);
	}

	const render = buildCachedRender(v.row.body_md as string);
	const renderColumns = render ? cachedRenderToColumns(render) : clearedRenderColumns();

	let saved: ReportRow;
	let created: boolean;
	if (existing) {
		const patch = { ...v.row, ...renderColumns };
		const updated = unwrap(await updateReport(repo, existing.id, patch as Partial<ReportRow>));
		if (!updated) throw new Error('updateReport returned no row');
		saved = updated;
		created = false;
	} else {
		const insert: Obj = { ...v.row, ...renderColumns };
		if (isObject(args.source_ref)) insert.source_ref = args.source_ref;
		const row = unwrap(await createReport(repo, insert as never));
		if (!row) throw new Error('createReport returned no row');
		saved = row;
		created = true;
	}

	const sourceResult = await replaceReportSources(repo, saved.id, v.sources);
	if (sourceResult.error) throwMappedDbError(sourceResult.error);

	return {
		data: {
			id: saved.id,
			version: saved.version,
			created
		},
		warnings: v.warnings,
		affectedIds: [{ table: 'reports', id: saved.id }],
		ruleIds: v.ruleIds
	};
}

export async function archiveReportHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const id = typeof args.id === 'string' ? args.id.trim() : '';
	if (!id) {
		throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'id is required', 'id')]);
	}
	const repo = requireRepo(input.repo);
	const report = unwrap(await getReportById(repo, id));
	if (!report) {
		throw new McpToolError('NOT_FOUND', [issue('R-SYS-01', `Report not found: ${id}`, 'id')]);
	}
	throwScopeResult(assertReportKindScope(ctx, report.kind, report.subtype));
	if (report.source_bot_id !== ctx.botClientId) {
		throw new McpToolError('CONFLICT', [
			issue('R-PERM-16', 'Only the bot that wrote a report may archive it', 'id')
		]);
	}
	if (!report.archived_at) {
		const result = await archiveReport(repo, id);
		if (result.error) throwMappedDbError(result.error);
	}
	return {
		data: { id, archived: true },
		affectedIds: [{ table: 'reports', id }]
	};
}

const sourceShape = z.object({
	label: z.string(),
	publisher: z.string(),
	accessed_at: z.string().optional().describe('ISO8601 (생략 시 현재 시각)'),
	url: z.string().nullable().optional(),
	is_primary: z.boolean().optional()
});

function registerUpsertReport(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'upsert_report',
		title: 'Upsert report',
		description:
			'리포트를 (kind, report_date, slug) 키로 작성/갱신한다. 같은 봇이 같은 키로 다시 쓰면 version+1, 다른 봇/사용자 소유 키는 CONFLICT. body_blocks/toc는 서버가 생성하므로 보내도 무시된다. 본문에 면책 문구(투자 권유 아님 등) 필수, sources 1건 이상 필수. source_ref는 최초 생성 시에만 반영된다.',
		inputSchema: {
			kind: z
				.string()
				.describe('daily_brief | weekly_report | equity_analysis | strategy | realestate_*'),
			report_date: z.string().describe('YYYY-MM-DD (weekly_report는 일요일)'),
			slug: z.string().describe('소문자·숫자·하이픈 1–80자'),
			title: z.string(),
			summary: z.string().describe('1–3줄'),
			body_md: z.string(),
			sources: z.array(sourceShape).describe('근거 출처 1건 이상 (upsert 시 전체 교체)'),
			subtype: z.string().nullable().optional().describe("equity_analysis의 'buy_plan' (draft만)"),
			domain: z.string().optional().describe('macro | stock | realestate (kind별 기본값 있음)'),
			headline: z
				.string()
				.nullable()
				.optional()
				.describe('목록용 한 줄 (≤120자, 80자 초과 시 WARN)'),
			period_start: z.string().nullable().optional(),
			period_end: z.string().nullable().optional(),
			generated_at: z.string().nullable().optional(),
			tags: z.array(z.string()).optional(),
			tickers: z.array(z.string()).optional(),
			status: z.string().optional().describe("'draft' | 'published'"),
			meta: z.record(z.string(), z.unknown()).optional(),
			source_ref: z.record(z.string(), z.unknown()).optional(),
			body_blocks: z.unknown().optional().describe('무시됨 — 서버가 렌더 캐시를 생성'),
			bodyBlocks: z.unknown().optional().describe('무시됨 — 서버가 렌더 캐시를 생성'),
			toc: z.unknown().optional().describe('무시됨 — 서버가 렌더 캐시를 생성')
		},
		annotations: { destructiveHint: false, idempotentHint: true },
		handler: upsertReportHandler
	});
}

function registerArchiveReport(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'archive_report',
		title: 'Archive report',
		description: '자신(봇)이 작성한 리포트를 보관 처리한다. 다른 봇/사용자 소유는 CONFLICT.',
		inputSchema: { id: z.string().describe('report uuid') },
		annotations: { destructiveHint: true, idempotentHint: true },
		handler: archiveReportHandler
	});
}

export function registerReportsTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(filterToolsByScopes(REPORT_TOOL_NAMES, reg.ctx));
	if (allowed.has('upsert_report')) registerUpsertReport(reg);
	if (allowed.has('archive_report')) registerArchiveReport(reg);
}
