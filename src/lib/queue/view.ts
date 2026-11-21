/**
 * FE-07: 서버 load가 ProposalCard(BE-11/19) + 종목·보유 값을 화면용 QueueItem으로 바꾼다.
 * 서버 전용 모듈을 import하지 않도록 입력 모양만 구조적으로 받는다.
 */
import {
	asStatus,
	type Ccy,
	type EvidenceView,
	type FieldValues,
	type QueueItem
} from './proposals';

export type CardLike = {
	id: string;
	display_id: string;
	change_type: string;
	status: string;
	calc_note: string | null;
	reason_md: string | null;
	decision_note: string | null;
	proposed_by_type: string;
	proposer_name: string;
	evidence_chips: ReadonlyArray<
		| { kind: 'report'; report_id: string }
		| { kind: 'journal'; journal_entry_id: string }
		| { kind: 'url'; url: string }
		| { kind: 'user_statement'; text: string }
	>;
	attention_started_at: string | null;
	acknowledged_at: string | null;
	base_version: number | null;
	approval_version: number | null;
	proposed_values: Record<string, unknown>;
	applied_values: Record<string, unknown> | null;
	current_values: Record<string, unknown> | null;
	position_id: string | null;
	instrument_id: string | null;
	created_at: string;
	held_at: string | null;
	decided_at: string | null;
};

export type PositionLike = {
	id: string;
	instrument_id: string;
	status: string;
	currency: Ccy;
	qty: number | null;
	avg_price: number | null;
};

export type InstrumentLike = {
	id: string;
	name: string | null;
	ticker: string | null;
	asset_type: string | null;
};

function safeHttpUrl(raw: string): string | null {
	try {
		const u = new URL(raw);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
	} catch {
		return null;
	}
}

export function evidenceView(chips: CardLike['evidence_chips']): EvidenceView[] {
	const out: EvidenceView[] = [];
	for (const c of chips) {
		if (c.kind === 'report') out.push({ kind: 'report', label: '브리핑', href: null });
		else if (c.kind === 'journal') out.push({ kind: 'journal', label: '매매일지', href: null });
		else if (c.kind === 'url') {
			const href = safeHttpUrl(c.url);
			if (href) out.push({ kind: 'url', label: new URL(href).hostname, href });
		} else if (c.kind === 'user_statement')
			out.push({ kind: 'user', label: '직접 입력', href: null });
	}
	return out;
}

function pick(v: Record<string, unknown> | null | undefined): FieldValues | null {
	if (!v) return null;
	const out: FieldValues = {};
	for (const k of ['qty', 'avg_price', 'currency', 'status'] as const) {
		if (k in v) out[k] = v[k];
	}
	return out;
}

export function toQueueItem(
	card: CardLike,
	positions: ReadonlyMap<string, PositionLike>,
	instruments: ReadonlyMap<string, InstrumentLike>
): QueueItem {
	const pos = card.position_id ? positions.get(card.position_id) : undefined;
	const instrumentId = card.instrument_id ?? pos?.instrument_id ?? null;
	const inst = instrumentId ? instruments.get(instrumentId) : undefined;
	const c =
		card.applied_values?.currency ??
		card.proposed_values?.currency ??
		card.current_values?.currency ??
		pos?.currency;
	return {
		kind: card.change_type === 'principle' ? 'principle' : 'position',
		id: card.id,
		display_id: card.display_id,
		change_type: card.change_type,
		status: asStatus(card.status),
		proposed_by_type: card.proposed_by_type,
		proposer_name: card.proposer_name,
		calc_note: card.calc_note,
		reason: card.reason_md?.trim() || null,
		decision_note: card.decision_note?.trim() || null,
		evidence: evidenceView(card.evidence_chips ?? []),
		created_at: card.created_at,
		held_at: card.held_at,
		decided_at: card.decided_at,
		attention_started_at: card.attention_started_at,
		acknowledged_at: card.acknowledged_at,
		base_version: card.base_version,
		approval_version: card.approval_version,
		proposed_values: pick(card.proposed_values) ?? {},
		applied_values: pick(card.applied_values),
		request_values: pick(card.current_values),
		live_values: pos
			? { qty: pos.qty, avg_price: pos.avg_price, currency: pos.currency, status: pos.status }
			: null,
		position_id: card.position_id,
		name: inst?.name ?? null,
		ticker: inst?.ticker ?? null,
		asset_type: inst?.asset_type ?? null,
		currency: c === 'USD' ? 'USD' : 'KRW',
		clause_ref: null,
		body_preview: null,
		body_truncated: false
	};
}

export type PrincipleLike = {
	id: string;
	display_id: string;
	status: string;
	clause_ref: string | null;
	body_preview: string;
	body_truncated: boolean;
	reason_md: string | null;
	decision_note: string | null;
	proposed_by_type: string;
	proposer_name: string;
	evidence_chips: CardLike['evidence_chips'];
	attention_started_at: string | null;
	acknowledged_at: string | null;
	base_version: number | null;
	created_at: string;
	held_at: string | null;
	decided_at: string | null;
};

/** 원칙 개정 요청(R-) → 화면 항목. 값 diff·고쳐서 반영·미리 막힘이 없다(허용 키·approval_version 없음). */
export function principleToQueueItem(p: PrincipleLike): QueueItem {
	return {
		kind: 'principle',
		id: p.id,
		display_id: p.display_id,
		change_type: 'principle',
		status: asStatus(p.status),
		proposed_by_type: p.proposed_by_type,
		proposer_name: p.proposer_name,
		calc_note: null,
		reason: p.reason_md?.trim() || null,
		decision_note: p.decision_note?.trim() || null,
		evidence: evidenceView(p.evidence_chips ?? []),
		created_at: p.created_at,
		held_at: p.held_at,
		decided_at: p.decided_at,
		attention_started_at: p.attention_started_at,
		acknowledged_at: p.acknowledged_at,
		base_version: p.base_version,
		approval_version: null,
		proposed_values: {},
		applied_values: null,
		request_values: null,
		live_values: null,
		position_id: null,
		name: null,
		ticker: null,
		asset_type: null,
		currency: 'KRW',
		clause_ref: p.clause_ref?.trim() || null,
		body_preview: p.body_preview,
		body_truncated: p.body_truncated
	};
}

/** 최신순 병합(확인 대기 목록에서 포지션·원칙을 한 줄로). */
export function byCreatedDesc(a: { created_at: string }, b: { created_at: string }): number {
	return Date.parse(b.created_at) - Date.parse(a.created_at);
}

/** 결정 시각 최신순(없으면 만든 시각). */
export function byDecidedDesc(
	a: { decided_at: string | null; created_at: string },
	b: { decided_at: string | null; created_at: string }
): number {
	return Date.parse(b.decided_at ?? b.created_at) - Date.parse(a.decided_at ?? a.created_at);
}
