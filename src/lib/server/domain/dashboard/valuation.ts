/**
 * BE-11 dashboard valuation: approved positions × latest price_snapshots, usdkrw FX.
 * Distance/trigger state is FE-only — server only supplies prices + trigger fields.
 */

export type ValuationPosition = {
	id: string;
	qty: number | null;
	currency: 'KRW' | 'USD';
	status: string;
	archived_at?: string | null;
};

export type LatestPrice = {
	instrument_id: string;
	close: number;
	currency: string;
	as_of: string;
};

export type ValuationResult = {
	/** Total value in KRW (USD converted via usdkrw). */
	totalKrw: number | null;
	usdkrw: number | null;
	usdkrwAsOf: string | null;
	positions: Array<{
		id: string;
		qty: number;
		currency: 'KRW' | 'USD';
		latestClose: number | null;
		latestAsOf: string | null;
		valueKrw: number | null;
	}>;
};

/**
 * Sum approved holding values. Planned/closed/archived excluded.
 * Missing price → that position's valueKrw is null (not zeroed into the total).
 */
export function computeDashboardValuation(input: {
	positions: readonly ValuationPosition[];
	latestByInstrument: ReadonlyMap<string, LatestPrice>;
	/** instrument_id keyed map — caller resolves position → instrument. */
	positionInstrument: ReadonlyMap<string, string>;
	usdkrw: { value: number; as_of: string } | null;
}): ValuationResult {
	const rows: ValuationResult['positions'] = [];
	let total = 0;
	let any = false;

	for (const p of input.positions) {
		if (p.status !== 'holding' || p.archived_at != null) continue;
		if (p.qty == null || !(p.qty > 0)) continue;

		const instrumentId = input.positionInstrument.get(p.id);
		const price = instrumentId ? input.latestByInstrument.get(instrumentId) : undefined;
		let valueKrw: number | null = null;
		if (price) {
			const native = p.qty * price.close;
			if (p.currency === 'KRW') {
				valueKrw = native;
			} else if (input.usdkrw && input.usdkrw.value > 0) {
				valueKrw = native * input.usdkrw.value;
			}
		}
		if (valueKrw != null) {
			total += valueKrw;
			any = true;
		}
		rows.push({
			id: p.id,
			qty: p.qty,
			currency: p.currency,
			latestClose: price?.close ?? null,
			latestAsOf: price?.as_of ?? null,
			valueKrw
		});
	}

	return {
		totalKrw: any ? total : null,
		usdkrw: input.usdkrw?.value ?? null,
		usdkrwAsOf: input.usdkrw?.as_of ?? null,
		positions: rows
	};
}
