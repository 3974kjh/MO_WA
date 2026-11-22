/**
 * FE-03(I-8) 홈 대시보드 — 서버 load가 만든 값을 화면 카드로 바꾸는 순수 함수.
 * 값이 없으면 null/빈 배열을 돌려주고, 화면은 빈 상태를 보인다(시안 샘플 수치로 채우지 않는다).
 */

export type HomeTickerKey = 'kospi' | 'kosdaq' | 'usdkrw' | 'ust10y';

/** 지수·환율 티커 순서와 표시 이름(market_indicator_keys 시드 기준). */
export const HOME_TICKERS: ReadonlyArray<{
	key: HomeTickerKey;
	label: string;
	unit: 'pt' | 'KRW' | '%';
}> = [
	{ key: 'kospi', label: '코스피', unit: 'pt' },
	{ key: 'kosdaq', label: '코스닥', unit: 'pt' },
	{ key: 'usdkrw', label: '달러/원', unit: 'KRW' },
	{ key: 'ust10y', label: '미국채 10년', unit: '%' }
];

export type HomeIndicator = {
	key: string;
	value: number;
	change_pct: number | null;
	as_of: string;
};

export type HomePosition = {
	id: string;
	instrument_id: string;
	name: string | null;
	ticker: string | null;
	status: string;
	currency: 'KRW' | 'USD';
	qty: number | null;
	avg_price: number | null;
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	price: number | null;
	price_as_of: string | null;
	/** 평가금액(원). 가격·환율이 없으면 null — 합계에 0으로 넣지 않는다. */
	value_krw: number | null;
};

export type HomeQueueChange = { field: 'qty' | 'avg_price'; from: number | null; to: number };

export type HomeQueueItem = {
	/** position_proposals(포지션) 또는 principle_proposals(투자 원칙 개정) */
	kind: 'position' | 'principle';
	id: string;
	status: 'pending' | 'on_hold';
	change_type: string;
	name: string | null;
	ticker: string | null;
	/** 원칙 개정 요청의 조항(없으면 null). 포지션은 항상 null. */
	clause_ref: string | null;
	currency: 'KRW' | 'USD';
	changes: HomeQueueChange[];
	created_at: string;
};

/** 홈 '확인 대기'에 싣는 상태(포지션·원칙 모두 같은 기준). */
export function isHomeQueueStatus(s: string): s is HomeQueueItem['status'] {
	return s === 'pending' || s === 'on_hold';
}

/** 포지션·원칙 요청을 최신순 한 목록으로 합쳐 앞에서 limit건만 남긴다. */
export function mergeHomeQueue(
	positions: readonly HomeQueueItem[],
	principles: readonly HomeQueueItem[],
	limit: number
): HomeQueueItem[] {
	return [...positions, ...principles]
		.toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
		.slice(0, limit);
}

/**
 * 홈 '확인 대기' 일부만 읽혔을 때 카드 안에 보이는 짧은 안내(전체 오류 상태로 바꾸지 않는다).
 * 못 읽은 쪽은 목록·'외 N건'에서 빠지므로 실제보다 적을 수 있다고 밝힌다.
 */
export const HOME_QUEUE_PARTIAL_NOTE = {
	principle: '투자 원칙 개정 요청을 불러오지 못했어요. 목록과 건수가 실제보다 적을 수 있어요.',
	position: '보유 기록 변경 요청을 불러오지 못했어요. 목록과 건수가 실제보다 적을 수 있어요.',
	count: '대기 건수를 불러오지 못했어요.'
} as const;

/** 원칙 개정 요청 항목 제목: 조항이 있으면 조항, 없으면 '투자 원칙'. */
export function principleLabel(q: { clause_ref: string | null }): string {
	return q.clause_ref?.trim() || '투자 원칙';
}

/** change_type 표시명(용어집 §14). 코드는 화면에 쓰지 않는다. */
export const CHANGE_TYPE_LABEL: Record<string, string> = {
	open_holding: '신규 매수',
	set_qty_avg: '수량·평균 단가 변경',
	close: '보유 종료',
	principle: '투자 원칙 개정'
};

export function changeTypeLabel(t: string): string {
	return CHANGE_TYPE_LABEL[t] ?? '변경 요청';
}

export const CHANGE_FIELD_LABEL: Record<HomeQueueChange['field'], string> = {
	qty: '수량',
	avg_price: '평균 단가'
};

function num(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

/** 변경 요청의 수량·평균 단가 diff(제안 값이 있는 필드만). */
export function queueChanges(
	proposed: Record<string, unknown> | null | undefined,
	current: Record<string, unknown> | null | undefined
): HomeQueueChange[] {
	const out: HomeQueueChange[] = [];
	for (const field of ['qty', 'avg_price'] as const) {
		const to = num(proposed?.[field]);
		if (to == null) continue;
		out.push({ field, from: num(current?.[field]), to });
	}
	return out;
}

export function queueCurrency(
	proposed: Record<string, unknown> | null | undefined,
	current: Record<string, unknown> | null | undefined,
	fallback: 'KRW' | 'USD' = 'KRW'
): 'KRW' | 'USD' {
	const c = proposed?.currency ?? current?.currency;
	return c === 'USD' ? 'USD' : c === 'KRW' ? 'KRW' : fallback;
}

export type HoldingSummary = {
	/** 평가금액이 있는 보유 종목 수 */
	priced: number;
	/** 보유 중이지만 가격(또는 환율)이 없어 합계에서 뺀 종목 수 */
	unpriced: number;
	totalKrw: number | null;
	/** 평균 단가가 있는 종목만으로 낸 평가손익(원). 없으면 null */
	pnlKrw: number | null;
	pnlPct: number | null;
	/** 평가손익 계산에 들어간 종목 수 */
	pnlCount: number;
	/** 달러 자산 비중(%) */
	usdSharePct: number | null;
};

/**
 * 보유 요약(타일). 평가금액 없는 종목(가격 없음·환율 없는 달러 종목)은 0으로 넣지 않고 따로 센다.
 * 달러 종목 원가는 현재 환율(usdkrw)로 환산한다(평가금액과 같은 기준).
 */
export function holdingSummary(
	positions: readonly HomePosition[],
	usdkrw: number | null
): HoldingSummary {
	const held = positions.filter((p) => p.status === 'holding' && p.qty != null && p.qty > 0);
	let total = 0;
	let usd = 0;
	let priced = 0;
	let value = 0;
	let cost = 0;
	let pnlCount = 0;
	for (const p of held) {
		if (p.value_krw == null) continue;
		priced++;
		total += p.value_krw;
		if (p.currency === 'USD') usd += p.value_krw;
		if (p.avg_price == null || !(p.avg_price > 0)) continue;
		const nativeCost = p.qty! * p.avg_price;
		const costKrw =
			p.currency === 'USD' ? (usdkrw && usdkrw > 0 ? nativeCost * usdkrw : null) : nativeCost;
		if (costKrw == null) continue;
		value += p.value_krw;
		cost += costKrw;
		pnlCount++;
	}
	const totalKrw = priced > 0 ? total : null;
	const pnlKrw = pnlCount > 0 ? value - cost : null;
	return {
		priced,
		unpriced: held.length - priced,
		totalKrw,
		pnlKrw,
		pnlPct: pnlKrw != null && cost > 0 ? (pnlKrw / cost) * 100 : null,
		pnlCount,
		usdSharePct: totalKrw != null && totalKrw > 0 ? (usd / totalKrw) * 100 : null
	};
}

/** 종목 표시 이름: 이름 → 코드 → '이름 없는 종목'. */
export function positionLabel(p: { name: string | null; ticker: string | null }): string {
	return p.name?.trim() || p.ticker?.trim() || '이름 없는 종목';
}

/** 자산 비중 도넛 입력(평가금액 있는 보유 종목만). */
export function weightItems(
	positions: readonly HomePosition[]
): Array<{ label: string; value: number }> {
	return positions
		.filter((p) => p.status === 'holding' && p.value_krw != null && p.value_krw > 0)
		.map((p) => ({ label: positionLabel(p), value: p.value_krw! }));
}

/** 수익률(%) — 현재가·평균 단가가 모두 있을 때만. */
export function returnPct(p: Pick<HomePosition, 'price' | 'avg_price'>): number | null {
	if (p.price == null || p.avg_price == null || !(p.avg_price > 0)) return null;
	return ((p.price - p.avg_price) / p.avg_price) * 100;
}

/** `YYYY-MM-DD` → `11/20` (달력 날짜 그대로, 시간대 변환 없음). */
export function shortDate(d: string | null | undefined): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
	return m ? `${Number(m[2])}/${Number(m[3])}` : null;
}
