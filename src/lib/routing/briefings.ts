/**
 * FE-04 브리핑 목록·상세 경로 도우미(서버 load와 화면이 함께 쓴다).
 *
 * - 상세 경로 `/briefings/[date]`는 daily_brief(slug `daily`) 기준이다(work-breakdown FE-04).
 *   그 밖의 리포트(주간 등)는 아직 상세 경로가 없어 링크를 만들지 않는다.
 * - 날짜는 `YYYY-MM-DD`(reports.report_date, date 타입)라 시간대 변환 없이 달력 날짜로만 다룬다.
 */
export const DAILY_BRIEF_KIND = 'daily_brief';
export const DAILY_BRIEF_SLUG = 'daily';
export const HEADLINE_MISSING = 'headline 미입력';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY = '일월화수목금토';

/** 실제 있는 달력 날짜인 `YYYY-MM-DD`만 true(2026-02-30 같은 값은 거부) */
export function isReportDate(s: string): boolean {
	const m = DATE_RE.exec(s);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const dt = new Date(Date.UTC(y, mo - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 목록 날짜 열: 일(숫자)·월·요일 */
export function dateParts(date: string): { day: number; month: number; weekday: string } | null {
	if (!isReportDate(date)) return null;
	const [y, m, d] = date.split('-').map(Number);
	return { day: d, month: m, weekday: WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** 상세 제목용 `11월 20일(금)` */
export function formatBriefingDate(date: string): string {
	const p = dateParts(date);
	return p ? `${p.month}월 ${p.day}일(${p.weekday})` : date;
}

/** headline 표시 규칙(G-5): null·빈 문자열·공백만이면 정확히 `headline 미입력`. 다른 필드로 대체하지 않는다 */
export function headlineText(headline: string | null | undefined): {
	text: string;
	missing: boolean;
} {
	const t = headline?.trim() ?? '';
	return t ? { text: t, missing: false } : { text: HEADLINE_MISSING, missing: true };
}

/** 상세로 가는 경로(쿼리 없음). daily_brief·slug daily가 아니면 null */
export function briefingDetailPath(item: {
	kind: string;
	slug?: string | null;
	report_date: string;
}): `/briefings/${string}` | null {
	if (item.kind !== DAILY_BRIEF_KIND || item.slug !== DAILY_BRIEF_SLUG) return null;
	if (!isReportDate(item.report_date)) return null;
	return `/briefings/${item.report_date}`;
}

export type MonthGroup<T> = { month: string; label: string; items: T[] };

/** report_date 내림차순으로 온 목록을 `YYYY-MM` 그룹으로 묶는다(순서 유지). 라벨 `2026년 11월` */
export function groupByMonth<T extends { report_date: string }>(
	items: readonly T[]
): MonthGroup<T>[] {
	const groups: MonthGroup<T>[] = [];
	const index = new Map<string, MonthGroup<T>>();
	for (const it of items) {
		const month = it.report_date.slice(0, 7);
		let g = index.get(month);
		if (!g) {
			g = { month, label: `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`, items: [] };
			index.set(month, g);
			groups.push(g);
		}
		g.items.push(it);
	}
	return groups;
}
