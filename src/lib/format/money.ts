/**
 * 금액 표기 (FE-02, DS §3-1 · H §10). 축약은 이 파일 한 곳에서만 한다.
 * - 금액(amount): '만 원' 축약. 단가(unit: 주가·평단·손익분기·체결가): 항상 전체 값.
 * - 음수는 유니코드 마이너스 `−`(U+2212). 저장·계산·API는 전체 원 정수만 쓴다.
 * 참고 구현: design/shared/util.js U.won / U.usd (반올림 Math.round, 1억 경계 올림 포함)
 */

export const MINUS = '\u2212';

export type Currency = 'KRW' | 'USD';
export type MoneyKind = 'amount' | 'unit';

export interface FormattedMoney {
	/** 숫자 부분(부호 포함). 예: `2,414`, `−227`, `2억 4,311`, `$1.8만` */
	text: string;
	/** 작게 표시할 단위. 예: `원`, `만 원`. 달러는 빈 문자열 */
	unit: string;
	/** 정확한 전체 값(툴팁·aria-label·시트용). 예: `24,141,484원`, `$18,400.00` */
	exact: string;
	/** 축약했는지. true면 화면에 정확한 값 단서(.tip)를 붙인다 */
	abbreviated: boolean;
}

export interface MoneyOptions {
	/** 양수에 `+`를 붙인다(손익 등) */
	plus?: boolean;
}

const nf0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const nf2fixed = new Intl.NumberFormat('ko-KR', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});
const nfUpTo2 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const nfUpTo1 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

function sign(v: number, plus?: boolean): string {
	if (v < 0) return MINUS;
	if (plus && v > 0) return '+';
	return '';
}

/**
 * 원화 금액 축약.
 * | 절댓값 | 표기 |
 * | <1만 | 전체 + 원 (9,759원) |
 * | 1만~10만 | 만 원, 소수 1자리(.0 생략) (97,590 → 9.8만 원) |
 * | 10만~1억 | 만 원, 정수 반올림 (360,000 → 36만 원, 24,141,484 → 2,414만 원) |
 * | ≥1억 | N억 M만 원 (243,105,000 → 2억 4,311만 원, M=0이면 N억 원) |
 */
export function formatWon(v: number, opts: MoneyOptions = {}): FormattedMoney {
	const a = Math.abs(v);
	const sg = sign(v, opts.plus);
	const exact = `${sg}${nf0.format(a)}원`;

	if (a < 1e4) {
		return { text: sg + nf0.format(a), unit: '원', exact, abbreviated: false };
	}
	// 9,999.5만 이상은 반올림하면 1억이 되므로 억 표기로 넘긴다(1억 경계 올림).
	if (a < 99_995_000) {
		const man = a / 1e4;
		const t = a < 1e5 ? nfUpTo1.format(Math.round(man * 10) / 10) : nf0.format(Math.round(man));
		return { text: sg + t, unit: '만 원', exact, abbreviated: true };
	}
	let eok = Math.floor(a / 1e8);
	let man = Math.round((a % 1e8) / 1e4);
	if (man >= 10_000) {
		eok += 1;
		man = 0;
	}
	const t = `${nf0.format(eok)}억${man ? ` ${nf0.format(man)}만` : ''}`;
	return { text: sg + t, unit: '원', exact, abbreviated: true };
}

/** 원화 단가: 항상 전체 값(축약 금지). 161,600원 */
export function formatWonUnit(v: number, opts: MoneyOptions = {}): FormattedMoney {
	const a = Math.abs(v);
	const sg = sign(v, opts.plus);
	const text = sg + nf0.format(a);
	return { text, unit: '원', exact: `${text}원`, abbreviated: false };
}

/**
 * 달러.
 * - 단가(unit): 항상 `$` + 소수 2자리 ($272.66)
 * - 금액 1만 달러 미만: `$` + 전체(소수 최대 2자리) ($1,820.12)
 * - 금액 1만 달러 이상: `$` + `만`, 소수 1자리(.0 생략) ($18,400 → $1.8만)
 * 음수는 `−$1.2만`.
 */
export function formatUsd(
	v: number,
	opts: MoneyOptions & { kind?: MoneyKind } = {}
): FormattedMoney {
	const a = Math.abs(v);
	const sg = sign(v, opts.plus);
	const exact = `${sg}$${nf2fixed.format(a)}`;
	if (opts.kind === 'unit') {
		return { text: exact, unit: '', exact, abbreviated: false };
	}
	if (a < 1e4) {
		return { text: `${sg}$${nfUpTo2.format(a)}`, unit: '', exact, abbreviated: false };
	}
	const man = Math.round(a / 1e3) / 10;
	return { text: `${sg}$${nfUpTo1.format(man)}만`, unit: '', exact, abbreviated: true };
}

/** Money 컴포넌트와 같은 규칙을 한 번에 고른다. */
export function formatMoney(
	v: number,
	currency: Currency = 'KRW',
	kind: MoneyKind = 'amount',
	opts: MoneyOptions = {}
): FormattedMoney {
	if (currency === 'USD') return formatUsd(v, { ...opts, kind });
	return kind === 'unit' ? formatWonUnit(v, opts) : formatWon(v, opts);
}
