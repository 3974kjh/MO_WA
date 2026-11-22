/**
 * 시간 표기는 항상 KST(Asia/Seoul) — R-SYS-02. 사용자 브라우저 시간대와 무관하게 같은 값을 보여준다.
 */
const TZ = 'Asia/Seoul';

const dtf = new Intl.DateTimeFormat('ko-KR', {
	timeZone: TZ,
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});

function parts(d: Date) {
	const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
	return p as Record<'month' | 'day' | 'hour' | 'minute', string>;
}

/** `11/20 17:36 KST` */
export function formatKstShort(input: Date | string | number): string {
	const p = parts(new Date(input));
	return `${p.month}/${p.day} ${p.hour}:${p.minute} KST`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * 기준일·기준 시각 표기. 없는 시각을 지어내지 않는다.
 * - 날짜만 있는 값(`2026-11-20`, date 컬럼): 달력 값을 그대로 `11/20`으로. Date로 해석하지 않는다.
 * - 오프셋이 있는 timestamp: `11/20 17:36 KST`(formatKstShort).
 * - 오프셋 없는 timestamp: 브라우저 시간대에 따라 달라지므로 날짜 부분만 `11/20`.
 * - 비었거나 해석할 수 없는 값: null (호출 쪽에서 '—' 등으로 처리). 던지지 않는다.
 */
export function formatAsOf(input: string | null | undefined): string | null {
	if (!input) return null;
	const s = input.trim();
	const d = DATE_ONLY.exec(s) ?? NAIVE_DATETIME.exec(s);
	if (d) return `${d[2]}/${d[3]}`;
	if (!HAS_OFFSET.test(s) || Number.isNaN(new Date(s).getTime())) return null;
	return formatKstShort(s);
}
