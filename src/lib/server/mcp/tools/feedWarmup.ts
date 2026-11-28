/**
 * Feed warm-up gate — a key may only dry_run during its first 5 trading days (R-FEED-40).
 *
 * Pure and clock-free: callers pass the key's server-read `created_at` and the server clock.
 * Nothing here reads client input.
 *
 * Trading-day definition (stricter / longer on purpose): a calendar date counts only when KRX,
 * NYSE **and** SIFMA are all open (weekday and not in the server holiday calendars), because the
 * feed writes KRX prices, NYSE-side prices and the SIFMA-calendar `ust10y` leg. Dates are KST
 * calendar dates (the same zone the feed uses for `feed_date`). Day 1 is the first such date on
 * or after the KST date of `created_at` — a key created on a holiday/weekend starts counting at
 * the next trading day; a key created after the close still counts that date as day 1.
 * Live writes unlock on the 6th such date (`unlockDate`), i.e. while `today(KST) < unlockDate`
 * live is refused (so days 1–5 and any non-trading days in between are refused).
 */
import {
	addDays,
	CALENDAR_END,
	CALENDAR_START,
	isInCalendarRange,
	isTradingDay,
	kstDate,
	type MarketCalendarId
} from '../marketCalendar';

export const WARMUP_TRADING_DAYS = 5;
const WARMUP_CALENDARS: readonly MarketCalendarId[] = ['KRX', 'NYSE', 'SIFMA'];
/** Safety bound for the forward walk (5 trading days never need more than ~3 weeks). */
const MAX_WALK_DAYS = 60;

export type WarmupVerdict =
	| { status: 'open'; unlockDate: string }
	| {
			status: 'warming';
			/** Trading days elapsed so far (0..5), counting today when it is one. */
			elapsed: number;
			firstTradingDay: string;
			/** 6th trading day (YYYY-MM-DD, KST) — first date live writes are allowed. */
			unlockDate: string;
	  }
	| { status: 'unverifiable'; reason: string };

/** True when every feed calendar is open on `iso` (range checked by the caller). */
export function isWarmupTradingDay(iso: string): boolean {
	return WARMUP_CALENDARS.every((cal) => isTradingDay(cal, iso));
}

export function evaluateFeedWarmup(createdAt: unknown, nowMs: number): WarmupVerdict {
	if (typeof createdAt !== 'string' || createdAt.trim() === '') {
		return { status: 'unverifiable', reason: 'key created_at is unavailable' };
	}
	const createdMs = Date.parse(createdAt);
	if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) {
		return { status: 'unverifiable', reason: 'key created_at or server clock is not a valid time' };
	}
	const createdKst = kstDate(createdMs);
	if (createdKst > CALENDAR_END) {
		return { status: 'unverifiable', reason: 'key created_at is outside the holiday calendar' };
	}
	// A key older than the calendar start is older than any 5 trading days the calendar covers.
	let cur = createdKst < CALENDAR_START ? CALENDAR_START : createdKst;
	const days: string[] = [];
	for (let i = 0; i < MAX_WALK_DAYS && days.length < WARMUP_TRADING_DAYS + 1; i += 1) {
		if (!isInCalendarRange(cur)) break;
		if (isWarmupTradingDay(cur)) days.push(cur);
		cur = addDays(cur, 1);
	}
	if (days.length < WARMUP_TRADING_DAYS + 1) {
		return {
			status: 'unverifiable',
			reason: 'holiday calendar does not cover the unlock trading day'
		};
	}
	const unlockDate = days[WARMUP_TRADING_DAYS]!;
	const today = kstDate(nowMs);
	if (today >= unlockDate) return { status: 'open', unlockDate };
	const elapsed = days.slice(0, WARMUP_TRADING_DAYS).filter((d) => d <= today).length;
	return { status: 'warming', elapsed, firstTradingDay: days[0]!, unlockDate };
}
