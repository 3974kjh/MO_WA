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
		currency: c === 'USD' ? 'USD' : 'KRW'
	};
}
