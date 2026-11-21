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
