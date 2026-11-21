import { describe, expect, it } from 'vitest';
import {
	byCreatedDesc,
	byDecidedDesc,
	evidenceView,
	principleToQueueItem,
	toQueueItem,
	type CardLike
} from './view';
import {
	canOverride,
	changeTypeLabel,
	isPreBlocked,
	isValueModified,
	itemTitle
} from './proposals';

const card: CardLike = {
	id: 'c1',
	display_id: 'P-0021',
	change_type: 'set_qty_avg',
	status: 'pending',
	calc_note: null,
	reason_md: '  체결 보고  ',
	decision_note: null,
	proposed_by_type: 'bot',
	proposer_name: '투자 관리 봇',
	evidence_chips: [],
	attention_started_at: null,
	acknowledged_at: null,
	base_version: 2,
	approval_version: 3,
	proposed_values: { qty: 8, avg_price: 70.1234, trigger_price: 1 },
	applied_values: null,
	current_values: { qty: 7, avg_price: 70, currency: 'USD', breakeven: 5, trigger_price: 1 },
	position_id: 'p1',
	instrument_id: null,
	created_at: '2026-11-21T00:00:00Z',
	held_at: null,
	decided_at: null
};

describe('toQueueItem', () => {
	it('보유·종목 값을 붙이고, 허용 키·상태만 남긴다(감시 가격·손익분기는 버림)', () => {
		const item = toQueueItem(
			card,
			new Map([
				[
					'p1',
					{
						id: 'p1',
						instrument_id: 'i1',
						status: 'holding',
						currency: 'USD',
						qty: 9,
						avg_price: 71
					}
				]
			]),
			new Map([['i1', { id: 'i1', name: '종목가', ticker: 'GA', asset_type: 'etf' }]])
		);
		expect(item.name).toBe('종목가');
		expect(item.asset_type).toBe('etf');
		expect(item.currency).toBe('USD');
		expect(item.reason).toBe('체결 보고');
		expect(item.live_values).toEqual({ qty: 9, avg_price: 71, currency: 'USD', status: 'holding' });
		expect(item.proposed_values).toEqual({ qty: 8, avg_price: 70.1234 });
		expect(item.request_values).toEqual({ qty: 7, avg_price: 70, currency: 'USD' });
		expect(JSON.stringify(item)).not.toMatch(/trigger_price|breakeven/);
	});

	it('근거 링크는 http·https만, 나머지는 이름만', () => {
		const ev = evidenceView([
			{ kind: 'url', url: 'javascript:alert(1)' },
			{ kind: 'url', url: 'https://news.example.org/a' },
			{ kind: 'report', report_id: 'r' },
			{ kind: 'journal', journal_entry_id: 'j' }
		]);
		expect(ev).toEqual([
			{ kind: 'url', label: 'news.example.org', href: 'https://news.example.org/a' },
			{ kind: 'report', label: '브리핑', href: null },
			{ kind: 'journal', label: '매매일지', href: null }
		]);
	});

	it('원칙 개정 요청 → 화면 항목: R- 번호, 값 diff·고쳐서 반영·미리 막힘 없음', () => {
		const item = principleToQueueItem({
			id: 'r1',
			display_id: 'R-0011',
			status: 'approved',
			clause_ref: '  ',
			body_preview: '본문',
			body_truncated: true,
			reason_md: ' 이유 ',
			decision_note: null,
			proposed_by_type: 'bot',
			proposer_name: '투자 관리 봇',
			evidence_chips: [{ kind: 'url', url: 'ftp://x.example/a' }],
			attention_started_at: null,
			acknowledged_at: null,
			base_version: 3,
			created_at: '2026-11-21T00:00:00Z',
			held_at: null,
			decided_at: '2026-11-21T01:00:00Z'
		});
		expect(item).toMatchObject({
			kind: 'principle',
			display_id: 'R-0011',
			change_type: 'principle',
			clause_ref: null,
			body_truncated: true,
			reason: '이유',
			approval_version: null
		});
		expect(item.evidence).toEqual([]);
		expect(itemTitle(item)).toBe('투자 원칙 개정');
		expect(itemTitle({ ...item, clause_ref: '3-2' })).toBe('투자 원칙 개정 · 3-2');
		expect(changeTypeLabel('principle')).toBe('투자 원칙 개정');
		expect(canOverride(item)).toBe(false);
		expect(isPreBlocked({ ...item, status: 'pending' })).toBe(false);
		expect(isValueModified(item)).toBe(false);
	});

	it('확인 필요의 원칙 카드(ProposalCard 모양)는 kind=principle', () => {
		expect(toQueueItem({ ...card, change_type: 'principle' }, new Map(), new Map()).kind).toBe(
			'principle'
		);
		expect(toQueueItem(card, new Map(), new Map()).kind).toBe('position');
	});

	it('병합 정렬: 만든 시각·결정 시각 최신순', () => {
		const a = { created_at: '2026-11-20T00:00:00Z', decided_at: null };
		const b = { created_at: '2026-11-19T00:00:00Z', decided_at: '2026-11-21T00:00:00Z' };
		expect([b, a].sort(byCreatedDesc)).toEqual([a, b]);
		expect([a, b].sort(byDecidedDesc)).toEqual([b, a]);
	});
});
