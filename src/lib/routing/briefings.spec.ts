import { describe, expect, it } from 'vitest';
import {
	briefingDetailPath,
	dateParts,
	formatBriefingDate,
	groupByMonth,
	headlineText,
	isReportDate
} from './briefings';

describe('FE-04 브리핑 경로 도우미', () => {
	it('isReportDate: 실제 달력 날짜만', () => {
		expect(isReportDate('2026-11-20')).toBe(true);
		expect(isReportDate('2026-02-29')).toBe(false);
		expect(isReportDate('2028-02-29')).toBe(true);
		expect(isReportDate('2026-13-01')).toBe(false);
		expect(isReportDate('2026-11-20x')).toBe(false);
		expect(isReportDate('../logout')).toBe(false);
	});
	it('dateParts·formatBriefingDate: 요일은 달력 날짜 기준', () => {
		expect(dateParts('2026-11-20')).toEqual({ day: 20, month: 11, weekday: '금' });
		expect(formatBriefingDate('2026-11-22')).toBe('11월 22일(일)');
	});
	it('headline: 비거나 공백이면 정확히 `headline 미입력`', () => {
		expect(headlineText(null)).toEqual({ text: 'headline 미입력', missing: true });
		expect(headlineText('   ')).toEqual({ text: 'headline 미입력', missing: true });
		expect(headlineText(' 코스피 급락 ')).toEqual({ text: '코스피 급락', missing: false });
	});
	it('상세 경로는 daily_brief·slug daily만', () => {
		expect(
			briefingDetailPath({ kind: 'daily_brief', slug: 'daily', report_date: '2026-11-20' })
		).toBe('/briefings/2026-11-20');
		expect(
			briefingDetailPath({ kind: 'weekly_report', slug: 'weekly', report_date: '2026-11-22' })
		).toBeNull();
		expect(
			briefingDetailPath({ kind: 'daily_brief', slug: 'daily-extra', report_date: '2026-11-20' })
		).toBeNull();
	});
	it('groupByMonth: 순서를 지키며 월로 묶는다', () => {
		const g = groupByMonth([
			{ report_date: '2026-11-20' },
			{ report_date: '2026-11-03' },
			{ report_date: '2026-10-31' }
		]);
		expect(g.map((x) => [x.month, x.label, x.items.length])).toEqual([
			['2026-11', '2026년 11월', 2],
			['2026-10', '2026년 10월', 1]
		]);
	});
});
