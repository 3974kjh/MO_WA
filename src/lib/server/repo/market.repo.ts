/**
 * Market / price helpers for BE-11 loads (kospi join, usdkrw FX, latest closes).
 */
import { serverCreateStamps, type RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

export type PriceSnapshotLite = {
	instrument_id: string;
	close: number;
	currency: string;
	as_of: string;
};

export type MarketIndicatorLite = {
	key: string;
	value: number;
	change_pct: number | null;
	as_of: string;
};

/** Latest price_snapshots row per instrument_id (by as_of desc). */
export async function listLatestPrices(
	repo: RepoClient,
	instrumentIds: string[]
): Promise<{ data: PriceSnapshotLite[]; error: Error | null }> {
	if (instrumentIds.length === 0) return { data: [], error: null };
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'price_snapshots')
		.select('instrument_id, close, currency, as_of')
		.in('instrument_id', instrumentIds)
		.order('as_of', { ascending: false });
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };

	const seen = new Set<string>();
	const out: PriceSnapshotLite[] = [];
	for (const row of (data ?? []) as PriceSnapshotLite[]) {
		if (seen.has(row.instrument_id)) continue;
		seen.add(row.instrument_id);
		out.push(row);
	}
	return { data: out, error: null };
}

export async function getLatestIndicator(
	repo: RepoClient,
	key: string
): Promise<{ data: MarketIndicatorLite | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'market_indicators')
		.select('key, value, change_pct, as_of')
		.eq('key', key)
		.order('as_of', { ascending: false })
		.limit(1);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as MarketIndicatorLite | null) ?? null, error: error as Error | null };
}

/** FE-03 코스피 추이: 최근 `limit`개 기록(as_of 오름차순). 기록이 없는 날은 채우지 않는다. */
export const INDICATOR_SERIES_MAX = 60;

export async function listIndicatorSeries(
	repo: RepoClient,
	key: string,
	limit = 30
): Promise<{ data: Array<{ as_of: string; value: number }>; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const n = Math.max(1, Math.min(INDICATOR_SERIES_MAX, Math.trunc(limit)));
	let q = fromRepo(repo, 'market_indicators')
		.select('as_of, value')
		.eq('key', key)
		.order('as_of', { ascending: false })
		.limit(n);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	const rows = ((data ?? []) as Array<{ as_of: string; value: number | string | null }>)
		.map((r) => ({
			as_of: r.as_of,
			value: r.value == null || r.value === '' ? NaN : Number(r.value)
		}))
		.filter((r) => typeof r.as_of === 'string' && Number.isFinite(r.value));
	return { data: rows.reverse(), error: null };
}

/**
 * G-6: kospi change_pct for each report_date (as_of date match).
 * Returns map report_date → change_pct (null when missing).
 */
export async function kospiChangePctByDates(
	repo: RepoClient,
	dates: string[]
): Promise<{ data: Map<string, number | null>; error: Error | null }> {
	const map = new Map<string, number | null>();
	const unique = [...new Set(dates.filter(Boolean))];
	for (const d of unique) map.set(d, null);
	if (unique.length === 0) return { data: map, error: null };

	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'market_indicators')
		.select('key, change_pct, as_of')
		.eq('key', 'kospi')
		.in('as_of', unique);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: map, error: error as Error };
	for (const row of (data ?? []) as Array<{ as_of: string; change_pct: number | null }>) {
		map.set(row.as_of, row.change_pct);
	}
	return { data: map, error: null };
}

/** Max rows per batch write tool call (design §5-5). */
export const MAX_SNAPSHOT_BATCH = 500;

export type PriceSnapshotInput = {
	instrument_id: string;
	as_of: string;
	close: number;
	currency: string;
	change_pct?: number | null;
	volume?: number | null;
	foreign_net_buy?: number | null;
	inst_net_buy?: number | null;
	source?: string | null;
	extra?: Record<string, unknown>;
};

/**
 * R-VAL-I02: duplicate (instrument_id, as_of) overwrites. The table's unique key has no
 * owner_id, so owner-forced upsert is not possible: look up existing rows, then update/insert.
 */
export async function upsertPriceSnapshots(
	repo: RepoClient,
	rows: readonly PriceSnapshotInput[]
): Promise<{ inserted: number; updated: number; error: Error | null }> {
	if (rows.length === 0) return { inserted: 0, updated: 0, error: null };
	if (rows.length > MAX_SNAPSHOT_BATCH) {
		return {
			inserted: 0,
			updated: 0,
			error: new Error(`batch exceeds ${MAX_SNAPSHOT_BATCH} rows`)
		};
	}
	const ownerId = requireOwnerId(repo);
	const stamps = serverCreateStamps(repo.actor);

	const byKey = new Map<string, PriceSnapshotInput>();
	for (const r of rows) byKey.set(`${r.instrument_id}|${r.as_of}`, r);
	const unique = [...byKey.values()];

	const instrumentIds = [...new Set(unique.map((r) => r.instrument_id))];
	const dates = [...new Set(unique.map((r) => r.as_of))];
	let q = fromRepo(repo, 'price_snapshots')
		.select('id, instrument_id, as_of')
		.in('instrument_id', instrumentIds)
		.in('as_of', dates);
	q = withOwnerFilter(q, ownerId);
	const { data: existing, error: lookupError } = await q;
	if (lookupError) return { inserted: 0, updated: 0, error: lookupError as Error };

	const existingId = new Map<string, number>();
	for (const e of (existing ?? []) as Array<{ id: number; instrument_id: string; as_of: string }>) {
		existingId.set(`${e.instrument_id}|${e.as_of}`, e.id);
	}

	const toInsert: Record<string, unknown>[] = [];
	let updated = 0;
	for (const r of unique) {
		const key = `${r.instrument_id}|${r.as_of}`;
		const id = existingId.get(key);
		const body = { ...r, extra: r.extra ?? {} };
		if (id === undefined) {
			toInsert.push({ ...body, ...stamps });
			continue;
		}
		let u = fromRepo(repo, 'price_snapshots')
			.update({ ...body, source_bot_id: stamps.source_bot_id })
			.eq('id', id);
		u = withOwnerFilter(u, ownerId);
		const { error } = await u;
		if (error) return { inserted: 0, updated, error: error as Error };
		updated += 1;
	}
	if (toInsert.length > 0) {
		const { error } = await fromRepo(repo, 'price_snapshots').insert(toInsert);
		if (error) return { inserted: 0, updated, error: error as Error };
	}
	return { inserted: toInsert.length, updated, error: null };
}

export type PortfolioSnapshotInput = {
	as_of: string;
	total_value?: number | null;
	currency?: string;
	weights?: Record<string, unknown>;
	plan_distances?: Record<string, unknown>;
	extra?: Record<string, unknown>;
};

/** One snapshot per (owner, as_of); same day overwrites. */
export async function upsertPortfolioSnapshot(
	repo: RepoClient,
	input: PortfolioSnapshotInput
): Promise<{ data: { id: number; as_of: string } | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = { ...input, source_bot_id: stamps.source_bot_id };
	const { data, error } = await fromRepo(repo, 'portfolio_snapshots')
		.upsert(row, { onConflict: 'owner_id,as_of' })
		.select('id, as_of')
		.single();
	return {
		data: (data as { id: number; as_of: string } | null) ?? null,
		error: error as Error | null
	};
}

export type MarketIndicatorInput = {
	key: string;
	as_of: string;
	value: number;
	change?: number | null;
	change_pct?: number | null;
	source?: string | null;
};

/** Batch upsert on (owner, key, as_of). */
export async function upsertMarketIndicators(
	repo: RepoClient,
	rows: readonly MarketIndicatorInput[]
): Promise<{ count: number; error: Error | null }> {
	if (rows.length === 0) return { count: 0, error: null };
	if (rows.length > MAX_SNAPSHOT_BATCH) {
		return { count: 0, error: new Error(`batch exceeds ${MAX_SNAPSHOT_BATCH} rows`) };
	}
	const stamps = serverCreateStamps(repo.actor);
	const byKey = new Map<string, MarketIndicatorInput>();
	for (const r of rows) byKey.set(`${r.key}|${r.as_of}`, r);
	const payload = [...byKey.values()].map((r) => ({ ...r, source_bot_id: stamps.source_bot_id }));
	const { error } = await fromRepo(repo, 'market_indicators').upsert(payload, {
		onConflict: 'owner_id,key,as_of'
	});
	return { count: payload.length, error: (error as Error | null) ?? null };
}

/* ------------------------------------------------------------------------------------------
 * Daily market feed (mcp-feed-design §3-4). All reads owner-filtered (fromRepo forces it too);
 * writes never delete. price_snapshots' unique key has no owner_id, so writes are
 * update-by-id (owner-filtered) + batch insert, never upsert.
 * ---------------------------------------------------------------------------------------- */

export type FeedPriceRow = {
	id: number;
	instrument_id: string;
	as_of: string;
	close: number;
	change_pct: number | null;
	currency: string;
	source: string | null;
	extra: Record<string, unknown>;
	foreign_net_buy: number | null;
	inst_net_buy: number | null;
	source_bot_id: string | null;
};

export type FeedIndicatorRow = {
	key: string;
	as_of: string;
	value: number;
	change_pct: number | null;
	source: string | null;
	source_bot_id: string | null;
};

/** Optimistic-lock failure: the row changed between the feed's read and its write. */
export class FeedRowChangedError extends Error {
	constructor(id: number) {
		super(`price row ${id} changed concurrently`);
		this.name = 'FeedRowChangedError';
	}
}

function numOrNull(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function plainObject(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Owner's price rows for `instrumentIds` with from ≤ as_of ≤ to (ascending as_of). */
export async function listFeedPriceWindow(
	repo: RepoClient,
	instrumentIds: readonly string[],
	from: string,
	to: string
): Promise<{ data: FeedPriceRow[]; error: Error | null }> {
	if (instrumentIds.length === 0) return { data: [], error: null };
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'price_snapshots')
		.select(
			'id, instrument_id, as_of, close, change_pct, currency, source, extra, foreign_net_buy, inst_net_buy, source_bot_id'
		)
		.in('instrument_id', [...instrumentIds])
		.gte('as_of', from)
		.lte('as_of', to)
		.order('as_of', { ascending: true });
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
		id: Number(r.id),
		instrument_id: String(r.instrument_id),
		as_of: String(r.as_of),
		close: Number(r.close),
		change_pct: numOrNull(r.change_pct),
		currency: String(r.currency),
		source: typeof r.source === 'string' ? r.source : null,
		extra: plainObject(r.extra),
		foreign_net_buy: numOrNull(r.foreign_net_buy),
		inst_net_buy: numOrNull(r.inst_net_buy),
		source_bot_id: typeof r.source_bot_id === 'string' ? r.source_bot_id : null
	}));
	return { data: rows, error: null };
}

/** Owner's indicator rows for `keys` with from ≤ as_of ≤ to (ascending as_of). */
export async function listFeedIndicatorWindow(
	repo: RepoClient,
	keys: readonly string[],
	from: string,
	to: string
): Promise<{ data: FeedIndicatorRow[]; error: Error | null }> {
	if (keys.length === 0) return { data: [], error: null };
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'market_indicators')
		.select('key, as_of, value, change_pct, source, source_bot_id')
		.in('key', [...keys])
		.gte('as_of', from)
		.lte('as_of', to)
		.order('as_of', { ascending: true });
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
		key: String(r.key),
		as_of: String(r.as_of),
		value: Number(r.value),
		change_pct: numOrNull(r.change_pct),
		source: typeof r.source === 'string' ? r.source : null,
		source_bot_id: typeof r.source_bot_id === 'string' ? r.source_bot_id : null
	}));
	return { data: rows, error: null };
}

export type FeedPriceInsert = {
	instrument_id: string;
	as_of: string;
	close: number;
	change_pct: number;
	currency: 'KRW' | 'USD';
	source: string;
	extra: Record<string, unknown>;
	foreign_net_buy?: number;
	inst_net_buy?: number;
};

/** Columns the feed may change on an existing price row (never owner/instrument/as_of/id). */
export type FeedPricePatch = Partial<
	Pick<
		FeedPriceInsert,
		'close' | 'change_pct' | 'currency' | 'source' | 'extra' | 'foreign_net_buy' | 'inst_net_buy'
	>
>;

const FEED_PRICE_PATCH_KEYS = [
	'close',
	'change_pct',
	'currency',
	'source',
	'extra',
	'foreign_net_buy',
	'inst_net_buy'
] as const;

export async function insertFeedPriceRows(
	repo: RepoClient,
	rows: readonly FeedPriceInsert[]
): Promise<{ ids: number[]; error: Error | null }> {
	if (rows.length === 0) return { ids: [], error: null };
	const stamps = serverCreateStamps(repo.actor);
	const payload = rows.map((r) => ({ ...r, ...stamps }));
	const { data, error } = await fromRepo(repo, 'price_snapshots').insert(payload).select('id');
	if (error) return { ids: [], error: error as Error };
	return { ids: ((data ?? []) as Array<{ id: number }>).map((r) => Number(r.id)), error: null };
}

/** Values the row held when the feed read it (compare-and-set guard for concurrent submits). */
export type FeedPriceExpect = Pick<
	FeedPriceRow,
	'close' | 'source' | 'foreign_net_buy' | 'inst_net_buy'
>;

/**
 * Update one owner price row by id. With `expect`, the update only applies while close/source/
 * flows still hold the values the feed read (else FeedRowChangedError). Errors unless exactly
 * one row matched.
 */
export async function updateFeedPriceRow(
	repo: RepoClient,
	id: number,
	patch: FeedPricePatch,
	expect?: FeedPriceExpect
): Promise<{ error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const stamps = serverCreateStamps(repo.actor);
	const safe: Record<string, unknown> = {};
	for (const k of FEED_PRICE_PATCH_KEYS) {
		if (patch[k] !== undefined) safe[k] = patch[k];
	}
	if (Object.keys(safe).length === 0) return { error: null };
	let q = fromRepo(repo, 'price_snapshots')
		.update({ ...safe, source_bot_id: stamps.source_bot_id })
		.eq('id', id);
	q = withOwnerFilter(q, ownerId);
	if (expect) {
		q = q.eq('close', expect.close);
		q = expect.source === null ? q.is('source', null) : q.eq('source', expect.source);
		q =
			expect.foreign_net_buy === null
				? q.is('foreign_net_buy', null)
				: q.eq('foreign_net_buy', expect.foreign_net_buy);
		q =
			expect.inst_net_buy === null
				? q.is('inst_net_buy', null)
				: q.eq('inst_net_buy', expect.inst_net_buy);
	}
	const { data, error } = await q.select('id');
	if (error) return { error: error as Error };
	if (!Array.isArray(data) || data.length !== 1) {
		return {
			error: expect
				? new FeedRowChangedError(id)
				: new Error(`price row ${id} not updated (owner mismatch or missing)`)
		};
	}
	return { error: null };
}
