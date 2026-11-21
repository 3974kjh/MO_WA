/**
 * 차트 계산 (FE-14, DS §7-4, H §3). 화면(Svelte)과 떼어 둔 순수 함수라 서버 테스트로 검사한다.
 * 참고 구현: design/shared/charts.js(bars 축 계산, 도넛 호 계산). 그리기 좌표는 d3 scale·shape를 쓴다.
 */
import { MINUS } from '$lib/format/money';

/** 모바일 축소 기준(DS §7-4): 컨테이너 폭이 이 값보다 좁으면 높이 190, X축 눈금 4개 이내. */
export const CHART_MOBILE_MAX = 480;
export const CHART_MOBILE_HEIGHT = 190;
export const LINE_DEFAULT_HEIGHT = 260;
export const BAR_DEFAULT_HEIGHT = 200;
/** 도넛 최대 조각 수와 '기타'로 묶는 비중 기준(%) */
export const DONUT_MAX_SLICES = 8;
export const DONUT_MIN_PCT = 6;
export const DONUT_OTHER_LABEL = '기타';
/** 원래 이름이 '기타'인 개별 항목을 묶음 '기타'와 구분하는 표시 이름 */
export const DONUT_OWN_OTHER_LABEL = '기타 (개별)';
/** 숫자가 아닌 값(NaN·Infinity)의 표시 */
export const NON_FINITE = '—';
/** 카테고리 색은 chart-1~8만 쓴다(상승/하락 색 금지). */
export const CHART_COLOR_COUNT = 8;

export function isMobileChart(width: number): boolean {
	return width > 0 && width < CHART_MOBILE_MAX;
}

/** <480이면 190, 아니면 지정 높이(없으면 기본값). */
export function chartHeight(width: number, height: number | undefined, fallback: number): number {
	return isMobileChart(width) ? CHART_MOBILE_HEIGHT : (height ?? fallback);
}

/** 카테고리 색: 1부터 시작하는 순번을 chart-1~8로 돌린다. */
export function categoryColor(index: number): string {
	const n = (((index % CHART_COLOR_COUNT) + CHART_COLOR_COUNT) % CHART_COLOR_COUNT) + 1;
	return `var(--color-chart-${n})`;
}

export type TrendTone = 'up' | 'down' | 'flat';

/** 스파크라인 색: 시작보다 끝이 높으면 up(빨강), 낮으면 down(파랑), 같으면 flat(회색). */
export function trendTone(values: readonly number[]): TrendTone {
	const v = values.filter(Number.isFinite);
	if (v.length < 2) return 'flat';
	const d = v[v.length - 1] - v[0];
	return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
}

export const TONE_COLOR: Record<TrendTone, string> = {
	up: 'var(--color-up)',
	down: 'var(--color-down)',
	flat: 'var(--color-muted)'
};

export const TONE_WORD: Record<TrendTone, string> = { up: '상승', down: '하락', flat: '보합' };

/**
 * X축 눈금 위치(인덱스). 처음과 마지막은 항상 보이고, 전체 개수는 max 이하.
 * 마지막 눈금과 너무 가까운(간격의 0.6배 미만) 중간 눈금은 겹치므로 뺀다(DS §7-4 '마지막 눈금 겹치면 생략').
 */
export function xTickIndices(n: number, max: number): number[] {
	if (n <= 0) return [];
	if (n === 1) return [0];
	const limit = Math.max(2, max);
	if (n <= limit) return Array.from({ length: n }, (_, i) => i);
	const step = Math.ceil((n - 1) / (limit - 1));
	const out: number[] = [];
	for (let i = 0; i < n - 1; i += step) {
		if (i === 0 || n - 1 - i >= step * 0.6) out.push(i);
	}
	out.push(n - 1);
	while (out.length > limit) out.splice(out.length - 2, 1);
	return out;
}

/** 선 차트 X축 눈금 최대 개수: 모바일 4, 그 외 8 */
export function lineTickMax(width: number): number {
	return isMobileChart(width) ? 4 : 8;
}

/**
 * 막대 차트 세로축 범위: 0을 항상 포함하고, 값이 있는 쪽에만 12% 여유를 둔다.
 * 음수만 있으면 [lo, 0](0선이 위), 양수만 있으면 [0, hi]가 되어 축이 자연스럽다.
 */
export function barDomain(values: readonly number[]): [number, number] {
	const v = values.filter(Number.isFinite);
	let hi = Math.max(0, ...v);
	let lo = Math.min(0, ...v);
	const span = hi - lo || 1;
	if (hi > 0) hi += span * 0.12;
	if (lo < 0) lo -= span * 0.12;
	if (hi === 0 && lo === 0) hi = 1;
	return [lo, hi];
}

export interface BarShape {
	up: boolean;
	y: number;
	h: number;
	/** 값 라벨 baseline y */
	ly: number;
}

/** 막대 한 개의 도형. 비유한 값(NaN·±Infinity)은 null → 호출 쪽은 rect·값 라벨을 그리지 않는다. 유한 0은 1px 막대. */
export function barShape(value: number, y: (v: number) => number, y0: number): BarShape | null {
	if (!Number.isFinite(value)) return null;
	const yv = y(value);
	return {
		up: value >= 0,
		y: Math.min(yv, y0),
		h: Math.max(Math.abs(yv - y0), 1),
		ly: value >= 0 ? yv - 4 : yv + 12
	};
}

/**
 * 막대 값 라벨을 보일지. PC는 14개 이하면 모두, 넘으면 12개 안팎 간격.
 * 모바일(<480)은 5개 간격(DS §7-4)이고 마지막 막대는 항상 보인다. 숨긴 값은 탭 값 카드·숨김 표로 읽는다.
 */
export function barLabelVisible(i: number, n: number, mobile: boolean): boolean {
	if (i === n - 1) return true;
	if (mobile) return n <= 5 || i % 5 === 0;
	if (n <= 14) return true;
	return i % Math.ceil(n / 12) === 0;
}

/** 막대 X축 이름 눈금(인덱스): 모바일 5개, PC 12개 이내 */
export function barTickIndices(n: number, mobile: boolean): number[] {
	return xTickIndices(n, mobile ? 5 : 12);
}

/** 부호 붙은 숫자: `+1.4` / `−2.1` / `0.0` (유니코드 마이너스) */
export function signedNumber(v: number, digits: number): string {
	if (!Number.isFinite(v)) return NON_FINITE;
	const body = Math.abs(v).toLocaleString('ko-KR', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
	if (Number(Math.abs(v).toFixed(digits)) === 0) return body;
	return (v > 0 ? '+' : MINUS) + body;
}

export function plainNumber(v: number, digits: number): string {
	if (!Number.isFinite(v)) return NON_FINITE;
	const body = Math.abs(v).toLocaleString('ko-KR', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
	return (v < 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? MINUS : '') + body;
}

export interface DonutInput {
	label: string;
	/** 비중의 근거 값(%, 금액 등 같은 단위면 무엇이든). 0 이하·NaN은 뺀다 */
	value: number;
}

export interface DonutSlice {
	label: string;
	value: number;
	/** 전체 대비 % (0~100) */
	pct: number;
	/** '기타' 조각이면 묶인 원래 항목 이름들 */
	members?: string[];
	color: string;
}

/**
 * 도넛 조각 정리(DS §7-4, H §13-5):
 * 1) 6% 미만은 '기타'로 묶는다. 2) 그래도 8조각을 넘으면 작은 것부터 '기타'에 더 넣어 8조각(기타 포함)으로 맞춘다.
 * 큰 순서로 정렬하고 '기타'는 맨 뒤. 색은 순서대로 chart-1~8.
 */
export function groupDonut(items: readonly DonutInput[]): DonutSlice[] {
	const valid = items.filter((it) => Number.isFinite(it.value) && it.value > 0);
	const total = valid.reduce((a, b) => a + b.value, 0);
	if (total <= 0) return [];
	const sorted = [...valid].sort((a, b) => b.value - a.value);
	const pctOf = (v: number) => (v / total) * 100;

	let keep = sorted.filter((it) => pctOf(it.value) >= DONUT_MIN_PCT);
	let other = sorted.filter((it) => pctOf(it.value) < DONUT_MIN_PCT);
	const maxKeep = DONUT_MAX_SLICES - (other.length > 0 || keep.length > DONUT_MAX_SLICES ? 1 : 0);
	if (keep.length > maxKeep) {
		other = [...keep.slice(maxKeep), ...other];
		keep = keep.slice(0, maxKeep);
	}

	const hasGroup = other.length > 0;
	const slices: Omit<DonutSlice, 'color'>[] = keep.map((it) => ({
		label: hasGroup && it.label === DONUT_OTHER_LABEL ? DONUT_OWN_OTHER_LABEL : it.label,
		value: it.value,
		pct: pctOf(it.value)
	}));
	if (other.length > 0) {
		const v = other.reduce((a, b) => a + b.value, 0);
		slices.push({
			label: DONUT_OTHER_LABEL,
			value: v,
			pct: pctOf(v),
			members: other.map((o) => o.label)
		});
	}
	return slices.map((s, i) => ({ ...s, color: categoryColor(i) }));
}

/** 도넛 요약 문장: 큰 조각 3개 + 나머지 개수 */
export function donutSummary(title: string, slices: readonly DonutSlice[]): string {
	if (slices.length === 0) return `${title}. 데이터 없음`;
	const top = slices
		.slice(0, 3)
		.map((s) => `${s.label} ${s.pct.toFixed(1)}%`)
		.join(', ');
	const rest = slices.length > 3 ? ` 외 ${slices.length - 3}개` : '';
	return `${title}. ${top}${rest}`;
}

export interface LineSeriesInput {
	name: string;
	values: readonly number[];
}

/** 선 차트 요약 문장: 시리즈마다 시작→끝, 최고·최저 */
export function lineSummary(
	title: string,
	series: readonly LineSeriesInput[],
	labels: readonly string[],
	fmt: (v: number) => string
): string {
	const parts = series
		.map((s) => {
			const v = s.values.filter(Number.isFinite);
			if (v.length === 0) return '';
			const first = v[0];
			const last = v[v.length - 1];
			const tone = TONE_WORD[trendTone(v)];
			const range = `${labels[0] ?? ''}~${labels[labels.length - 1] ?? ''}`.replace(/^~$/, '');
			return `${s.name} ${range ? range + ' ' : ''}${fmt(first)}에서 ${fmt(last)}(${tone}), 최고 ${fmt(Math.max(...v))} 최저 ${fmt(Math.min(...v))}`;
		})
		.filter(Boolean);
	return parts.length ? `${title}. ${parts.join('; ')}` : `${title}. 데이터 없음`;
}

/** 막대 차트 요약 문장: 개수, 상승·하락 개수, 최대·최소 */
export function barSummary(
	title: string,
	items: readonly { label: string; value: number }[],
	fmt: (v: number) => string
): string {
	const v = items.filter((i) => Number.isFinite(i.value));
	if (v.length === 0) return `${title}. 데이터 없음`;
	const up = v.filter((i) => i.value > 0).length;
	const down = v.filter((i) => i.value < 0).length;
	const max = v.reduce((a, b) => (b.value > a.value ? b : a));
	const min = v.reduce((a, b) => (b.value < a.value ? b : a));
	return `${title}. ${v.length}개 중 상승 ${up}개, 하락 ${down}개. 가장 높음 ${max.label} ${fmt(max.value)}, 가장 낮음 ${min.label} ${fmt(min.value)}`;
}

/** 스파크라인 요약 문장 */
export function sparkSummary(label: string, values: readonly number[]): string {
	const v = values.filter(Number.isFinite);
	if (v.length < 2) return label;
	return `${label}, ${TONE_WORD[trendTone(v)]}`;
}

/** 포인터 X(차트 내부 좌표)에서 가장 가까운 인덱스 */
export function nearestIndex(x: number, left: number, innerWidth: number, n: number): number {
	if (n <= 1 || innerWidth <= 0) return 0;
	const i = Math.round(((x - left) / innerWidth) * (n - 1));
	return Math.min(n - 1, Math.max(0, i));
}

/** 막대(band)에서 포인터 X가 가리키는 인덱스 */
export function bandIndex(x: number, left: number, innerWidth: number, n: number): number {
	if (n <= 0 || innerWidth <= 0) return 0;
	const i = Math.floor(((x - left) / innerWidth) * n);
	return Math.min(n - 1, Math.max(0, i));
}
