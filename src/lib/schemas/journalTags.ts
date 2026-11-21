import { z } from 'zod';

/**
 * R-VAL-J08 WARN — tags must not contain ticker codes (Q-16).
 * L3: Do not false-positive on generic uppercase words (AI, ETF, IPO, USA).
 * Only treat as problems: KRX 6-digit codes, and codes present in `instruments`.
 */
export const KRX_TICKER_IN_TAGS = /^\d{6}$/;

export const journalTagsSchema = z.array(z.string());

export function tagsContainingTickerCodes(
	tags: string[] | null | undefined,
	knownTickers: Iterable<string> | null | undefined
): string[] {
	if (!tags?.length) return [];
	const known = new Set([...(knownTickers ?? [])].map((t) => t.trim()).filter(Boolean));
	return tags.filter((raw) => {
		const t = raw.trim();
		if (!t) return false;
		if (KRX_TICKER_IN_TAGS.test(t)) return true;
		return known.has(t);
	});
}
