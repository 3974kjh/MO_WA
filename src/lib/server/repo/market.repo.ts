/**
 * Market / price helpers for BE-11 loads (kospi join, usdkrw FX, latest closes).
 */
import type { RepoClient } from './client';
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
