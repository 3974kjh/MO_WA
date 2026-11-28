/**
 * Daily market feed — `submit_daily_market_feed` (scope `market:feed` only).
 * Spec: price-autoload-work/mcp-feed-design.md §2 (gates) / §3-3.
 *
 * Every gate is server-side. Any rejected row ⇒ the call writes nothing (dry_run returns the
 * full report, live throws VALIDATION with one issue per rejected row). Owner always comes from
 * the authenticated key's repo; instrument_id / currency / source / extra are server-decided.
 * No delete path exists (and the DB trigger blocks bot DELETE).
 */
import { z } from 'zod';
import {
	insertFeedPriceRows,
	listFeedIndicatorWindow,
	listFeedPriceWindow,
	listInstruments,
	updateFeedPriceRow,
	upsertMarketIndicators,
	type FeedIndicatorRow,
	type FeedPriceInsert,
	type FeedPricePatch,
	type FeedPriceRow,
	type RepoClient
} from '$lib/server/repo';
import type { InstrumentRow } from '$lib/types/mowa.contract';
import { McpToolError } from '../errors';
import {
	addDays,
	CALENDAR_EXPIRY_WARN_DAYS,
	daysUntilCalendarEnd,
	isInCalendarRange,
	isRealIsoDate,
	isTradingDay,
	isWeekend,
	kstDate,
	previousTradingDay,
	type MarketCalendarId
} from '../marketCalendar';
import { filterToolsByScopes } from '../scopes';
import type { McpAffectedId, McpRuleIssue } from '../types';
import { throwMappedDbError, unwrapDb } from './db-error';
import {
	registerAuditedTool,
	type ToolHandlerInput,
	type ToolHandlerOutcome,
	type ToolRegistrationContext
} from './register';

/* ----------------------------------------------------------------------------------------- */
/* Constants (design decisions — change only with PM/user sign-off)                          */
/* ----------------------------------------------------------------------------------------- */

export const FEED_TOOL_NAME = 'submit_daily_market_feed';
/** Fixed source for every row the feed writes (user decision, design §2-3). */
export const FEED_SOURCE = 'fm:daily-feed';
/** Backfill rows the feed may also overwrite (design §2-2 덮어쓰기 범위). */
export const BACKFILL_SOURCE = 'notion:daily-brief';
const OVERWRITABLE_SOURCES = new Set<string>([FEED_SOURCE, BACKFILL_SOURCE]);

/** Feed allow-list (design §2-2 종목, initial 8). */
export const FEED_TICKERS = Object.freeze([
	'035420',
	'030200',
	'108490',
	'005380',
	'000660',
	'GOOGL',
	'QBTS',
	'SGOV'
] as const);
/** Investor-flow tickers (KRX five; units = shares). */
export const FLOW_TICKERS = Object.freeze([
	'035420',
	'030200',
	'108490',
	'005380',
	'000660'
] as const);
export const FEED_INDICATOR_KEYS = ['kospi', 'kosdaq', 'usdkrw', 'ust10y', 'vix'] as const;
type IndicatorKey = (typeof FEED_INDICATOR_KEYS)[number];

const MAX_MISSING_TICKERS = 1;
const JUMP_LIMIT: Readonly<Record<'KRX' | 'NYSE', number>> = { KRX: 0.3, NYSE: 0.5 };
const CHANGE_PCT_TOLERANCE = 0.3;
const EPS = 1e-9;
/** Lookback for previous closes / existing rows. */
const WINDOW_DAYS = 45;

type IndicatorRule = {
	cal: MarketCalendarId;
	min: number;
	max: number;
	/** kind of day-over-day limit */
	delta: { kind: 'pct'; limit: number } | { kind: 'abs'; limit: number };
	/** delta breach = warning + skip this row instead of rejection */
	deltaSoft?: boolean;
	crossCheck?: boolean;
};

const INDICATOR_RULES: Readonly<Record<IndicatorKey, IndicatorRule>> = {
	kospi: {
		cal: 'KRX',
		min: 1000,
		max: 20000,
		delta: { kind: 'pct', limit: 0.12 },
		crossCheck: true
	},
	kosdaq: {
		cal: 'KRX',
		min: 200,
		max: 3000,
		delta: { kind: 'pct', limit: 0.12 },
		crossCheck: true
	},
	usdkrw: { cal: 'KRX', min: 1200, max: 1500, delta: { kind: 'abs', limit: 25 } },
	ust10y: { cal: 'SIFMA', min: 0.5, max: 15, delta: { kind: 'abs', limit: 0.5 } },
	vix: { cal: 'NYSE', min: 5, max: 100, delta: { kind: 'pct', limit: 0.6 }, deltaSoft: true }
};

/** Rule ids (R-FEED-*) — referenced by tests and docs. */
export const FEED_RULES = {
	schema: 'R-FEED-01',
	date: 'R-FEED-02',
	asOf: 'R-FEED-03',
	calendar: 'R-FEED-04',
	ticker: 'R-FEED-05',
	coverage: 'R-FEED-06',
	jump: 'R-FEED-07',
	crossCheck: 'R-FEED-08',
	repeat: 'R-FEED-09',
	indicator: 'R-FEED-10',
	flows: 'R-FEED-11',
	overwrite: 'R-FEED-12',
	correction: 'R-FEED-13',
	feedId: 'R-FEED-14',
	warnCalendarExpiry: 'R-FEED-20',
	warnNoPrev: 'R-FEED-21',
	warnGap: 'R-FEED-22',
	warnVixSkip: 'R-FEED-23',
	warnDryRunOutOfRange: 'R-FEED-24',
	auditSummary: 'R-FEED-30'
} as const;

/* ----------------------------------------------------------------------------------------- */
/* Input schema (zod strict — unknown keys rejected at every level)                          */
/* ----------------------------------------------------------------------------------------- */

function maxDecimals(places: number) {
	const f = 10 ** places;
	return (n: number) =>
		Number.isFinite(n) && Math.abs(Math.round(n * f) / f - n) <= EPS * Math.max(1, Math.abs(n));
}

const isoDate = z
	.string()
	.max(10)
	.refine((v) => isRealIsoDate(v), { message: 'must be a real ISO date YYYY-MM-DD' });
const tickerStr = z
	.string()
	.min(1)
	.max(12)
	.regex(/^[A-Z0-9]{1,12}$/, 'ticker must be A-Z/0-9 only');
const closeNum = z
	.number()
	.finite()
	.positive()
	.max(1e12)
	.refine(maxDecimals(6), { message: 'at most 6 decimal places' });
const changePct = z
	.number()
	.finite()
	.min(-35)
	.max(35)
	.refine(maxDecimals(3), { message: 'change_pct: at most 3 decimal places' });
const sharesInt = z.number().int().min(-1e9).max(1e9);

export const feedPriceItemSchema = z.strictObject({
	ticker: tickerStr,
	as_of: isoDate,
	close: closeNum,
	change_pct: changePct
});

export const feedIndicatorItemSchema = z.strictObject({
	key: z.enum(FEED_INDICATOR_KEYS),
	as_of: isoDate,
	value: z
		.number()
		.finite()
		.min(-1e6)
		.max(1e6)
		.refine(maxDecimals(6), { message: 'at most 6 decimal places' }),
	change_pct: changePct.optional(),
	basis: z.literal('seoul_1530').optional()
});

export const feedFlowItemSchema = z.strictObject({
	ticker: tickerStr,
	base_date: isoDate,
	foreign_shares: sharesInt,
	inst_shares: sharesInt,
	status: z.enum(['confirmed', 'provisional']),
	src: z
		.string()
		.min(1)
		.max(32)
		.regex(/^[A-Za-z0-9_.:-]+$/, 'src: letters, digits, _ . : - only')
});

export const feedInputShape = {
	feed_date: isoDate,
	feed_id: z
		.string()
		.max(16)
		.regex(/^fm-\d{8}-[1-9]$/, 'feed_id must match fm-YYYYMMDD-N (N 1-9)'),
	dry_run: z.boolean(),
	prices: z.array(feedPriceItemSchema).max(20).optional(),
	indicators: z.array(feedIndicatorItemSchema).max(10).optional(),
	flows: z.array(feedFlowItemSchema).max(20).optional(),
	corrections: z
		.array(z.union([feedPriceItemSchema, feedIndicatorItemSchema]))
		.max(20)
		.optional()
};

export const feedInputSchema = z.strictObject(feedInputShape);
export type FeedInput = z.infer<typeof feedInputSchema>;
type PriceItem = z.infer<typeof feedPriceItemSchema>;
type IndicatorItem = z.infer<typeof feedIndicatorItemSchema>;
type FlowItem = z.infer<typeof feedFlowItemSchema>;

/* ----------------------------------------------------------------------------------------- */
/* Plan types                                                                                */
/* ----------------------------------------------------------------------------------------- */

export type FeedRejection = { row: string; rule: string; message: string };

type PriceValues = {
	close: number;
	change_pct: number | null;
	currency: string;
	source: string | null;
};

type PriceOp = {
	kind: 'insert' | 'update';
	key: string;
	field: string;
	instrumentId: string;
	ticker: string;
	asOf: string;
	existing: FeedPriceRow | null;
	price?: { close: number; change_pct: number; currency: 'KRW' | 'USD'; correction: boolean };
	flow?: { foreign: number; inst: number; status: string; src: string };
	marker?: boolean;
	/** price values already equal (counted in `unchanged` unless something else is written) */
	noop?: boolean;
};

type IndicatorOp = {
	kind: 'insert' | 'update';
	field: string;
	key: IndicatorKey;
	asOf: string;
	value: number;
	change_pct: number | null;
	before: FeedIndicatorRow | null;
	correction: boolean;
};

export type FeedPlan = {
	rejected: FeedRejection[];
	warnings: McpRuleIssue[];
	priceOps: PriceOp[];
	indicatorOps: IndicatorOp[];
	unchanged: number;
	skipped: string[];
	correctionsApplied: boolean;
};

export type FeedState = {
	now: number;
	instruments: InstrumentRow[];
	priceRows: FeedPriceRow[];
	indicatorRows: FeedIndicatorRow[];
};

/* ----------------------------------------------------------------------------------------- */
/* Helpers                                                                                   */
/* ----------------------------------------------------------------------------------------- */

function sideOfMarket(market: string): 'KRX' | 'NYSE' | null {
	if (market === 'KRX') return 'KRX';
	if (['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX'].includes(market)) return 'NYSE';
	return null;
}

function sideOfTicker(ticker: string): 'KRX' | 'NYSE' {
	return /^\d{6}$/.test(ticker) ? 'KRX' : 'NYSE';
}

function near(a: number | null | undefined, b: number | null | undefined, eps = 1e-6): boolean {
	if (a === null || a === undefined || b === null || b === undefined) return a == b;
	return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

function fmt(n: number, digits = 4): string {
	return Number.isFinite(n) ? String(Number(n.toFixed(digits))) : String(n);
}

type CorrectionMarker = { feed_date: string; feed_id: string };

function markersOf(extra: Record<string, unknown>): CorrectionMarker[] {
	const raw = extra.feed_corrections;
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(m): m is CorrectionMarker =>
			!!m &&
			typeof m === 'object' &&
			typeof (m as CorrectionMarker).feed_date === 'string' &&
			typeof (m as CorrectionMarker).feed_id === 'string'
	);
}

type StoredFlow = { status?: string; feed_date?: string; feed_id?: string };

function flowsOf(extra: Record<string, unknown>): StoredFlow | null {
	const f = extra.flows;
	return f && typeof f === 'object' && !Array.isArray(f) ? (f as StoredFlow) : null;
}

/** Expected as_of for a market calendar on this feed_date (design §2-2 기대 as_of). */
function expectedAsOf(cal: MarketCalendarId, feedDate: string): string | null {
	if (cal === 'KRX') {
		return isInCalendarRange(feedDate) && isTradingDay('KRX', feedDate) ? feedDate : null;
	}
	return previousTradingDay(cal, feedDate);
}

/** Correction target: the trading day immediately before the normal expected as_of. */
function correctionAsOf(cal: MarketCalendarId, feedDate: string): string | null {
	if (cal === 'KRX') return previousTradingDay('KRX', feedDate);
	const base = previousTradingDay(cal, feedDate);
	return base ? previousTradingDay(cal, base) : null;
}

/* ----------------------------------------------------------------------------------------- */
/* Gate evaluation (pure — unit-testable without a database)                                 */
/* ----------------------------------------------------------------------------------------- */

export function planFeed(input: FeedInput, state: FeedState): FeedPlan {
	const rejected: FeedRejection[] = [];
	const warnings: McpRuleIssue[] = [];
	const skipped: string[] = [];
	const reject = (row: string, rule: string, message: string) =>
		rejected.push({ row, rule, message });
	const warn = (rule: string, message: string, field?: string) =>
		warnings.push({ rule, message, ...(field ? { field } : {}) });

	const { feed_date: feedDate, feed_id: feedId, dry_run: dryRun } = input;
	const prices = input.prices ?? [];
	const indicators = input.indicators ?? [];
	const flows = input.flows ?? [];
	const corrections = input.corrections ?? [];

	// --- feed-level date gates -------------------------------------------------------------
	const today = kstDate(state.now);
	const yesterday = addDays(today, -1);
	if (feedDate !== today && feedDate !== yesterday) {
		reject(
			'feed_date',
			FEED_RULES.date,
			`feed_date must be today (${today}) or yesterday (${yesterday}) in KST`
		);
	}
	if (isWeekend(feedDate)) reject('feed_date', FEED_RULES.date, 'feed_date falls on a weekend');
	if (feedId.slice(3, 11) !== feedDate.replaceAll('-', '')) {
		reject('feed_id', FEED_RULES.date, 'feed_id date must equal feed_date');
	}
	const inRange =
		isInCalendarRange(feedDate) &&
		previousTradingDay('NYSE', feedDate) !== null &&
		correctionAsOf('NYSE', feedDate) !== null;
	if (!inRange) {
		if (dryRun) {
			warn(
				FEED_RULES.warnDryRunOutOfRange,
				'feed_date is outside the server holiday calendar; dry_run only'
			);
		} else {
			reject(
				'feed_date',
				FEED_RULES.calendar,
				'feed_date is outside the server holiday calendar; live writes refused'
			);
		}
	} else if (daysUntilCalendarEnd(feedDate) <= CALENDAR_EXPIRY_WARN_DAYS) {
		warn(
			FEED_RULES.warnCalendarExpiry,
			`server holiday calendar ends in ${daysUntilCalendarEnd(feedDate)} days; ask develop to extend it`
		);
	}

	// --- reference data ----------------------------------------------------------------------
	const instByTicker = new Map<string, InstrumentRow>();
	for (const i of state.instruments) {
		if (!i.archived_at) instByTicker.set(i.ticker, i);
	}
	const rowsByInst = new Map<string, FeedPriceRow[]>();
	for (const r of state.priceRows) {
		const list = rowsByInst.get(r.instrument_id) ?? [];
		list.push(r);
		rowsByInst.set(r.instrument_id, list);
	}
	for (const list of rowsByInst.values()) list.sort((a, b) => a.as_of.localeCompare(b.as_of));
	const indRowsByKey = new Map<string, FeedIndicatorRow[]>();
	for (const r of state.indicatorRows) {
		const list = indRowsByKey.get(r.key) ?? [];
		list.push(r);
		indRowsByKey.set(r.key, list);
	}
	for (const list of indRowsByKey.values()) list.sort((a, b) => a.as_of.localeCompare(b.as_of));

	const priceAt = (instId: string, asOf: string) =>
		(rowsByInst.get(instId) ?? []).find((r) => r.as_of === asOf) ?? null;
	const priceBefore = (instId: string, asOf: string) => {
		const list = (rowsByInst.get(instId) ?? []).filter((r) => r.as_of < asOf);
		return list.length ? list[list.length - 1]! : null;
	};
	const indAt = (key: string, asOf: string) =>
		(indRowsByKey.get(key) ?? []).find((r) => r.as_of === asOf) ?? null;
	const indBefore = (key: string, asOf: string) => {
		const list = (indRowsByKey.get(key) ?? []).filter((r) => r.as_of < asOf);
		return list.length ? list[list.length - 1]! : null;
	};

	// Corrections already applied for this feed_date by another feed_id (once per feed_date).
	const priorCorrection = state.priceRows
		.flatMap((r) => markersOf(r.extra))
		.find((m) => m.feed_date === feedDate && m.feed_id !== feedId);

	const priceOps = new Map<string, PriceOp>();
	const indicatorOps: IndicatorOp[] = [];
	let unchanged = 0;

	// --- prices (normal + corrections) -------------------------------------------------------
	const seenPrice = new Set<string>();
	const evalPrice = (item: PriceItem, field: string, correction: boolean) => {
		const dupKey = `${item.ticker}|${item.as_of}`;
		if (seenPrice.has(dupKey)) {
			reject(field, FEED_RULES.schema, `duplicate row for ${item.ticker} ${item.as_of}`);
			return;
		}
		seenPrice.add(dupKey);
		if (!(FEED_TICKERS as readonly string[]).includes(item.ticker)) {
			reject(field, FEED_RULES.ticker, `ticker ${item.ticker} is not in the feed allow-list`);
			return;
		}
		const inst = instByTicker.get(item.ticker);
		if (!inst || (inst.asset_type !== 'stock' && inst.asset_type !== 'etf')) {
			reject(
				field,
				FEED_RULES.ticker,
				`ticker ${item.ticker} is not an active stock/etf instrument of this owner`
			);
			return;
		}
		const side = sideOfMarket(inst.market);
		if (!side) {
			reject(field, FEED_RULES.ticker, `ticker ${item.ticker} market ${inst.market} is not fed`);
			return;
		}
		if (!isTradingDay(side, item.as_of)) {
			reject(field, FEED_RULES.asOf, `${side} is closed on ${item.as_of}`);
			return;
		}
		const expected = correction ? correctionAsOf(side, feedDate) : expectedAsOf(side, feedDate);
		if (expected === null) {
			reject(
				field,
				correction ? FEED_RULES.correction : FEED_RULES.asOf,
				correction
					? 'no previous trading day in calendar range'
					: `${side} has no trading session for feed_date ${feedDate}`
			);
			return;
		}
		if (item.as_of !== expected) {
			if (correction) {
				reject(
					field,
					FEED_RULES.correction,
					`corrections may only target the previous trading day ${expected}`
				);
			} else {
				reject(
					field,
					FEED_RULES.asOf,
					`as_of must be ${expected} for ${side} on feed_date ${feedDate} (older rows only via corrections, previous trading day only)`
				);
			}
			return;
		}
		const existing = priceAt(inst.id, item.as_of);
		if (correction) {
			if (!existing) {
				reject(
					field,
					FEED_RULES.correction,
					`no existing row to correct for ${item.ticker} ${item.as_of}`
				);
				return;
			}
			const alreadyEqual =
				near(existing.close, item.close) &&
				near(existing.change_pct, item.change_pct, 1e-9) &&
				existing.currency === (side === 'KRX' ? 'KRW' : 'USD');
			if (alreadyEqual) {
				// Re-sent correction that is already in place: no-op, not a second correction.
				unchanged += 1;
				return;
			}
			if (priorCorrection) {
				reject(
					field,
					FEED_RULES.correction,
					`corrections for feed_date ${feedDate} were already applied by ${priorCorrection.feed_id}`
				);
				return;
			}
		}
		if (existing && !OVERWRITABLE_SOURCES.has(existing.source ?? '')) {
			reject(
				field,
				FEED_RULES.overwrite,
				`existing row source '${existing.source ?? 'manual'}' may not be overwritten by the feed`
			);
			return;
		}
		const prev = priceBefore(inst.id, item.as_of);
		const prevTd = previousTradingDay(side, item.as_of);
		if (!prev) {
			warn(
				FEED_RULES.warnNoPrev,
				`${item.ticker}: no previous close; jump/change_pct checks skipped`,
				field
			);
		} else {
			const ratio = item.close / prev.close - 1;
			if (Math.abs(ratio) > JUMP_LIMIT[side] + EPS) {
				reject(
					field,
					FEED_RULES.jump,
					`${item.ticker}: close ${item.close} moves ${fmt(ratio * 100, 2)}% vs previous close ${prev.close} (${prev.as_of}); limit ±${JUMP_LIMIT[side] * 100}%`
				);
				return;
			}
			if (prev.as_of === prevTd) {
				const computed = ratio * 100;
				if (Math.abs(computed - item.change_pct) > CHANGE_PCT_TOLERANCE + EPS) {
					reject(
						field,
						FEED_RULES.crossCheck,
						`${item.ticker}: change_pct ${item.change_pct} differs from computed ${fmt(computed, 3)} by more than ${CHANGE_PCT_TOLERANCE}%p`
					);
					return;
				}
				if (side === 'KRX' && near(item.close, prev.close) && item.change_pct !== 0) {
					reject(
						field,
						FEED_RULES.repeat,
						`${item.ticker}: close equals previous close but change_pct is ${item.change_pct} (holiday repeat?)`
					);
					return;
				}
			} else {
				warn(
					FEED_RULES.warnGap,
					`${item.ticker}: previous close is from ${prev.as_of} (gap); change_pct cross-check skipped`,
					field
				);
			}
		}
		const currency: 'KRW' | 'USD' = side === 'KRX' ? 'KRW' : 'USD';
		if (existing) {
			const same =
				near(existing.close, item.close) &&
				near(existing.change_pct, item.change_pct, 1e-9) &&
				existing.currency === currency;
			if (!same && existing.source === FEED_SOURCE && existing.extra.feed_id === feedId) {
				reject(
					field,
					FEED_RULES.feedId,
					`${feedId} already wrote different values for ${item.ticker} ${item.as_of}; use a new feed_id`
				);
				return;
			}
			if (same) {
				unchanged += 1;
				if (!correction) {
					priceOps.set(`${inst.id}|${item.as_of}`, {
						kind: 'update',
						key: `${item.ticker}|${item.as_of}`,
						field,
						instrumentId: inst.id,
						ticker: item.ticker,
						asOf: item.as_of,
						existing,
						noop: true
					});
				}
				return;
			}
		}
		priceOps.set(`${inst.id}|${item.as_of}`, {
			kind: existing ? 'update' : 'insert',
			key: `${item.ticker}|${item.as_of}`,
			field,
			instrumentId: inst.id,
			ticker: item.ticker,
			asOf: item.as_of,
			existing,
			price: { close: item.close, change_pct: item.change_pct, currency, correction }
		});
	};

	prices.forEach((p, i) => evalPrice(p, `prices[${i}]`, false));

	// --- coverage ------------------------------------------------------------------------------
	const krxOpen = expectedAsOf('KRX', feedDate) !== null;
	const usOpen = expectedAsOf('NYSE', feedDate) !== null;
	const expectedTickers = FEED_TICKERS.filter((t) => {
		const inst = instByTicker.get(t);
		const side = inst ? (sideOfMarket(inst.market) ?? sideOfTicker(t)) : sideOfTicker(t);
		return side === 'KRX' ? krxOpen : usOpen;
	});
	const present = new Set(prices.map((p) => p.ticker));
	const missing = expectedTickers.filter((t) => !present.has(t));
	if (expectedTickers.length > 0 && missing.length > MAX_MISSING_TICKERS) {
		reject(
			'prices',
			FEED_RULES.coverage,
			`coverage: ${expectedTickers.length - missing.length}/${expectedTickers.length} expected tickers; missing ${missing.join(', ')} (at most ${MAX_MISSING_TICKERS} may be missing)`
		);
	}

	// --- indicators (normal + corrections) -----------------------------------------------------
	const seenInd = new Set<string>();
	const evalIndicator = (item: IndicatorItem, field: string, correction: boolean) => {
		const dupKey = `${item.key}|${item.as_of}`;
		if (seenInd.has(dupKey)) {
			reject(field, FEED_RULES.schema, `duplicate row for ${item.key} ${item.as_of}`);
			return;
		}
		seenInd.add(dupKey);
		const rule = INDICATOR_RULES[item.key];
		if (item.key === 'usdkrw' && item.basis !== 'seoul_1530') {
			reject(
				field,
				FEED_RULES.indicator,
				'usdkrw requires basis "seoul_1530" (Seoul 15:30 close only)'
			);
			return;
		}
		if (item.key !== 'usdkrw' && item.basis !== undefined) {
			reject(field, FEED_RULES.indicator, `basis is only accepted for usdkrw`);
			return;
		}
		if (!isTradingDay(rule.cal, item.as_of)) {
			reject(field, FEED_RULES.asOf, `${rule.cal} is closed on ${item.as_of}`);
			return;
		}
		const expected = correction
			? correctionAsOf(rule.cal, feedDate)
			: expectedAsOf(rule.cal, feedDate);
		if (expected === null || item.as_of !== expected) {
			reject(
				field,
				correction ? FEED_RULES.correction : FEED_RULES.asOf,
				expected === null
					? `${item.key}: no ${correction ? 'previous ' : ''}session for feed_date ${feedDate}`
					: correction
						? `corrections may only target the previous trading day ${expected}`
						: `${item.key}: as_of must be ${expected} on feed_date ${feedDate}`
			);
			return;
		}
		if (item.value < rule.min || item.value > rule.max) {
			reject(
				field,
				FEED_RULES.indicator,
				`${item.key} ${item.value} outside ${rule.min}–${rule.max}`
			);
			return;
		}
		const existing = indAt(item.key, item.as_of);
		if (correction) {
			if (!existing) {
				reject(
					field,
					FEED_RULES.correction,
					`no existing row to correct for ${item.key} ${item.as_of}`
				);
				return;
			}
			if (
				near(existing.value, item.value) &&
				(item.change_pct === undefined || near(existing.change_pct, item.change_pct, 1e-9))
			) {
				unchanged += 1;
				return;
			}
			if (priorCorrection) {
				reject(
					field,
					FEED_RULES.correction,
					`corrections for feed_date ${feedDate} were already applied by ${priorCorrection.feed_id}`
				);
				return;
			}
		}
		if (existing && !OVERWRITABLE_SOURCES.has(existing.source ?? '')) {
			reject(
				field,
				FEED_RULES.overwrite,
				`existing ${item.key} row source '${existing.source ?? 'manual'}' may not be overwritten by the feed`
			);
			return;
		}
		const prev = indBefore(item.key, item.as_of);
		if (!prev) {
			warn(
				FEED_RULES.warnNoPrev,
				`${item.key}: no previous value; day-over-day check skipped`,
				field
			);
		} else {
			const breach =
				rule.delta.kind === 'abs'
					? Math.abs(item.value - prev.value) > rule.delta.limit + EPS
					: Math.abs(item.value / prev.value - 1) > rule.delta.limit + EPS;
			if (breach) {
				const msg =
					rule.delta.kind === 'abs'
						? `${item.key} ${item.value} moves ${fmt(item.value - prev.value)} vs previous ${prev.value} (${prev.as_of}); limit ±${rule.delta.limit}`
						: `${item.key} ${item.value} moves ${fmt((item.value / prev.value - 1) * 100, 2)}% vs previous ${prev.value} (${prev.as_of}); limit ±${rule.delta.limit * 100}%`;
				if (rule.deltaSoft) {
					warn(FEED_RULES.warnVixSkip, `${msg} — row skipped`, field);
					skipped.push(field);
					return;
				}
				reject(field, FEED_RULES.indicator, msg);
				return;
			}
			if (
				rule.crossCheck &&
				item.change_pct !== undefined &&
				prev.as_of === previousTradingDay(rule.cal, item.as_of)
			) {
				const computed = (item.value / prev.value - 1) * 100;
				if (Math.abs(computed - item.change_pct) > CHANGE_PCT_TOLERANCE + EPS) {
					reject(
						field,
						FEED_RULES.crossCheck,
						`${item.key}: change_pct ${item.change_pct} differs from computed ${fmt(computed, 3)} by more than ${CHANGE_PCT_TOLERANCE}%p`
					);
					return;
				}
			}
		}
		const changePctVal = item.change_pct ?? null;
		if (
			existing &&
			near(existing.value, item.value) &&
			(changePctVal === null || near(existing.change_pct, changePctVal, 1e-9))
		) {
			unchanged += 1;
			return;
		}
		indicatorOps.push({
			kind: existing ? 'update' : 'insert',
			field,
			key: item.key,
			asOf: item.as_of,
			value: item.value,
			change_pct: changePctVal,
			before: existing,
			correction
		});
	};
	indicators.forEach((it, i) => evalIndicator(it, `indicators[${i}]`, false));

	corrections.forEach((c, i) => {
		const field = `corrections[${i}]`;
		if ('ticker' in c) evalPrice(c, field, true);
		else evalIndicator(c, field, true);
	});

	// --- flows --------------------------------------------------------------------------------
	const seenFlow = new Set<string>();
	const krxToday = expectedAsOf('KRX', feedDate);
	const krxPrev = previousTradingDay('KRX', feedDate);
	flows.forEach((f: FlowItem, i) => {
		const field = `flows[${i}]`;
		const dupKey = `${f.ticker}|${f.base_date}`;
		if (seenFlow.has(dupKey)) {
			reject(field, FEED_RULES.schema, `duplicate flow row for ${f.ticker} ${f.base_date}`);
			return;
		}
		seenFlow.add(dupKey);
		if (!(FLOW_TICKERS as readonly string[]).includes(f.ticker)) {
			reject(field, FEED_RULES.flows, `flows accepted only for ${FLOW_TICKERS.join(', ')}`);
			return;
		}
		const inst = instByTicker.get(f.ticker);
		if (!inst || inst.market !== 'KRX') {
			reject(
				field,
				FEED_RULES.ticker,
				`ticker ${f.ticker} is not an active KRX instrument of this owner`
			);
			return;
		}
		if (f.base_date !== krxToday && f.base_date !== krxPrev) {
			reject(
				field,
				FEED_RULES.flows,
				`base_date must be a KRX trading day: ${[krxPrev, krxToday].filter(Boolean).join(' or ')}`
			);
			return;
		}
		const opKey = `${inst.id}|${f.base_date}`;
		const pending = priceOps.get(opKey);
		const existing = priceAt(inst.id, f.base_date);
		if (!existing && !(pending && pending.kind === 'insert')) {
			reject(
				field,
				FEED_RULES.flows,
				`no price row for ${f.ticker} ${f.base_date}; flows only update an existing price row`
			);
			return;
		}
		if (existing && !OVERWRITABLE_SOURCES.has(existing.source ?? '')) {
			reject(
				field,
				FEED_RULES.overwrite,
				`existing row source '${existing.source ?? 'manual'}' may not be overwritten by the feed`
			);
			return;
		}
		const prevFlow = existing ? flowsOf(existing.extra) : null;
		if (existing && prevFlow) {
			const sameValues =
				near(existing.foreign_net_buy, f.foreign_shares) &&
				near(existing.inst_net_buy, f.inst_shares);
			if (!(sameValues && prevFlow.status === f.status) && prevFlow.feed_id === feedId) {
				reject(
					field,
					FEED_RULES.feedId,
					`${feedId} already wrote different flows for ${f.ticker} ${f.base_date}; use a new feed_id`
				);
				return;
			}
			if (prevFlow.status === 'confirmed' && f.status === 'provisional') {
				reject(
					field,
					FEED_RULES.flows,
					`${f.ticker} ${f.base_date} is already confirmed; provisional cannot replace it`
				);
				return;
			}
			if (sameValues && prevFlow.status === f.status) {
				unchanged += 1;
				return;
			}
			if (prevFlow.status === 'confirmed' && prevFlow.feed_date !== feedDate) {
				reject(
					field,
					FEED_RULES.flows,
					`${f.ticker} ${f.base_date} confirmed flows are locked (set on ${prevFlow.feed_date ?? 'unknown'})`
				);
				return;
			}
		}
		const flow = { foreign: f.foreign_shares, inst: f.inst_shares, status: f.status, src: f.src };
		if (pending) {
			pending.flow = flow;
			return;
		}
		priceOps.set(opKey, {
			kind: 'update',
			key: `${f.ticker}|${f.base_date}`,
			field,
			instrumentId: inst.id,
			ticker: f.ticker,
			asOf: f.base_date,
			existing,
			flow
		});
	});

	// --- correction marker (once per feed_date, survives later rewrites) ----------------------
	const correctionsApplied =
		[...priceOps.values()].some((op) => op.price?.correction) ||
		indicatorOps.some((op) => op.correction);
	if (correctionsApplied) {
		for (const op of priceOps.values()) {
			if (op.price?.correction) continue;
			const has = op.existing
				? markersOf(op.existing.extra).some((m) => m.feed_date === feedDate)
				: false;
			if (!has) op.marker = true;
		}
	}

	// Drop pure "touch" ops that change nothing; a no-op row that now carries flows or the
	// marker is written, so it no longer counts as unchanged.
	const finalPriceOps = [...priceOps.values()].filter((op) => op.price || op.flow || op.marker);
	unchanged -= finalPriceOps.filter((op) => op.noop).length;

	return {
		rejected,
		warnings,
		priceOps: finalPriceOps,
		indicatorOps,
		unchanged,
		skipped,
		correctionsApplied
	};
}

/* ----------------------------------------------------------------------------------------- */
/* Write payloads                                                                            */
/* ----------------------------------------------------------------------------------------- */

function pickValues(row: FeedPriceRow | null): PriceValues | null {
	if (!row) return null;
	return {
		close: row.close,
		change_pct: row.change_pct,
		currency: row.currency,
		source: row.source
	};
}

function buildExtra(op: PriceOp, feedDate: string, feedId: string): Record<string, unknown> {
	const old = op.existing?.extra ?? {};
	const markers = markersOf(old);
	const addMarker = op.marker || op.price?.correction;
	const nextMarkers = addMarker
		? [
				...markers.filter((m) => !(m.feed_date === feedDate && m.feed_id === feedId)),
				{ feed_date: feedDate, feed_id: feedId }
			].slice(-10)
		: markers;
	let extra: Record<string, unknown>;
	if (op.price) {
		// Replace (design §2-3) — but carry forward flows + correction markers.
		extra = { feed_id: feedId };
		if (old.flows !== undefined) extra.flows = old.flows;
		if (op.price.correction && op.existing) {
			extra.prev = {
				close: op.existing.close,
				change_pct: op.existing.change_pct,
				source: op.existing.source,
				...(typeof old.feed_id === 'string' ? { feed_id: old.feed_id } : {})
			};
		}
	} else {
		extra = { ...old };
	}
	if (nextMarkers.length) extra.feed_corrections = nextMarkers;
	if (op.flow) {
		extra.flows = {
			status: op.flow.status,
			src: op.flow.src,
			feed_id: feedId,
			feed_date: feedDate,
			unit: 'shares'
		};
	}
	return extra;
}

function describePriceOp(op: PriceOp) {
	const after: Record<string, unknown> = {};
	if (op.price) {
		after.close = op.price.close;
		after.change_pct = op.price.change_pct;
		after.currency = op.price.currency;
		after.source = FEED_SOURCE;
		if (op.price.correction) after.correction = true;
	}
	if (op.flow) {
		after.foreign_net_buy = op.flow.foreign;
		after.inst_net_buy = op.flow.inst;
		after.flow_status = op.flow.status;
	}
	if (op.marker) after.correction_marker = true;
	const before = op.existing
		? {
				...pickValues(op.existing),
				...(op.flow
					? { foreign_net_buy: op.existing.foreign_net_buy, inst_net_buy: op.existing.inst_net_buy }
					: {})
			}
		: null;
	return { table: 'price_snapshots', key: op.key, field: op.field, before, after };
}

function describeIndicatorOp(op: IndicatorOp) {
	return {
		table: 'market_indicators',
		key: `${op.key}|${op.asOf}`,
		field: op.field,
		before: op.before
			? { value: op.before.value, change_pct: op.before.change_pct, source: op.before.source }
			: null,
		after: {
			value: op.value,
			change_pct: op.change_pct,
			source: FEED_SOURCE,
			...(op.correction ? { correction: true } : {})
		}
	};
}

/* ----------------------------------------------------------------------------------------- */
/* Handler                                                                                   */
/* ----------------------------------------------------------------------------------------- */

function requireRepo(repo: RepoClient | null): RepoClient {
	if (!repo) throw new Error('repo unavailable for feed tool');
	return repo;
}

/** Injectable clock for tests. */
export const feedClock = { now: () => Date.now() };

const MAX_PROVENANCE_NOTES = 40;

function updateProvenanceNotes(
	updates: ReadonlyArray<{ table: string; key: string; field: string; before: unknown }>
): McpRuleIssue[] {
	return updates.slice(0, MAX_PROVENANCE_NOTES).map((u) => ({
		rule: FEED_RULES.auditSummary,
		field: u.field,
		message: `update ${u.table} ${u.key} before=${JSON.stringify(u.before)}`.slice(0, 300)
	}));
}

export async function submitDailyMarketFeedHandler(
	input: ToolHandlerInput
): Promise<ToolHandlerOutcome> {
	if (input.ruleIds.includes('R-PERM-03')) {
		throw new McpToolError('VALIDATION', [
			{
				rule: 'R-PERM-03',
				field: 'owner_id',
				message: 'identity fields are server-owned; the owner comes from the key'
			}
		]);
	}
	const parsed = feedInputSchema.safeParse(input.args);
	if (!parsed.success) {
		throw new McpToolError(
			'VALIDATION',
			parsed.error.issues.slice(0, 20).map((iss) => ({
				rule: FEED_RULES.schema,
				field: iss.path.join('.').slice(0, 80) || '(root)',
				// unknown-key messages echo caller-supplied key names — keep them short
				message: iss.message.slice(0, 160)
			}))
		);
	}
	const args = parsed.data;
	const repo = requireRepo(input.repo);

	const instruments = unwrapDb(await listInstruments(repo));
	const feedInstruments = instruments.filter((i) =>
		(FEED_TICKERS as readonly string[]).includes(i.ticker)
	);
	const from = addDays(args.feed_date, -WINDOW_DAYS);
	const priceRows = unwrapDb(
		await listFeedPriceWindow(
			repo,
			feedInstruments.map((i) => i.id),
			from,
			args.feed_date
		)
	);
	const indicatorRows = unwrapDb(
		await listFeedIndicatorWindow(repo, FEED_INDICATOR_KEYS, from, args.feed_date)
	);

	const plan = planFeed(args, {
		now: feedClock.now(),
		instruments: feedInstruments,
		priceRows,
		indicatorRows
	});

	const inserts = [
		...plan.priceOps.filter((o) => o.kind === 'insert').map(describePriceOp),
		...plan.indicatorOps.filter((o) => o.kind === 'insert').map(describeIndicatorOp)
	];
	const updates = [
		...plan.priceOps.filter((o) => o.kind === 'update').map(describePriceOp),
		...plan.indicatorOps.filter((o) => o.kind === 'update').map(describeIndicatorOp)
	];
	const summary = (dry: boolean, ok: boolean) => ({
		rule: FEED_RULES.auditSummary,
		message: `dry_run=${dry} ok=${ok} insert=${inserts.length} update=${updates.length} unchanged=${plan.unchanged} rejected=${plan.rejected.length} skipped=${plan.skipped.length} corrections=${plan.correctionsApplied}`
	});

	if (args.dry_run) {
		return {
			data: {
				dry_run: true,
				feed_id: args.feed_id,
				feed_date: args.feed_date,
				would_insert: inserts,
				would_update: updates,
				unchanged: plan.unchanged,
				skipped: plan.skipped,
				rejected: plan.rejected,
				warnings: plan.warnings
			},
			ruleIds: [...new Set(plan.rejected.map((r) => r.rule))],
			auditNotes: [summary(true, plan.rejected.length === 0)]
		};
	}

	if (plan.rejected.length > 0) {
		throw new McpToolError(
			'VALIDATION',
			plan.rejected.map((r) => ({ rule: r.rule, field: r.row, message: r.message }))
		);
	}

	// Live write. Order: price updates → price inserts → indicators. Not a single transaction:
	// a failure part-way is converged by retrying the same feed_id (idempotent: written rows
	// compare unchanged, the rest are applied). Corrections run with the marker already stamped
	// on today's rows in the same pass.
	const affected: McpAffectedId[] = [];
	const updateOps = plan.priceOps.filter((o) => o.kind === 'update');
	for (const op of updateOps) {
		const patch: FeedPricePatch = { extra: buildExtra(op, args.feed_date, args.feed_id) };
		if (op.price) {
			patch.close = op.price.close;
			patch.change_pct = op.price.change_pct;
			patch.currency = op.price.currency;
			patch.source = FEED_SOURCE;
		}
		if (op.flow) {
			patch.foreign_net_buy = op.flow.foreign;
			patch.inst_net_buy = op.flow.inst;
		}
		const r = await updateFeedPriceRow(repo, op.existing!.id, patch);
		if (r.error) throwMappedDbError(r.error);
		affected.push({ table: 'price_snapshots', id: String(op.existing!.id) });
	}
	const insertRows: FeedPriceInsert[] = plan.priceOps
		.filter((o) => o.kind === 'insert' && o.price)
		.map((op) => ({
			instrument_id: op.instrumentId,
			as_of: op.asOf,
			close: op.price!.close,
			change_pct: op.price!.change_pct,
			currency: op.price!.currency,
			source: FEED_SOURCE,
			extra: buildExtra(op, args.feed_date, args.feed_id),
			...(op.flow ? { foreign_net_buy: op.flow.foreign, inst_net_buy: op.flow.inst } : {})
		}));
	if (insertRows.length) {
		const r = await insertFeedPriceRows(repo, insertRows);
		if (r.error) throwMappedDbError(r.error);
		for (const id of r.ids) affected.push({ table: 'price_snapshots', id: String(id) });
	}
	if (plan.indicatorOps.length) {
		const r = await upsertMarketIndicators(
			repo,
			plan.indicatorOps.map((op) => ({
				key: op.key,
				as_of: op.asOf,
				value: op.value,
				...(op.change_pct !== null ? { change_pct: op.change_pct } : {}),
				source: FEED_SOURCE
			}))
		);
		if (r.error) throwMappedDbError(r.error);
		for (const op of plan.indicatorOps)
			affected.push({ table: 'market_indicators', id: `${op.key}:${op.asOf}` });
	}

	return {
		data: {
			dry_run: false,
			feed_id: args.feed_id,
			feed_date: args.feed_date,
			inserted: inserts,
			updated: updates,
			unchanged: plan.unchanged,
			skipped: plan.skipped,
			rejected: [],
			warnings: plan.warnings
		},
		affectedIds: affected,
		// Provenance (code_review Info): a live update overwrites source/source_bot_id on the row, so
		// the audit log keeps what each updated row held before (value + source), audit-only.
		auditNotes: [summary(false, true), ...updateProvenanceNotes(updates)]
	};
}

export function registerFeedTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(filterToolsByScopes([FEED_TOOL_NAME], reg.ctx));
	if (!allowed.has(FEED_TOOL_NAME)) return;
	registerAuditedTool(reg, {
		name: 'submit_daily_market_feed',
		title: 'Submit daily market feed',
		description:
			'일일 시세 피드 1건(scope market:feed 전용). dry_run 필수: true면 검증과 바뀔 내용만 돌려주고 쓰지 않는다. ' +
			'서버 게이트(R-FEED-01~14): strict 입력·ISO 날짜, feed_date=오늘/어제(KST)·주말 거부, 시장별 기대 as_of와 휴장 달력(KRX·NYSE·SIFMA), ' +
			'허용 8종목·기대 종목 중 최대 1개 결측, 급변(KRX ±30%·미국 ±50%)·등락률 교차 확인 0.3%p, 지표 범위·usdkrw 서울 15:30·전일 ±25원, ' +
			'수급 5종목(주 단위, 기존 가격 행의 수급 칸만), 정정은 직전 거래일·feed_date당 1회, source=fm:daily-feed 고정, 삭제 없음. ' +
			'거부가 하나라도 있으면 아무것도 쓰지 않는다(live는 VALIDATION). 소유자는 키에서만 정한다(R-PERM-03).',
		inputSchema: feedInputShape,
		strictInput: true,
		annotations: { idempotentHint: true, destructiveHint: false },
		handler: submitDailyMarketFeedHandler
	});
}
