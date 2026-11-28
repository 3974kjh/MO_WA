/**
 * Market holiday calendars for the daily market feed (mcp-feed-design §2-2 / §3-5).
 *
 * Weekday full-day closures only (weekends are always closed). Early closes are trading days.
 * Sources (checked 2026-11-28 KST):
 * - KRX: open.krx.co.kr 증시일정 › 휴장일 (2026, 2027 official list).
 * - NYSE: nyse.com/trade/hours-calendars (2026–2028 announced 2025-12-23).
 * - SIFMA: sifma.org holiday schedule, US recommendations issued 2025-12-17
 *   (full closes only; 2026-04-03 Good Friday is an early close, not a full close).
 *
 * Refresh every December (owner: develop). Dates outside [CALENDAR_START, CALENDAR_END]
 * are "out of range": the feed tool allows dry_run only there and warns from
 * CALENDAR_EXPIRY_WARN_DAYS before CALENDAR_END.
 */

export type MarketCalendarId = 'KRX' | 'NYSE' | 'SIFMA';

export const CALENDAR_START = '2026-01-01';
export const CALENDAR_END = '2027-12-31';
export const CALENDAR_EXPIRY_WARN_DAYS = 30;

const KRX_HOLIDAYS = [
	// 2026
	'2026-01-01',
	'2026-02-16',
	'2026-02-17',
	'2026-02-18',
	'2026-03-02',
	'2026-05-01',
	'2026-05-05',
	'2026-05-25',
	'2026-06-03',
	'2026-07-17',
	'2026-08-17',
	'2026-09-24',
	'2026-09-25',
	'2026-10-05',
	'2026-10-09',
	'2026-12-25',
	'2026-12-31',
	// 2027
	'2027-01-01',
	'2027-02-08',
	'2027-02-09',
	'2027-03-01',
	'2027-05-03',
	'2027-05-05',
	'2027-05-13',
	'2027-07-19',
	'2027-08-16',
	'2027-09-14',
	'2027-09-15',
	'2027-09-16',
	'2027-10-04',
	'2027-10-11',
	'2027-12-27',
	'2027-12-31'
] as const;

const NYSE_HOLIDAYS = [
	// 2026
	'2026-01-01',
	'2026-01-19',
	'2026-02-16',
	'2026-04-03',
	'2026-05-25',
	'2026-06-19',
	'2026-07-03',
	'2026-09-07',
	'2026-11-26',
	'2026-12-25',
	// 2027
	'2027-01-01',
	'2027-01-18',
	'2027-02-15',
	'2027-03-26',
	'2027-05-31',
	'2027-06-18',
	'2027-07-05',
	'2027-09-06',
	'2027-11-25',
	'2027-12-24'
] as const;

const SIFMA_HOLIDAYS = [
	// 2026 (Good Friday 04-03 = early close only)
	'2026-01-01',
	'2026-01-19',
	'2026-02-16',
	'2026-05-25',
	'2026-06-19',
	'2026-07-03',
	'2026-09-07',
	'2026-10-12',
	'2026-11-11',
	'2026-11-26',
	'2026-12-25',
	// 2027
	'2027-01-01',
	'2027-01-18',
	'2027-02-15',
	'2027-03-26',
	'2027-05-31',
	'2027-06-18',
	'2027-07-05',
	'2027-09-06',
	'2027-10-11',
	'2027-11-11',
	'2027-11-25',
	'2027-12-24'
] as const;

const HOLIDAYS: Readonly<Record<MarketCalendarId, ReadonlySet<string>>> = Object.freeze({
	KRX: new Set<string>(KRX_HOLIDAYS),
	NYSE: new Set<string>(NYSE_HOLIDAYS),
	SIFMA: new Set<string>(SIFMA_HOLIDAYS)
});

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict ISO `YYYY-MM-DD` that is also a real calendar date (no 2026-02-30). */
export function isRealIsoDate(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const m = ISO_DATE_RE.exec(value);
	if (!m) return false;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const d = Number(m[3]);
	if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1) return false;
	const dt = new Date(Date.UTC(y, mo - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtc(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y!, m! - 1, d!));
}

function fromUtc(dt: Date): string {
	return dt.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	const dt = toUtc(iso);
	dt.setUTCDate(dt.getUTCDate() + days);
	return fromUtc(dt);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
	return toUtc(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
	const w = weekday(iso);
	return w === 0 || w === 6;
}

export function isInCalendarRange(iso: string): boolean {
	return iso >= CALENDAR_START && iso <= CALENDAR_END;
}

/** Days from `iso` until CALENDAR_END (negative once past). */
export function daysUntilCalendarEnd(iso: string): number {
	return Math.round((toUtc(CALENDAR_END).getTime() - toUtc(iso).getTime()) / 86_400_000);
}

export function isHoliday(cal: MarketCalendarId, iso: string): boolean {
	return HOLIDAYS[cal].has(iso);
}

/** Weekday and not a listed holiday. Caller checks range separately. */
export function isTradingDay(cal: MarketCalendarId, iso: string): boolean {
	return !isWeekend(iso) && !isHoliday(cal, iso);
}

/**
 * Closest trading day strictly before `iso`. Returns null when the walk leaves the
 * calendar range (we refuse to guess outside known data).
 */
export function previousTradingDay(cal: MarketCalendarId, iso: string): string | null {
	let cur = addDays(iso, -1);
	for (let i = 0; i < 31; i += 1) {
		if (!isInCalendarRange(cur)) return null;
		if (isTradingDay(cal, cur)) return cur;
		cur = addDays(cur, -1);
	}
	return null;
}

/** Trading days strictly between `older` and `newer` (exclusive both ends). */
export function tradingDaysBetween(cal: MarketCalendarId, older: string, newer: string): number {
	let n = 0;
	let cur = addDays(older, 1);
	while (cur < newer) {
		if (isTradingDay(cal, cur)) n += 1;
		cur = addDays(cur, 1);
	}
	return n;
}

/** KST (UTC+9) calendar date for an epoch-ms instant. */
export function kstDate(nowMs: number): string {
	return new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
}
