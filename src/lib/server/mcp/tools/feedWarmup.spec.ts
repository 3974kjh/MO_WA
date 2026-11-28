/**
 * Feed warm-up gate (R-FEED-40): pure day-counting. A "trading day" = KRX, NYSE and SIFMA all open
 * (weekday, not in the server holiday calendars), KST calendar dates; day 1 = first such date on
 * or after the KST date of created_at; live unlocks on the 6th.
 */
import { describe, expect, it } from 'vitest';
import { evaluateFeedWarmup, isWarmupTradingDay, WARMUP_TRADING_DAYS } from './feedWarmup';

const at = (kstIso: string) => Date.parse(`${kstIso}+09:00`);

function unlockOf(createdAt: string, now = '2026-11-30T12:00:00') {
	const v = evaluateFeedWarmup(createdAt, at(now));
	if (v.status === 'unverifiable') throw new Error(v.reason);
	return v.unlockDate;
}

describe('isWarmupTradingDay', () => {
	it('needs KRX, NYSE and SIFMA all open', () => {
		expect(isWarmupTradingDay('2026-11-02')).toBe(true); // plain Monday
		expect(isWarmupTradingDay('2026-11-07')).toBe(false); // Saturday
		expect(isWarmupTradingDay('2026-09-24')).toBe(false); // KRX only closed (Chuseok)
		expect(isWarmupTradingDay('2026-11-26')).toBe(false); // NYSE + SIFMA closed
		expect(isWarmupTradingDay('2026-11-11')).toBe(false); // SIFMA only closed (Veterans Day)
	});
});

describe('evaluateFeedWarmup — day counting', () => {
	it('5 plain trading days: Mon–Fri rejected, Mon (6th) unlocks', () => {
		const created = '2026-11-02T10:00:00+09:00'; // Monday
		expect(unlockOf(created)).toBe('2026-11-09');
		for (const [day, elapsed] of [
			['2026-11-02', 1],
			['2026-11-03', 2],
			['2026-11-04', 3],
			['2026-11-05', 4],
			['2026-11-06', 5]
		] as const) {
			expect(evaluateFeedWarmup(created, at(`${day}T23:59:59`))).toMatchObject({
				status: 'warming',
				elapsed,
				firstTradingDay: '2026-11-02',
				unlockDate: '2026-11-09'
			});
		}
		// weekend between the 5th and 6th day stays refused with 5 of 5
		expect(evaluateFeedWarmup(created, at('2026-11-07T12:00:00'))).toMatchObject({
			status: 'warming',
			elapsed: 5
		});
		expect(evaluateFeedWarmup(created, at('2026-11-08T23:59:59'))).toMatchObject({
			status: 'warming',
			elapsed: 5
		});
		expect(evaluateFeedWarmup(created, at('2026-11-09T00:00:00'))).toEqual({
			status: 'open',
			unlockDate: '2026-11-09'
		});
		expect(evaluateFeedWarmup(created, at('2027-01-04T00:00:00')).status).toBe('open');
	});

	it('exactly 5 trading days are counted (constant)', () => {
		expect(WARMUP_TRADING_DAYS).toBe(5);
	});

	it('a KRX holiday inside the window pushes the unlock back', () => {
		// Mon 09-21: 21,22,23 | 24,25 KRX closed | 28,29 → 6th = 30
		expect(unlockOf('2026-09-21T09:00:00+09:00')).toBe('2026-09-30');
	});

	it('a US (NYSE+SIFMA) holiday inside the window pushes the unlock back', () => {
		// Mon 11-23: 23,24,25 | 26 Thanksgiving | 27, 30 → 6th = 12-01
		expect(unlockOf('2026-11-23T09:00:00+09:00')).toBe('2026-12-01');
	});

	it('a SIFMA-only closure also counts as closed (stricter, longer warm-up)', () => {
		// Mon 11-09: 09,10 | 11 SIFMA closed | 12,13,16 → 6th = 11-17 (would be 11-16 ignoring SIFMA)
		expect(unlockOf('2026-11-09T09:00:00+09:00')).toBe('2026-11-17');
	});

	it('created on a weekend or a holiday: counting starts at the next trading day', () => {
		expect(unlockOf('2026-11-28T10:00:00+09:00')).toBe('2026-12-07'); // Saturday
		expect(unlockOf('2026-11-29T10:00:00+09:00')).toBe('2026-12-07'); // Sunday
		expect(unlockOf('2026-11-26T10:00:00+09:00')).toBe('2026-12-04'); // US holiday Thursday → day 1 = Fri 11-27
		expect(unlockOf('2026-09-24T10:00:00+09:00')).toBe('2026-10-06'); // KRX holiday Thursday → day 1 = Mon 09-28, days 28,29,30,10-01,10-02; 10-05 KRX closed
	});

	it('created after the close still counts that date as day 1', () => {
		expect(unlockOf('2026-11-02T23:30:00+09:00')).toBe('2026-11-09');
		expect(unlockOf('2026-11-02T00:01:00+09:00')).toBe('2026-11-09');
	});

	it('uses the KST date of created_at (not the UTC date)', () => {
		// 2026-11-06T16:00Z = Sat 11-07 01:00 KST (UTC date is Friday 11-06) → day 1 = Mon 11-09
		expect(unlockOf('2026-11-06T16:00:00.000000+00:00')).toBe('2026-11-17');
		// 2026-11-09T14:59:59Z = Mon 11-09 23:59:59 KST → day 1 = 11-09
		expect(unlockOf('2026-11-09T14:59:59+00:00')).toBe('2026-11-17');
		// 2026-11-09T15:00:00Z = Tue 11-10 00:00 KST → day 1 = 11-10
		expect(unlockOf('2026-11-09T15:00:00+00:00')).toBe('2026-11-18');
	});

	it('the unlock instant is the KST midnight of the 6th trading day (US Eastern clock is irrelevant)', () => {
		const created = '2026-11-20T10:00:00+09:00'; // 20,23,24,25,27 | 6th = 11-30
		// 2026-11-29T14:59:59Z = Sun 23:59:59 KST (still Sunday 09:59 in New York) → refused
		expect(evaluateFeedWarmup(created, Date.parse('2026-11-29T14:59:59Z')).status).toBe('warming');
		// 2026-11-29T15:00:00Z = Mon 00:00 KST (Sunday 10:00 in New York) → open
		expect(evaluateFeedWarmup(created, Date.parse('2026-11-29T15:00:00Z')).status).toBe('open');
	});

	it('created_at in the future of the server clock: 0 elapsed, still refused', () => {
		const v = evaluateFeedWarmup('2026-12-07T10:00:00+09:00', at('2026-11-30T12:00:00'));
		expect(v).toMatchObject({ status: 'warming', elapsed: 0, unlockDate: '2026-12-14' });
	});

	it('a key older than the calendar start is treated as long past its warm-up', () => {
		expect(evaluateFeedWarmup('2025-06-01T00:00:00Z', at('2026-11-30T12:00:00')).status).toBe(
			'open'
		);
	});
});

describe('evaluateFeedWarmup — fail closed', () => {
	const now = at('2026-11-30T12:00:00');
	it.each([null, undefined, '', '   ', 'not-a-date', 12345, {}, []])(
		'unusable created_at %j → unverifiable',
		(v) => {
			expect(evaluateFeedWarmup(v, now).status).toBe('unverifiable');
		}
	);
	it('invalid server clock → unverifiable', () => {
		expect(evaluateFeedWarmup('2026-11-02T00:00:00Z', Number.NaN).status).toBe('unverifiable');
	});
	it('created_at beyond the calendar, or too close to its end to find the unlock day → unverifiable', () => {
		expect(evaluateFeedWarmup('2028-01-03T00:00:00Z', now).status).toBe('unverifiable');
		expect(evaluateFeedWarmup('2027-12-28T00:00:00Z', now).status).toBe('unverifiable');
	});
});
