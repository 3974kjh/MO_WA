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
