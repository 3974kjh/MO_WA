import { describe, expect, it } from 'vitest';
import {
	CALENDAR_END,
	daysUntilCalendarEnd,
	isInCalendarRange,
	isRealIsoDate,
	isTradingDay,
	kstDate,
	previousTradingDay,
	tradingDaysBetween
} from './marketCalendar';

describe('marketCalendar', () => {
	it('isRealIsoDate accepts only real YYYY-MM-DD dates', () => {
		expect(isRealIsoDate('2026-11-30')).toBe(true);
		expect(isRealIsoDate('2028-02-29')).toBe(true);
		for (const bad of [
			'2026-02-30',
			'2027-02-29',
			'2026-13-01',
			'2026/11/30',
			'20261130',
			'2026-11-30T00:00:00Z',
			' 2026-11-30',
			'',
			null,
			undefined,
			20261130
		]) {
			expect(isRealIsoDate(bad)).toBe(false);
		}
	});

	it('KRX official 2026/2027 closures (incl. 6/3 election, 7/17 제헌절, 12/31)', () => {
		for (const d of ['2026-06-03', '2026-07-17', '2026-12-31', '2027-02-09', '2027-12-27']) {
			expect(isTradingDay('KRX', d)).toBe(false);
		}
		expect(isTradingDay('KRX', '2026-11-30')).toBe(true);
		expect(isTradingDay('KRX', '2026-11-26')).toBe(true); // US Thanksgiving is a KRX day
	});

	it('NYSE vs SIFMA: Good Friday 2026 is SIFMA early close only; Veterans Day is SIFMA-only', () => {
		expect(isTradingDay('NYSE', '2026-04-03')).toBe(false);
		expect(isTradingDay('SIFMA', '2026-04-03')).toBe(true);
		expect(isTradingDay('NYSE', '2026-11-11')).toBe(true);
		expect(isTradingDay('SIFMA', '2026-11-11')).toBe(false);
		expect(isTradingDay('NYSE', '2027-12-24')).toBe(false);
	});

	it('previousTradingDay skips weekends and holidays', () => {
		expect(previousTradingDay('NYSE', '2026-11-30')).toBe('2026-11-27');
		expect(previousTradingDay('NYSE', '2026-11-27')).toBe('2026-11-25');
		expect(previousTradingDay('KRX', '2026-10-06')).toBe('2026-10-02');
		expect(previousTradingDay('SIFMA', '2026-11-12')).toBe('2026-11-10');
	});

	it('refuses to walk outside the calendar range', () => {
		expect(isInCalendarRange('2028-01-03')).toBe(false);
		expect(previousTradingDay('KRX', '2026-01-02')).toBeNull();
		expect(daysUntilCalendarEnd(CALENDAR_END)).toBe(0);
	});

	it('tradingDaysBetween and kstDate', () => {
		expect(tradingDaysBetween('KRX', '2026-11-25', '2026-11-30')).toBe(2);
		expect(kstDate(Date.parse('2026-11-29T15:00:00Z'))).toBe('2026-11-30');
		expect(kstDate(Date.parse('2026-11-29T14:59:59Z'))).toBe('2026-11-29');
	});
});
