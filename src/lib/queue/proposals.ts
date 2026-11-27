/**
 * FE-07 변경 요청(#queue) 화면 규칙 — 브라우저·서버 공용 순수 함수.
 * 명세: design-system.md §7-6·§7-6b·§7-12, handoff-fe §10 FE-07·§14-4. 시안 JS는 참고만 하고 옮기지 않았다.
 * - 코드·DB 키(change_type, status, qty …)는 그대로, 화면 문구만 용어집 v1.3.
 * - 규칙 코드(R-*)·키 이름은 화면 문장에 넣지 않는다.
 */
import { formatMoney } from '$lib/format/money';
import { formatQty, type QtyAssetType } from '$lib/format/number';
import { parseQty, type AssetType } from '$lib/schemas/qty';

export type QueueStatus =
	| 'pending'
	| 'on_hold'
	| 'approved'
	| 'rejected'
	| 'superseded'
	| 'cancelled'
	| 'conflict'
	| 'expired';

export type OverrideKey = 'qty' | 'avg_price' | 'currency';
export type Ccy = 'KRW' | 'USD';
export type FieldValues = Partial<Record<OverrideKey | 'status', unknown>>;

/** 화면 증거 칩: URL만 링크(http/https), 브리핑·매매일지는 이름만. */
export type EvidenceView = {
	kind: 'report' | 'journal' | 'url' | 'user';
	label: string;
	href: string | null;
};

/** 화면용 변경 요청 한 건(서버 load가 ProposalCard + 종목·보유 값으로 만든다). */
export type QueueItem = {
	/** position_proposals(P-) 또는 principle_proposals(R-) */
	kind: 'position' | 'principle';
	id: string;
	display_id: string;
	change_type: string;
	status: QueueStatus;
	proposed_by_type: string;
	proposer_name: string;
	calc_note: string | null;
	reason: string | null;
	decision_note: string | null;
	evidence: EvidenceView[];
	created_at: string;
	held_at: string | null;
	decided_at: string | null;
	attention_started_at: string | null;
	acknowledged_at: string | null;
	base_version: number | null;
	approval_version: number | null;
	proposed_values: FieldValues;
	applied_values: FieldValues | null;
	/** 요청 시점 값(서버 트리거 스냅샷) */
	request_values: FieldValues | null;
	/** 지금 보유 기록 값(positions). 없으면 null */
	live_values: FieldValues | null;
	position_id: string | null;
	/** 종목 id. 형제 요청 잠금(같은 종목의 position 없는 open_holding)에 쓴다. 원칙은 null */
	instrument_id: string | null;
	name: string | null;
	ticker: string | null;
	asset_type: string | null;
	currency: Ccy;
	/** 원칙 개정: 주로 바뀌는 조항(선택) */
	clause_ref: string | null;
	/** 원칙 개정: 새 본문 평문 미리보기(앞부분). 마크다운으로 렌더하지 않는다 */
	body_preview: string | null;
	body_truncated: boolean;
};

export const CHANGE_TYPE_LABEL: Record<string, string> = {
	open_holding: '신규 매수',
	set_qty_avg: '수량·평균 단가 변경',
	close: '보유 종료',
	principle: '투자 원칙 개정'
};

export function changeTypeLabel(t: string): string {
	return CHANGE_TYPE_LABEL[t] ?? '변경 요청';
}

export const FIELD_LABEL: Record<OverrideKey | 'status', string> = {
	qty: '수량',
	avg_price: '평균 단가',
	currency: '통화',
	status: '상태'
};

/** 봇 요청에 고칠 수 있는 키(approve_proposal 허용 배열과 같다). close는 없음. */
export const OVERRIDE_KEYS: Readonly<Record<string, readonly OverrideKey[]>> = {
	open_holding: ['qty', 'avg_price', 'currency'],
	set_qty_avg: ['qty', 'avg_price'],
	close: []
};

/** 봇이 직접 기록하는 값 — 어떤 시트에도 입력란을 만들지 않는다. */
export const FORBIDDEN_OVERRIDE_KEYS = [
	'trigger_price',
	'trigger_direction',
	'breakeven',
	'watch_only'
] as const;

export function overrideKeys(item: Pick<QueueItem, 'change_type' | 'proposed_by_type'>) {
	if (item.proposed_by_type === 'user') return [] as readonly OverrideKey[];
	return OVERRIDE_KEYS[item.change_type] ?? [];
}

export function canOverride(item: Pick<QueueItem, 'change_type' | 'proposed_by_type'>): boolean {
	return overrideKeys(item).length > 0;
}

export function isOpenStatus(s: string): s is 'pending' | 'on_hold' {
	return s === 'pending' || s === 'on_hold';
}

export function asStatus(s: string): QueueStatus {
	const all: QueueStatus[] = [
		'pending',
		'on_hold',
		'approved',
		'rejected',
		'superseded',
		'cancelled',
		'conflict',
		'expired'
	];
	return (all as string[]).includes(s) ? (s as QueueStatus) : 'pending';
}

/**
 * 미리 막힌 카드: 클라이언트가 positions.approval_version ≠ base_version을 아는 대기·보류 요청.
 * 배지는 확인 대기/보류 그대로이고 '확인 필요' 묶음에 넣지 않는다(서버 conflict와 다름).
 */
export function isPreBlocked(
	item: Pick<QueueItem, 'status' | 'base_version' | 'approval_version'>
): boolean {
	if (!isOpenStatus(item.status)) return false;
	if (item.base_version == null || item.approval_version == null) return false;
	return item.base_version !== item.approval_version;
}

function num(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

function qtyAsset(asset: string | null): QtyAssetType {
	return asset === 'cash' ? 'cash' : 'stock';
}

/** 값 한 칸 표기. 금액은 축약하지 않는다(단가 전체 값, USD 2자리 표시 · D-4). */
export function formatField(
	key: OverrideKey | 'status',
	v: unknown,
	ccy: Ccy,
	asset: string | null
): string {
	if (v == null || v === '') return '—';
	if (key === 'status') {
		return v === 'holding'
			? '보유'
			: v === 'planned'
				? '매수 계획'
				: v === 'closed'
					? '보유 종료'
					: '—';
	}
	if (key === 'currency') return v === 'USD' ? '달러 (USD)' : v === 'KRW' ? '원 (KRW)' : '—';
	const n = num(v);
	if (n == null) return '—';
	if (key === 'qty') return `${formatQty(n, qtyAsset(asset))}${asset === 'bond' ? '단위' : '주'}`;
	const f = formatMoney(n, ccy, 'unit');
	return `${f.text}${f.unit}`;
}

/** 미리 막힌 카드 노트용 수량(요청 기준 → 지금). 둘 중 하나라도 없으면 null. */
export function preBlockedQty(item: QueueItem): { base: string; now: string } | null {
	const b = num(item.request_values?.qty);
	const n = num(item.live_values?.qty);
	if (b == null || n == null) return null;
	return {
		base: formatField('qty', b, item.currency, item.asset_type),
		now: formatField('qty', n, item.currency, item.asset_type)
	};
}

export function preBlockedNote(item: QueueItem): string {
	const q = preBlockedQty(item);
	return `요청 뒤에 보유 수량이 바뀌었어요${q ? `(요청 기준 ${q.base} → 지금 ${q.now})` : ''}. 새 요청이 필요해요. 보류·거절은 할 수 있어요.`;
}

export type DiffRow = { key: OverrideKey | 'status'; label: string; from: string; to: string };

/**
 * '지금' 값: 대기·보류는 지금 보유 기록(없으면 요청 시점 값).
 * 지난 내역은 반영 전 값이어야 하므로 요청 시점 값을 쓴다.
 */
export function nowValues(item: QueueItem): FieldValues {
	if (!isOpenStatus(item.status)) return item.request_values ?? {};
	return item.live_values ?? item.request_values ?? {};
}

/** 카드·확인 시트의 2열 diff(항목 / 지금 / 바뀔 값). 허용 키·상태만 보인다. */
export function diffRows(item: QueueItem, values: FieldValues = item.proposed_values): DiffRow[] {
	const cur = nowValues(item);
	const f = (k: OverrideKey | 'status', v: unknown) =>
		formatField(k, v, item.currency, item.asset_type);
	if (item.change_type === 'close') {
		const rows: DiffRow[] = [
			{
				key: 'status',
				label: FIELD_LABEL.status,
				from: f('status', cur.status ?? 'holding'),
				to: '보유 종료'
			}
		];
		if (cur.qty != null)
			rows.push({ key: 'qty', label: FIELD_LABEL.qty, from: f('qty', cur.qty), to: f('qty', 0) });
		return rows;
	}
	const keys = (['qty', 'avg_price', 'currency'] as const).filter((k) => values[k] != null);
	const all = keys.map((k) => ({
		key: k,
		label: FIELD_LABEL[k],
		from: f(k, cur[k]),
		to: f(k, values[k])
	}));
	const changed = all.filter((r) => r.from !== r.to);
	return changed.length > 0 ? changed : all;
}

/** 값 비교 정규화: 숫자는 Number()(소수 4자리), 통화 등 문자열은 그대로. */
export function normValue(v: unknown): number | string | null {
	if (v == null || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	if (typeof v === 'string' && Number.isNaN(n)) return v;
	if (!Number.isFinite(n)) return String(v);
	return Math.round(n * 1e4) / 1e4;
}

/**
 * '✓ 반영됨 · 값 고침' 판정(§14-4): approved이고, 그 change_type 허용 키만 정규화해
 * applied_values ≠ proposed_values일 때만. overrides는 보지 않는다. close·사용자 기록 수정은 제외.
 */
export function isValueModified(
	item: Pick<
		QueueItem,
		'status' | 'change_type' | 'proposed_by_type' | 'applied_values' | 'proposed_values'
	>
): boolean {
	if (item.status !== 'approved') return false;
	if (item.change_type === 'close' || item.proposed_by_type === 'user') return false;
	if (!item.applied_values) return false;
	const keys = OVERRIDE_KEYS[item.change_type] ?? [];
	return keys.some(
		(k) => normValue(item.applied_values?.[k]) !== normValue(item.proposed_values?.[k])
	);
}

export type BadgeKind = QueueStatus | 'modified';

export function badgeKind(item: QueueItem): BadgeKind {
	return isValueModified(item) ? 'modified' : item.status;
}

/** '지난 내역' 정렬: 확인 필요(반영 안 됨·기한 지남) → 새 요청으로 바뀜·봇이 취소 → 반영됨·거절. 같은 묶음은 들어온 순서. */
export function historyRank(s: string): number {
	if (s === 'conflict' || s === 'expired') return 0;
	if (s === 'superseded' || s === 'cancelled') return 1;
	return 2;
}

export function sortHistory<T extends { status: string }>(rows: readonly T[]): T[] {
	return rows
		.map((r, i) => ({ r, i }))
		.sort((a, b) => historyRank(a.r.status) - historyRank(b.r.status) || a.i - b.i)
		.map((x) => x.r);
}

export function itemTitle(
	item: Pick<QueueItem, 'name' | 'ticker' | 'change_type'> & {
		kind?: QueueItem['kind'];
		clause_ref?: string | null;
	}
): string {
	if (item.kind === 'principle') {
		const c = item.clause_ref?.trim();
		return c ? `투자 원칙 개정 · ${c}` : '투자 원칙 개정';
	}
	const who = item.name?.trim() || item.ticker?.trim() || '이름 없는 종목';
	return `${who} ${changeTypeLabel(item.change_type)}`;
}

/* ── 고쳐서 반영 입력 ── */

/** 봇 평균 단가가 양수인데 소수 4자리를 넘는다(서버 R-FMT-13). 화면은 반올림해 보이므로 눈으로는 같아 보인다. */
function needsRounding(item: Pick<QueueItem, 'proposed_values'>): boolean {
	const a = item.proposed_values.avg_price;
	return typeof a === 'number' && Number.isFinite(a) && a > 0 && Number(a.toFixed(4)) !== a;
}

/** 봇 요청 값과 정확히 같은가(반올림 없이). 4자리 미만 차이도 '변경'이다(M-1). 통화는 문자열 비교. */
function sameAsBot(item: QueueItem, k: OverrideKey, v: unknown): boolean {
	const b = item.proposed_values[k];
	if (k === 'currency') return normValue(v) === normValue(b);
	return num(v) === num(b);
}

/* ── 봇이 보낸 값이 그대로는 반영 안 되는 요청(승인 시점 재검증과 같은 규칙) ── */

export type ProposedProblemRule =
	| 'R-FMT-13'
	| 'R-VAL-M02'
	| 'R-VAL-M01'
	| 'R-VAL-M03'
	| 'R-VAL-P04';
export type ProposedProblem = { ruleId: ProposedProblemRule; keys: OverrideKey[] };

/**
 * 대기·보류 봇 요청 중 봇이 보낸 값이 서버 재검증(revalidate.ts)에서 막힐 것이 확실한 건을 미리 찾는다.
 * 규칙·순서는 revalidate.ts·MCP propose 와 같다(패리티 테스트가 고정). 맞으면 null.
 * 대상: 값이 없거나(open_holding 의 qty·avg_price, set_qty_avg 둘 다), 수량/단가/통화가 규칙에 안 맞는 경우.
 */
export function proposedProblem(item: QueueItem): ProposedProblem | null {
	if (item.kind !== 'position' || !isOpenStatus(item.status)) return null;
	const keys = overrideKeys(item);
	if (keys.length === 0) return null;
	const pv = item.proposed_values;
	const has = (k: OverrideKey) => Object.hasOwn(pv, k) && pv[k] !== undefined;
	const bad: OverrideKey[] = [];
	let rule: ProposedProblemRule | null = null;
	const hit = (r: ProposedProblemRule, k: OverrideKey) => {
		rule ??= r;
		if (!bad.includes(k)) bad.push(k);
	};
	if (item.change_type === 'open_holding') {
		if (!has('qty')) hit('R-VAL-P04', 'qty');
		if (!has('avg_price')) hit('R-VAL-P04', 'avg_price');
	} else if (item.change_type === 'set_qty_avg' && !has('qty') && !has('avg_price')) {
		hit('R-VAL-P04', 'qty');
		hit('R-VAL-P04', 'avg_price');
	}
	if (has('qty')) {
		const q = pv.qty;
		if (typeof q !== 'number' || !Number.isFinite(q)) hit('R-VAL-M03', 'qty');
		else if (q <= 0) hit('R-VAL-P04', 'qty');
		else if (item.asset_type && !parseQty(item.asset_type as AssetType, q, 'holding').success)
			hit('R-VAL-M03', 'qty');
	}
	if (has('avg_price')) {
		const a = pv.avg_price;
		if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0) hit('R-VAL-M02', 'avg_price');
		else if (Number(a.toFixed(4)) !== a) hit('R-FMT-13', 'avg_price');
	}
	if (has('currency') && pv.currency !== 'KRW' && pv.currency !== 'USD') {
		hit('R-VAL-M01', 'currency');
	}
	if (item.change_type === 'open_holding' && !item.position_id && !has('currency')) {
		hit('R-VAL-M01', 'currency');
	}
	return rule ? { ruleId: rule, keys: bad } : null;
}

/** 카드·시트 안내 문장(봇 값 문제 + 푸는 방법). 규칙 코드는 넣지 않는다. */
export function proposedProblemNote(item: QueueItem): string {
	const p = proposedProblem(item);
	if (!p) return '';
	if (p.ruleId === 'R-VAL-P04' && p.keys.some((k) => !Object.hasOwn(item.proposed_values, k))) {
		return MISSING_TEXT;
	}
	if (p.ruleId === 'R-VAL-M03') return qtyProblemText(item.asset_type);
	return PROPOSED_RULE_TEXT[p.ruleId] ?? '';
}

/** 입력란 미리 채움: 봇 요청 값. USD 평균 단가는 2자리(D-4, 저장은 그대로). */
export function prefill(item: QueueItem): Record<OverrideKey, string> {
	const out: Record<OverrideKey, string> = { qty: '', avg_price: '', currency: '' };
	for (const k of overrideKeys(item)) {
		const v = item.proposed_values[k];
		if (v == null) continue;
		if (k === 'currency') out[k] = String(v);
		else if (k === 'avg_price' && needsRounding(item)) out[k] = String(Number(num(v)!.toFixed(4)));
		else if (k === 'avg_price' && item.currency === 'USD') out[k] = (num(v) ?? 0).toFixed(2);
		else out[k] = String(num(v) ?? '');
	}
	return out;
}

/**
 * 입력 문자열 → 내가 고친 값. 미리 채운 글자를 그대로 두면 봇 요청 원래 값을 쓴다.
 * 단, 봇 평균 단가가 소수 4자리를 넘으면(그대로는 반영 불가) 미리 채운 값이 4자리로 맞춘 값이므로
 * 원래 값이 아니라 그 값을 '내가 고친 값'으로 읽는다(M-1: 반올림 값이 변경으로 보내진다).
 */
export function readMine(item: QueueItem, inputs: Record<OverrideKey, string>): FieldValues {
	const pre = prefill(item);
	const out: FieldValues = {};
	for (const k of overrideKeys(item)) {
		const raw = (inputs[k] ?? '').trim();
		if (raw === pre[k] && !(k === 'avg_price' && needsRounding(item))) {
			out[k] = item.proposed_values[k] ?? null;
		} else if (k === 'currency') {
			out[k] = raw || null;
		} else {
			out[k] = raw === '' ? null : Number(raw);
		}
	}
	return out;
}

export const OVERRIDE_REASON_MAX = 120;

export type DraftCheck = {
	ok: boolean;
	/** 하단 사유 문장(항상 표시) */
	message: string;
	/** 첫 문제 필드(포커스 대상) */
	field: OverrideKey | 'reason' | null;
	/** 입력 오류(aria-invalid) 필드 */
	invalid: OverrideKey[];
};

function isIntegerAsset(asset: string | null) {
	return asset === 'stock' || asset === 'etf';
}

/**
 * 편집 시트 사유 문장 우선순위(§7-6b): ① 미리 막힘/서버 결과 ② 입력 오류 ③ 지금 기록과 같음
 * ④ 봇 요청 값과 같음 ⑤ 고친 이유 없음 → 통과.
 */
export function checkOverrideDraft(
	item: QueueItem,
	mine: FieldValues,
	reason: string,
	opts: { conflict?: boolean } = {}
): DraftCheck {
	const keys = overrideKeys(item);
	if (opts.conflict) {
		return {
			ok: false,
			message: '반영 안 됨(보유가 달라짐): 보유 기록이 바뀌어 반영하지 않았어요.',
			field: null,
			invalid: []
		};
	}
	if (isPreBlocked(item)) {
		return {
			ok: false,
			message: '지금은 반영할 수 없어요: 요청 뒤에 보유 수량이 바뀌었어요.',
			field: null,
			invalid: []
		};
	}
	const errs: string[] = [];
	const invalid: OverrideKey[] = [];
	if (keys.includes('qty')) {
		const q = num(mine.qty);
		if (q == null || !(q > 0)) {
			errs.push('수량은 0보다 커야 해요');
			invalid.push('qty');
		} else if (isIntegerAsset(item.asset_type) && !Number.isInteger(q)) {
			errs.push('주식·ETF 수량은 1주 단위로만 입력할 수 있어요');
			invalid.push('qty');
		}
	}
	if (keys.includes('avg_price')) {
		const a = num(mine.avg_price);
		if (a == null || !(a > 0)) {
			errs.push('평균 단가를 입력하세요');
			invalid.push('avg_price');
		} else if (Number(a.toFixed(4)) !== a) {
			errs.push('평균 단가는 소수점 아래 4자리까지 입력할 수 있어요');
			invalid.push('avg_price');
		}
	}
	if (keys.includes('currency') && mine.currency !== 'KRW' && mine.currency !== 'USD') {
		errs.push('통화를 고르세요');
		invalid.push('currency');
	}
	if (errs.length) {
		return {
			ok: false,
			message: `반영할 수 없어요: ${errs.join(' · ')}.`,
			field: invalid[0],
			invalid
		};
	}
	const cur = nowValues(item);
	if (item.live_values && keys.every((k) => normValue(mine[k]) === normValue(cur[k]))) {
		return {
			ok: false,
			message: '지금 기록과 같아요. 바뀌는 값이 없어 반영할 수 없어요.',
			field: keys[0] ?? null,
			invalid: []
		};
	}
	if (keys.every((k) => sameAsBot(item, k, mine[k]))) {
		return {
			ok: false,
			message: '봇 요청 값과 같아요. 그대로 반영하려면 시트를 닫고 ‘반영’을 누르세요.',
			field: keys[0] ?? null,
			invalid: []
		};
	}
	const r = reason.trim();
	if (!r || /[\r\n]/.test(reason) || [...r].length > OVERRIDE_REASON_MAX) {
		return {
			ok: false,
			message: '고친 이유를 입력해야 반영할 수 있어요(필수, 120자).',
			field: 'reason',
			invalid: []
		};
	}
	const changed = keys.filter((k) => !sameAsBot(item, k, mine[k]));
	return {
		ok: true,
		message: `확인 단계로 넘어갈 수 있어요. 고친 항목: ${changed.map((k) => FIELD_LABEL[k]).join('·')}`,
		field: null,
		invalid: []
	};
}

/** approve의 overrides: 봇 요청 값과 다른 허용 키만. 빈 객체면 null(필드를 보내지 않는다). */
export function buildOverrides(item: QueueItem, mine: FieldValues): Record<string, unknown> | null {
	const out: Record<string, unknown> = {};
	for (const k of overrideKeys(item)) {
		if (sameAsBot(item, k, mine[k])) continue;
		out[k] = k === 'currency' ? mine[k] : num(mine[k]);
	}
	return Object.keys(out).length > 0 ? out : null;
}

/** 3열 diff(항목 / 지금 / 봇 요청 값 / 내가 고친 값) — 허용 키만. */
export type Diff3Row = {
	key: OverrideKey;
	label: string;
	now: string;
	bot: string;
	mine: string;
	changed: boolean;
};

export function diff3Rows(item: QueueItem, mine: FieldValues): Diff3Row[] {
	const cur = nowValues(item);
	const f = (k: OverrideKey, v: unknown) => formatField(k, v, item.currency, item.asset_type);
	return (OVERRIDE_KEYS[item.change_type] ?? []).map((k) => ({
		key: k,
		label: FIELD_LABEL[k],
		now: f(k, cur[k]),
		bot: f(k, item.proposed_values[k]),
		mine: f(k, mine[k]),
		changed: !sameAsBot(item, k, mine[k])
	}));
}

/* ── 기록 수정(§7-12, 별개 기능) ── */

export type CorrectionTarget = {
	id: string;
	name: string;
	status: string;
	currency: Ccy;
	qty: number | null;
	avg_price: number | null;
	approval_version: number;
	asset_type: string | null;
};

export type CorrectionInputs = { qty: string; avg_price: string; currency: string; reason: string };

export function correctionPrefill(p: CorrectionTarget): CorrectionInputs {
	return {
		qty: p.qty == null ? '' : String(p.qty),
		avg_price:
			p.avg_price == null
				? ''
				: p.currency === 'USD'
					? p.avg_price.toFixed(2)
					: String(p.avg_price),
		currency: p.currency,
		reason: ''
	};
}

export type CorrectionCheck = {
	ok: boolean;
	message: string;
	field: 'qty' | 'avg_price' | 'currency' | 'reason' | null;
	values: { qty: number | null; avg_price: number | null; currency: Ccy | null };
	rows: DiffRow[];
};

export function checkCorrection(p: CorrectionTarget, inp: CorrectionInputs): CorrectionCheck {
	const pre = correctionPrefill(p);
	const qty = inp.qty.trim() === pre.qty ? p.qty : num(inp.qty.trim());
	const avg = inp.avg_price.trim() === pre.avg_price ? p.avg_price : num(inp.avg_price.trim());
	const ccy: Ccy | null = inp.currency === 'USD' ? 'USD' : inp.currency === 'KRW' ? 'KRW' : null;
	const values = { qty, avg_price: avg, currency: ccy };
	const rows: DiffRow[] = [];
	const showCcy = ccy ?? p.currency;
	if (normValue(qty) !== normValue(p.qty)) {
		rows.push({
			key: 'qty',
			label: FIELD_LABEL.qty,
			from: formatField('qty', p.qty, p.currency, p.asset_type),
			to: formatField('qty', qty, showCcy, p.asset_type)
		});
	}
	if (ccy && ccy !== p.currency) {
		rows.push({
			key: 'currency',
			label: FIELD_LABEL.currency,
			from: formatField('currency', p.currency, p.currency, p.asset_type),
			to: formatField('currency', ccy, ccy, p.asset_type)
		});
	}
	if (normValue(avg) !== normValue(p.avg_price) || (ccy && ccy !== p.currency)) {
		rows.push({
			key: 'avg_price',
			label: FIELD_LABEL.avg_price,
			from: formatField('avg_price', p.avg_price, p.currency, p.asset_type),
			to: formatField('avg_price', avg, showCcy, p.asset_type)
		});
	}
	const bad = (message: string, field: CorrectionCheck['field']): CorrectionCheck => ({
		ok: false,
		message,
		field,
		values,
		rows
	});
	if (qty == null || !(qty > 0))
		return bad('다음으로 갈 수 없어요: 수량은 0보다 커야 해요.', 'qty');
	if (isIntegerAsset(p.asset_type) && !Number.isInteger(qty)) {
		return bad('다음으로 갈 수 없어요: 주식·ETF 수량은 1주 단위로만 입력할 수 있어요.', 'qty');
	}
	if (avg == null || !(avg > 0))
		return bad('다음으로 갈 수 없어요: 평균 단가를 입력하세요.', 'avg_price');
	if (!ccy) return bad('다음으로 갈 수 없어요: 통화를 고르세요.', 'currency');
	if (rows.length === 0) {
		return bad(
			'다음으로 갈 수 없어요: 바뀐 값이 없어요. 수량·평균 단가·통화 중 하나를 바꿔 주세요.',
			'qty'
		);
	}
	const r = inp.reason.trim();
	if (!r || /[\r\n]/.test(inp.reason) || [...r].length > OVERRIDE_REASON_MAX) {
		return bad('다음으로 갈 수 없어요: 수정 이유를 한 줄 입력해 주세요(필수).', 'reason');
	}
	return {
		ok: true,
		message: '준비됐어요. 다음 화면에서 한 번 더 확인해요.',
		field: null,
		values,
		rows
	};
}

/* ── 폼 액션 결과 ── */

export type ActionOutcome =
	| { kind: 'ok'; status: string | null }
	| { kind: 'conflict' }
	| { kind: 'superseded' }
	| { kind: 'error'; message: string };

export const ACTION_ERROR_TEXT = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

/** 다른 세션에서 새 요청으로 바뀐 요청(중립 안내, 오류 톤 아님). 서버 ACTION_SUPERSEDED_MESSAGE와 같은 문구. */
export const SUPERSEDED_TEXT = '이미 새 요청으로 바뀌었어요. 새 요청을 확인해 주세요';

const RULE_TEXT: Record<string, string> = {
	'R-VAL-M03': '주식·ETF 수량은 1주 단위로만 입력할 수 있어요.',
	'R-VAL-M02': '수량·평균 단가·통화를 확인해 주세요.',
	'R-VAL-M01': '통화는 원 또는 달러만 고를 수 있어요.',
	'R-VAL-P04': '수량과 평균 단가는 0보다 큰 값으로 입력해 주세요.',
	'R-VAL-P07': '고칠 수 없는 값이 들어 있어요. 시트를 닫고 다시 시도해 주세요.',
	'R-VAL-P11': '수정 이유는 한 줄, 120자 안으로 입력해 주세요.',
	'R-FMT-13': '평균 단가는 소수 넷째 자리까지 입력할 수 있어요.'
};

/**
 * 승인 시점 재검증(서버 `source: 'proposed'`): 문제가 사용자가 입력한 값이 아니라 봇이 보낸 값에 있다.
 * 사용자 입력 안내(RULE_TEXT)와 문구가 다르다 — 어떻게 풀지(고쳐서 반영 / 거절)를 알려 준다.
 */
/** 수량 단위 안내: 괄호는 종목 종류에 맞게(주식·ETF 정수 / 현금 소수 둘째 자리), 모르면 뺀다. */
function qtyProblemText(asset: string | null): string {
	const unit =
		asset === 'stock' || asset === 'etf'
			? '(주식·ETF는 정수만)'
			: asset === 'cash'
				? '(현금은 소수 둘째 자리까지)'
				: '';
	return `봇이 보낸 수량이 0 이하이거나 이 종목에 쓸 수 없는 단위예요${unit}. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.`;
}

const MISSING_TEXT =
	'봇이 보낸 요청에 수량이나 평균 단가가 빠져 있어요. ‘고쳐서 반영’으로 값을 채우거나 거절해 주세요.';

const ARCHIVED_TEXT = {
	ARCHIVED_POSITION:
		'이 보유 기록은 보관돼 있어서 반영할 수 없어요. 거절하거나, 보관함에서 복원한 뒤 새 요청을 받아 주세요.',
	ARCHIVED_INSTRUMENT:
		'이 종목은 보관돼 있어서 반영할 수 없어요. 거절하거나, 보관함에서 복원한 뒤 새 요청을 받아 주세요.'
} as const;

const PROPOSED_RULE_TEXT: Record<string, string> = {
	'R-FMT-13':
		'봇이 보낸 평균 단가가 소수점 아래 4자리를 넘어서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.',
	'R-VAL-M02':
		'봇이 보낸 평균 단가가 숫자가 아니거나 0 이하라서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.',
	'R-VAL-M01':
		'봇이 보낸 통화가 원화·달러가 아니라서 그대로는 반영할 수 없어요. ‘고쳐서 반영’으로 값을 맞추거나 거절해 주세요.',
	'R-VAL-M03': qtyProblemText(null),
	'R-VAL-P04':
		'봇이 보낸 요청에 수량이나 평균 단가가 빠졌거나 0 이하예요. ‘고쳐서 반영’으로 값을 채우거나 거절해 주세요.',
	'R-VAL-P07': '봇이 바꿀 수 없는 항목까지 보내서 이 요청은 반영할 수 없어요. 거절해 주세요.',
	'R-PERM-13': '봇이 바꿀 수 없는 항목까지 보내서 이 요청은 반영할 수 없어요. 거절해 주세요.'
};

/**
 * SvelteKit ActionResult → 화면 결과. 서버 conflict(409 · CONFLICT)는 일반 오류가 아니다.
 * 서버 message(영문·규칙 코드)는 화면에 쓰지 않는다.
 */
export function classifyActionResult(result: {
	type: string;
	status?: number;
	data?: unknown;
}): ActionOutcome {
	const data = (result.data ?? {}) as {
		code?: unknown;
		status?: unknown;
		ruleIds?: unknown;
		source?: unknown;
		missing?: unknown;
		asset?: unknown;
		proposal?: { status?: unknown } | null;
	};
	if (result.type === 'success') {
		const s = data.proposal?.status;
		return { kind: 'ok', status: typeof s === 'string' ? s : null };
	}
	if (result.type === 'failure') {
		if (data.code === 'SUPERSEDED') return { kind: 'superseded' };
		if (result.status === 409 || data.code === 'CONFLICT' || data.status === 'conflict') {
			return { kind: 'conflict' };
		}
		if (data.code === 'ARCHIVED_POSITION' || data.code === 'ARCHIVED_INSTRUMENT') {
			return { kind: 'error', message: ARCHIVED_TEXT[data.code] };
		}
		const ids = Array.isArray(data.ruleIds) ? (data.ruleIds as unknown[]) : [];
		if (data.source === 'proposed' && data.missing === true) {
			return { kind: 'error', message: MISSING_TEXT };
		}
		const texts = data.source === 'proposed' ? PROPOSED_RULE_TEXT : RULE_TEXT;
		if (data.source === 'proposed' && ids.includes('R-VAL-M03')) {
			return {
				kind: 'error',
				message: qtyProblemText(typeof data.asset === 'string' ? data.asset : null)
			};
		}
		for (const id of ids) {
			if (typeof id === 'string' && texts[id]) return { kind: 'error', message: texts[id] };
		}
	}
	return { kind: 'error', message: ACTION_ERROR_TEXT };
}
