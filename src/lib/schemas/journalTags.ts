import { z } from 'zod';

/**
 * Heuristic ticker-like codes that must not appear in tags (R-VAL-J08 WARN).
 * - KRX: exactly 6 digits
 * - US: 2–5 uppercase letters, optional .XX / -X suffix (e.g. GOOGL, BRK.B)
 * - Internal bond/cash style: underscore present (e.g. UST_30Y)
 * Pure theme words without code shape (e.g. 반도체) are ignored.
 */
export const tickerLikeInTagsPattern =
	/^(?:\d{6}|[A-Z]{2,5}(?:[.-][A-Z]{1,2})?|[A-Z][A-Z0-9]*_[A-Z0-9_]+)$/;

export const journalTagsSchema = z.array(z.string());

export function tagsContainingTickerCodes(tags: string[] | null | undefined): string[] {
	if (!tags?.length) return [];
	return tags.filter((t) => tickerLikeInTagsPattern.test(t.trim()));
}
