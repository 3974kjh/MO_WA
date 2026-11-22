/**
 * 테스트 전용 QueueItem 빌더. 화면 코드에서 import하지 않는다.
 * 값은 시안 샘플과 겹치지 않는 임의 숫자다.
 */
import type { QueueItem } from '$lib/queue/proposals';

export function makeItem(over: Partial<QueueItem> = {}): QueueItem {
	return {
		kind: 'position',
		id: 'id-1',
		display_id: 'P-0007',
		change_type: 'set_qty_avg',
		status: 'pending',
		proposed_by_type: 'bot',
		proposer_name: '투자 관리 봇',
		calc_note: null,
		reason: null,
		decision_note: null,
		evidence: [],
		created_at: '2026-11-21T00:00:00Z',
		held_at: null,
		decided_at: null,
		attention_started_at: null,
		acknowledged_at: null,
		base_version: 3,
		approval_version: 3,
		proposed_values: { qty: 13, avg_price: 1234 },
		applied_values: null,
		request_values: { qty: 11, avg_price: 1111, currency: 'KRW', status: 'holding' },
		live_values: { qty: 11, avg_price: 1111, currency: 'KRW', status: 'holding' },
		position_id: 'pos-1',
		instrument_id: 'inst-1',
		name: '테스트종목',
		ticker: 'TST',
		asset_type: 'stock',
		currency: 'KRW',
		clause_ref: null,
		body_preview: null,
		body_truncated: false,
		...over
	};
}
