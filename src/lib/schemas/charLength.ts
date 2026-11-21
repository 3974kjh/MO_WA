/**
 * Match Postgres `char_length()` (L2).
 * Counts Unicode code points via spread (BMP + most astral chars).
 */
export function charLength(value: string): number {
	return [...value].length;
}
