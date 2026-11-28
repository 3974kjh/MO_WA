/**
 * BE-10 — market / decision / event MCP tools (design §5-5).
 * Batches ≤500. KRX codes R-VAL-C01. Alias-as-ticker rejected with candidates (R-VAL-C05).
 * portfolio_snapshots.weights / plan_distances: G-9 zod contract below.
 */
import { z } from 'zod';
import {
	archiveDecision,
	archiveEvent,
	createDecision,
	createEvent,
	createInstrument,
	getDecisionById,
	getEventById,
	getInstrumentByTicker,
	listInstruments,
	updateInstrument,
	upsertMarketIndicators,
	upsertPortfolioSnapshot,
	upsertPriceSnapshots,
	type RepoClient
} from '$lib/server/repo';

/** design §5-5 batch cap (mirrors repo MAX_SNAPSHOT_BATCH). */
const MAX_SNAPSHOT_BATCH = 500;
import type { InstrumentRow } from '$lib/types/mowa.contract';
import { McpToolError } from '../errors';
import { isRealIsoDate } from '../marketCalendar';
import { filterToolsByScopes, hasScope } from '../scopes';
import type { McpContext, McpRuleIssue } from '../types';
import { throwMappedDbError, unwrapDb } from './db-error';
import {
	registerAuditedTool,
	type ToolHandlerInput,
	type ToolHandlerOutcome,
	type ToolRegistrationContext
} from './register';

const MARKET_TOOL_NAMES = [
	'upsert_instrument',
	'record_price_snapshots',
	'record_portfolio_snapshot',
	'record_market_indicators',
	'upsert_decision',
	'archive_decision',
	'upsert_event',
	'archive_event'
] as const;

const KRX_RE = /^\d{6}$/;
const REGISTERED_INDICATOR_KEYS = new Set(['kospi', 'kosdaq', 'usdkrw', 'ust10y', 'vix']);
const ASSET_TYPES = ['stock', 'etf', 'bond', 'cash'] as const;
const EVENT_DOMAINS = ['stock', 'macro', 'realestate'] as const;

/** G-9: portfolio_snapshots.weights jsonb */
export const portfolioWeightsSchema = z
	.object({
		by_asset_class: z.record(z.string(), z.number()).optional(),
		by_ticker: z.record(z.string(), z.number()).optional(),
		dollar_pct: z.number().optional(),
		risk_pct: z.number().optional()
	})
	.passthrough();

/** G-9: portfolio_snapshots.plan_distances jsonb */
export const portfolioPlanDistancesSchema = z
	.object({
		items: z
			.array(
				z.object({
					key: z.string(),
					label: z.string().optional(),
					current_pct: z.number().optional(),
					limit_pct: z.number().optional(),
					headroom_amount: z.number().optional(),
					currency: z.enum(['KRW', 'USD']).optional()
				})
			)
			.optional()
	})
	.passthrough();

type Obj = Record<string, unknown>;

/** Reserved for submit_daily_market_feed — generic write tools may not claim it. */
const RESERVED_FEED_SOURCE = 'fm:daily-feed';
const MAX_EXTRA_BYTES = 4096;

const isoDateField = z
	.string()
	.max(10)
	.refine((v) => isRealIsoDate(v), { message: 'must be a real ISO date YYYY-MM-DD' });

const sourceField = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9_.:-]+$/, 'source: letters, digits, _ . : - only')
	.refine((v) => v !== RESERVED_FEED_SOURCE, {
		message: `source '${RESERVED_FEED_SOURCE}' is reserved for submit_daily_market_feed`
	});

function maxDecimals(places: number) {
	const f = 10 ** places;
	return (n: number) => Math.abs(Math.round(n * f) / f - n) <= 1e-9 * Math.max(1, Math.abs(n));
}

/**
 * §3-6 field allow-list for record_price_snapshots rows. Server-owned columns
 * (id, owner_id, source_bot_id, created_at) and unknown keys are rejected.
 */
export const priceSnapshotRowSchema = z.strictObject({
	instrument_id: z.uuid(),
	as_of: isoDateField,
	close: z
		.number()
		.finite()
		.positive()
		.max(1e14)
		.refine(maxDecimals(6), { message: 'close: at most 6 decimal places' }),
	currency: z.enum(['KRW', 'USD']),
	change_pct: z
		.number()
		.finite()
		.min(-99999)
		.max(99999)
		.refine(maxDecimals(3), { message: 'change_pct: at most 3 decimal places' })
		.nullable()
		.optional(),
	volume: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
	foreign_net_buy: z
		.number()
		.finite()
		.min(-1e17)
		.max(1e17)
		.refine(maxDecimals(2), { message: 'at most 2 decimal places' })
		.nullable()
		.optional(),
	inst_net_buy: z
		.number()
		.finite()
		.min(-1e17)
		.max(1e17)
		.refine(maxDecimals(2), { message: 'at most 2 decimal places' })
		.nullable()
		.optional(),
	source: sourceField.nullable().optional(),
	extra: z
		.record(z.string(), z.unknown())
		.refine((v) => JSON.stringify(v).length <= MAX_EXTRA_BYTES, {
			message: `extra must serialize to ≤ ${MAX_EXTRA_BYTES} bytes`
		})
		.optional()
});

/** Basic sanity ranges for record_market_indicators (wide: history imports must still fit). */
const INDICATOR_SANITY_RANGE: Readonly<Record<string, readonly [number, number]>> = {
	kospi: [100, 50000],
	kosdaq: [50, 20000],
	usdkrw: [500, 3000],
	ust10y: [-5, 30],
	vix: [1, 200]
};

export const marketIndicatorRowSchema = z.strictObject({
	key: z.string().max(40),
	as_of: isoDateField,
	value: z.number().finite().refine(maxDecimals(6), { message: 'value: at most 6 decimal places' }),
	change: z
		.number()
		.finite()
		.refine(maxDecimals(6), { message: 'change: at most 6 decimal places' })
		.nullable()
		.optional(),
	change_pct: z
		.number()
		.finite()
		.min(-99999)
		.max(99999)
		.refine(maxDecimals(3), { message: 'change_pct: at most 3 decimal places' })
		.nullable()
		.optional(),
	source: sourceField.nullable().optional()
});

function firstZodIssue(err: z.ZodError, prefix: string): { field: string; message: string } {
	const iss = err.issues[0];
	const path = iss?.path?.length ? `${prefix}.${iss.path.join('.')}` : prefix;
	return { field: path, message: iss?.message ?? 'invalid row' };
}

function issue(rule: string, message: string, field?: string): McpRuleIssue {
	return { rule, message, ...(field ? { field } : {}) };
}

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) throw new Error('repo unavailable for market tools');
	return repo;
}

function hasWrite(ctx: McpContext): boolean {
	return hasScope(ctx, 'instruments:write') || hasScope(ctx, 'import:all');
}

function hasEnrich(ctx: McpContext): boolean {
	return hasScope(ctx, 'instruments:enrich') || hasWrite(ctx);
}

function findAliasCandidates(
	instruments: InstrumentRow[],
	code: string
): Array<{ ticker: string; name: string }> {
	const upper = code.toUpperCase();
	return instruments
		.filter((i) => {
			const aliases = (i as InstrumentRow & { aliases?: string[] }).aliases ?? [];
			return i.ticker !== code && aliases.some((a) => a === code || a.toUpperCase() === upper);
		})
		.map((i) => ({ ticker: i.ticker, name: i.name }));
}

export async function upsertInstrumentHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const repo = requireRepo(input.repo);
	if (!hasEnrich(ctx)) {
		throw new McpToolError('FORBIDDEN_SCOPE', [
			issue('R-PERM-04', 'instruments:write or instruments:enrich required', 'tool')
		]);
	}

	const ticker = typeof args.ticker === 'string' ? args.ticker.trim() : '';
	if (!ticker) {
		throw new McpToolError('VALIDATION', [issue('R-VAL-C01', 'ticker is required', 'ticker')]);
	}
	const market = typeof args.market === 'string' ? args.market : undefined;

	// R-VAL-C05 before C01: alias strings often fail KRX digit checks; still return candidates.
	const instruments = unwrapDb(await listInstruments(repo, { includeArchived: true }));
	const aliasHits = findAliasCandidates(instruments as InstrumentRow[], ticker);
	if (aliasHits.length > 0) {
		const err: McpRuleIssue & { candidates: Array<{ ticker: string; name: string }> } = {
			rule: 'R-VAL-C05',
			field: 'ticker',
			message: `alias '${ticker}' is not accepted; use a real ticker`,
			candidates: aliasHits
		};
		throw new McpToolError('VALIDATION', [err]);
	}

	if (market === 'KRX' && !KRX_RE.test(ticker)) {
		throw new McpToolError('VALIDATION', [
			issue('R-VAL-C01', 'KRX ticker must match /^\\d{6}$/', 'ticker')
		]);
	}

	const existing = unwrapDb(await getInstrumentByTicker(repo, ticker));
	const enrichOnly = !hasWrite(ctx);

	if (existing) {
		if (enrichOnly) {
			const patch: Obj = {};
			if (typeof args.name === 'string') patch.name = args.name;
			if (typeof args.sector === 'string' || args.sector === null) patch.sector = args.sector;
			if (
				(market && market !== existing.market) ||
				(typeof args.asset_type === 'string' && args.asset_type !== existing.asset_type) ||
				(typeof args.ticker === 'string' && args.ticker.trim() !== existing.ticker)
			) {
				throw new McpToolError('FORBIDDEN_SCOPE', [
					issue(
						'R-PERM-04',
						'instruments:enrich cannot change ticker/market/asset_type on an existing row',
						'ticker'
					)
				]);
			}
			if (Object.keys(patch).length === 0) {
				return { data: { id: existing.id, created: false } };
			}
			const row = unwrapDb(await updateInstrument(repo, existing.id, patch as never));
			return {
				data: { id: row!.id, created: false },
				affectedIds: [{ table: 'instruments', id: row!.id }]
			};
		}
		const patch: Obj = {};
		for (const k of [
			'name',
			'market',
			'asset_type',
			'sector',
			'is_watchlist',
			'aliases'
		] as const) {
			if (args[k] !== undefined) patch[k] = args[k];
		}
		const row = unwrapDb(await updateInstrument(repo, existing.id, patch as never));
		return {
			data: { id: row!.id, created: false },
			affectedIds: [{ table: 'instruments', id: row!.id }]
		};
	}

	const name = typeof args.name === 'string' ? args.name : '';
	const assetType = args.asset_type;
	if (!name || !(ASSET_TYPES as readonly unknown[]).includes(assetType)) {
		throw new McpToolError('VALIDATION', [
			issue('R-VAL-I01', 'name and asset_type are required to create an instrument', 'name')
		]);
	}
	if (!market) {
		throw new McpToolError('VALIDATION', [issue('R-VAL-I01', 'market is required', 'market')]);
	}
	if (market === 'KRX' && !KRX_RE.test(ticker)) {
		throw new McpToolError('VALIDATION', [
			issue('R-VAL-C01', 'KRX ticker must match /^\\d{6}$/', 'ticker')
		]);
	}
	const created = unwrapDb(
		await createInstrument(repo, {
			ticker,
			name,
			market,
			asset_type: assetType as (typeof ASSET_TYPES)[number],
			...(typeof args.sector === 'string' ? { sector: args.sector } : {}),
			...(typeof args.is_watchlist === 'boolean' ? { is_watchlist: args.is_watchlist } : {})
		} as never)
	);
	return {
		data: { id: created!.id, created: true },
		affectedIds: [{ table: 'instruments', id: created!.id }]
	};
}

export async function recordPriceSnapshotsHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	if (input.ruleIds.includes('R-PERM-03')) {
		// L4: a foreign/forged identity field is an error, not something to drop silently.
		throw new McpToolError('VALIDATION', [
			issue(
				'R-PERM-03',
				'identity fields are server-owned; the owner comes from the key',
				'owner_id'
			)
		]);
	}
	const repo = requireRepo(input.repo);
	const rows = input.args.rows;
	if (!Array.isArray(rows)) {
		throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'rows must be an array', 'rows')]);
	}
	if (rows.length > MAX_SNAPSHOT_BATCH) {
		throw new McpToolError('VALIDATION', [
			issue('R-SYS-01', `batch exceeds ${MAX_SNAPSHOT_BATCH} rows`, 'rows')
		]);
	}
	const validRows: Array<z.infer<typeof priceSnapshotRowSchema>> = [];
	for (let i = 0; i < rows.length; i += 1) {
		const parsed = priceSnapshotRowSchema.safeParse(rows[i]);
		if (!parsed.success) {
			const { field, message } = firstZodIssue(parsed.error, `rows[${i}]`);
			throw new McpToolError('VALIDATION', [issue('R-VAL-I02', message, field)]);
		}
		validRows.push(parsed.data);
	}
	const result = await upsertPriceSnapshots(repo, validRows as never);
	if (result.error) throwMappedDbError(result.error);
	return { data: { inserted: result.inserted, updated: result.updated } };
}

export async function recordPortfolioSnapshotHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	const repo = requireRepo(input.repo);
	const asOf = input.args.as_of;
	if (typeof asOf !== 'string') {
		throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'as_of is required', 'as_of')]);
	}
	const weights =
		input.args.weights === undefined
			? undefined
			: portfolioWeightsSchema.safeParse(input.args.weights);
	if (weights && !weights.success) {
		throw new McpToolError('VALIDATION', [
			issue('R-VAL-M04', weights.error.issues[0]?.message ?? 'invalid weights', 'weights')
		]);
	}
	const plan =
		input.args.plan_distances === undefined
			? undefined
			: portfolioPlanDistancesSchema.safeParse(input.args.plan_distances);
	if (plan && !plan.success) {
		throw new McpToolError('VALIDATION', [
			issue(
				'R-VAL-M04',
				plan.error.issues[0]?.message ?? 'invalid plan_distances',
				'plan_distances'
			)
		]);
	}
	const result = await upsertPortfolioSnapshot(repo, {
		as_of: asOf,
		total_value: (input.args.total_value as number | null | undefined) ?? null,
		currency: (input.args.currency as string | undefined) ?? 'KRW',
		weights: weights?.data,
		plan_distances: plan?.data
	});
	if (result.error) throwMappedDbError(result.error);
	return { data: { id: result.data?.id, as_of: result.data?.as_of } };
}

export async function recordMarketIndicatorsHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	if (input.ruleIds.includes('R-PERM-03')) {
		// L4: a foreign/forged identity field is an error, not something to drop silently.
		throw new McpToolError('VALIDATION', [
			issue(
				'R-PERM-03',
				'identity fields are server-owned; the owner comes from the key',
				'owner_id'
			)
		]);
	}
	const repo = requireRepo(input.repo);
	const rows = input.args.rows;
	if (!Array.isArray(rows)) {
		throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'rows must be an array', 'rows')]);
	}
	if (rows.length > MAX_SNAPSHOT_BATCH) {
		throw new McpToolError('VALIDATION', [
			issue('R-SYS-01', `batch exceeds ${MAX_SNAPSHOT_BATCH} rows`, 'rows')
		]);
	}
	const validRows: Array<z.infer<typeof marketIndicatorRowSchema>> = [];
	for (let i = 0; i < rows.length; i += 1) {
		const r = rows[i];
		const key = (r as Obj)?.key;
		if (typeof key !== 'string' || !REGISTERED_INDICATOR_KEYS.has(key)) {
			throw new McpToolError('VALIDATION', [
				issue('R-VAL-I03', `unregistered indicator key: ${String(key).slice(0, 40)}`, 'key')
			]);
		}
		const parsed = marketIndicatorRowSchema.safeParse(r);
		if (!parsed.success) {
			const { field, message } = firstZodIssue(parsed.error, `rows[${i}]`);
			throw new McpToolError('VALIDATION', [issue('R-VAL-I03', message, field)]);
		}
		const range = INDICATOR_SANITY_RANGE[key];
		if (range && (parsed.data.value < range[0] || parsed.data.value > range[1])) {
			throw new McpToolError('VALIDATION', [
				issue(
					'R-VAL-I03',
					`${key} value ${parsed.data.value} outside sanity range ${range[0]}–${range[1]}`,
					`rows[${i}].value`
				)
			]);
		}
		validRows.push(parsed.data);
	}
	const result = await upsertMarketIndicators(repo, validRows as never);
	if (result.error) throwMappedDbError(result.error);
	return { data: { upserted: result.count } };
}

export async function upsertDecisionHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const repo = requireRepo(input.repo);
	const title = input.args.title;
	if (typeof title !== 'string' || !title.trim()) {
		throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'title is required', 'title')]);
	}
	const row = unwrapDb(
		await createDecision(repo, {
			title: title.trim(),
			context_md: input.args.context_md as string | undefined,
			options: input.args.options as never,
			status: (input.args.status as string | undefined) ?? 'open',
			due_date: input.args.due_date as string | undefined,
			instrument_id: input.args.instrument_id as string | undefined,
			report_id: input.args.report_id as string | undefined,
			client_ref: input.args.client_ref as string | undefined
		} as never)
	);
	return {
		data: { id: row!.id, created: true },
		affectedIds: [{ table: 'decisions', id: row!.id }]
	};
}

export async function archiveDecisionHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const repo = requireRepo(input.repo);
	const id = typeof input.args.id === 'string' ? input.args.id : '';
	if (!id) throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'id is required', 'id')]);
	const existing = unwrapDb(await getDecisionById(repo, id));
	if (!existing) {
		throw new McpToolError('NOT_FOUND', [issue('R-SYS-01', `decision not found: ${id}`, 'id')]);
	}
	if (!existing.archived_at) {
		const r = await archiveDecision(repo, id);
		if (r.error) throwMappedDbError(r.error);
	}
	return { data: { id, archived: true }, affectedIds: [{ table: 'decisions', id }] };
}

export async function upsertEventHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const repo = requireRepo(input.repo);
	const domain = args.domain;
	if (!(EVENT_DOMAINS as readonly unknown[]).includes(domain)) {
		throw new McpToolError('VALIDATION', [
			issue('R-SYS-01', 'domain must be stock|macro|realestate', 'domain')
		]);
	}
	const scope = `events:${domain as string}`;
	if (!hasScope(ctx, scope) && !hasScope(ctx, 'import:all')) {
		throw new McpToolError('FORBIDDEN_SCOPE', [
			issue('R-PERM-04', `Tool requires scope '${scope}'`, 'domain')
		]);
	}
	const event_date = args.event_date;
	const title = args.title;
	const kind = args.kind;
	if (typeof event_date !== 'string' || typeof title !== 'string' || typeof kind !== 'string') {
		throw new McpToolError('VALIDATION', [
			issue('R-SYS-01', 'event_date, title, kind are required', 'event_date')
		]);
	}
	const row = unwrapDb(
		await createEvent(repo, {
			event_date,
			title,
			domain: domain as (typeof EVENT_DOMAINS)[number],
			kind,
			event_time: args.event_time as string | undefined,
			status: (args.status as string | undefined) ?? 'scheduled',
			link: args.link as string | undefined,
			instrument_id: args.instrument_id as string | undefined,
			client_ref: args.client_ref as string | undefined,
			meta: (args.meta as Record<string, unknown> | undefined) ?? {}
		} as never)
	);
	return {
		data: { id: row!.id, created: true },
		affectedIds: [{ table: 'events', id: row!.id }]
	};
}

export async function archiveEventHandler(input: ToolHandlerInput): Promise<ToolHandlerOutcome> {
	const { ctx, args } = input;
	const repo = requireRepo(input.repo);
	const id = typeof args.id === 'string' ? args.id : '';
	if (!id) throw new McpToolError('VALIDATION', [issue('R-SYS-01', 'id is required', 'id')]);
	const existing = unwrapDb(await getEventById(repo, id));
	if (!existing) {
		throw new McpToolError('NOT_FOUND', [issue('R-SYS-01', `event not found: ${id}`, 'id')]);
	}
	const scope = `events:${existing.domain}`;
	if (!hasScope(ctx, scope) && !hasScope(ctx, 'import:all')) {
		throw new McpToolError('FORBIDDEN_SCOPE', [
			issue('R-PERM-04', `Tool requires scope '${scope}'`, 'domain')
		]);
	}
	if (!existing.archived_at) {
		const r = await archiveEvent(repo, id);
		if (r.error) throwMappedDbError(r.error);
	}
	return { data: { id, archived: true }, affectedIds: [{ table: 'events', id }] };
}

export function registerMarketTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(filterToolsByScopes(MARKET_TOOL_NAMES, reg.ctx));

	if (allowed.has('upsert_instrument')) {
		registerAuditedTool(reg, {
			name: 'upsert_instrument',
			title: 'Upsert instrument',
			description:
				'종목을 추가·갱신한다. instruments:write는 전체 필드, enrich는 name/sector·신규 추가만. KRX는 6자리 숫자. 별칭 입력은 거부하고 후보를 돌려준다(R-VAL-C05).',
			inputSchema: {
				ticker: z.string(),
				name: z.string().optional(),
				market: z.string().optional(),
				asset_type: z.enum(ASSET_TYPES).optional(),
				sector: z.string().nullable().optional(),
				is_watchlist: z.boolean().optional(),
				aliases: z.array(z.string()).optional()
			},
			annotations: { idempotentHint: true },
			handler: upsertInstrumentHandler
		});
	}

	if (allowed.has('record_price_snapshots')) {
		registerAuditedTool(reg, {
			name: 'record_price_snapshots',
			title: 'Record price snapshots',
			description: `시세 스냅샷 배치(≤${MAX_SNAPSHOT_BATCH}). 행 필드 허용 목록만(instrument_id UUID·as_of ISO 실제 날짜·close>0·currency KRW|USD·change_pct·volume·foreign_net_buy·inst_net_buy·source·extra ≤4KB). id·owner_id·source_bot_id·created_at·모르는 키는 거부, source 'fm:daily-feed'는 피드 전용(R-VAL-I02).`,
			inputSchema: { rows: z.array(z.record(z.string(), z.unknown())) },
			handler: recordPriceSnapshotsHandler
		});
	}

	if (allowed.has('record_portfolio_snapshot')) {
		registerAuditedTool(reg, {
			name: 'record_portfolio_snapshot',
			title: 'Record portfolio snapshot',
			description: '포트폴리오 스냅샷(weights/plan_distances = G-9 zod).',
			inputSchema: {
				as_of: z.string(),
				total_value: z.number().nullable().optional(),
				currency: z.enum(['KRW', 'USD']).optional(),
				weights: z.record(z.string(), z.unknown()).optional(),
				plan_distances: z.record(z.string(), z.unknown()).optional()
			},
			handler: recordPortfolioSnapshotHandler
		});
	}

	if (allowed.has('record_market_indicators')) {
		registerAuditedTool(reg, {
			name: 'record_market_indicators',
			title: 'Record market indicators',
			description: `시장 지표 배치(≤${MAX_SNAPSHOT_BATCH}). 등록 키만, 필드 허용 목록(key·as_of ISO·value·change·change_pct·source)과 키별 기본 범위(R-VAL-I03). source 'fm:daily-feed'는 피드 전용.`,
			inputSchema: { rows: z.array(z.record(z.string(), z.unknown())) },
			handler: recordMarketIndicatorsHandler
		});
	}

	if (allowed.has('upsert_decision')) {
		registerAuditedTool(reg, {
			name: 'upsert_decision',
			title: 'Upsert decision',
			description: '결정 대기 항목을 추가한다(client_ref 멱등).',
			inputSchema: {
				title: z.string(),
				context_md: z.string().optional(),
				options: z.unknown().optional(),
				status: z.enum(['open', 'decided', 'dropped']).optional(),
				due_date: z.string().optional(),
				instrument_id: z.string().optional(),
				report_id: z.string().optional(),
				client_ref: z.string().optional()
			},
			handler: upsertDecisionHandler
		});
	}

	if (allowed.has('archive_decision')) {
		registerAuditedTool(reg, {
			name: 'archive_decision',
			title: 'Archive decision',
			description: '결정 대기 항목을 보관한다.',
			inputSchema: { id: z.string() },
			handler: archiveDecisionHandler
		});
	}

	if (allowed.has('upsert_event')) {
		registerAuditedTool(reg, {
			name: 'upsert_event',
			title: 'Upsert event',
			description: '일정을 추가한다. domain은 events:* 스코프와 일치해야 한다.',
			inputSchema: {
				event_date: z.string(),
				title: z.string(),
				domain: z.enum(EVENT_DOMAINS),
				kind: z.string(),
				event_time: z.string().optional(),
				status: z.enum(['scheduled', 'tentative', 'done', 'cancelled']).optional(),
				link: z.string().optional(),
				instrument_id: z.string().optional(),
				client_ref: z.string().optional(),
				meta: z.record(z.string(), z.unknown()).optional()
			},
			handler: upsertEventHandler
		});
	}

	if (allowed.has('archive_event')) {
		registerAuditedTool(reg, {
			name: 'archive_event',
			title: 'Archive event',
			description: '일정을 보관한다(domain 스코프 필요).',
			inputSchema: { id: z.string() },
			handler: archiveEventHandler
		});
	}
}
