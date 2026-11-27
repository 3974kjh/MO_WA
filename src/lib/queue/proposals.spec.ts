import { describe, expect, it } from 'vitest';
import {
	buildOverrides,
	canOverride,
	checkCorrection,
	checkOverrideDraft,
	classifyActionResult,
	SUPERSEDED_TEXT,
	correctionPrefill,
	diffRows,
	FORBIDDEN_OVERRIDE_KEYS,
	isPreBlocked,
	isValueModified,
	OVERRIDE_KEYS,
	overrideKeys,
	preBlockedNote,
	prefill,
	readMine,
	sortHistory,
	badgeKind,
	type CorrectionTarget
} from './proposals';
import { makeItem } from '../../../tests/queue/testItem';

describe('고쳐서 반영 허용 키 (§7-6b · R-VAL-P07)', () => {
	it('open_holding = 수량·평균 단가·통화, set_qty_avg = 수량·평균 단가(통화 없음), close = 없음', () => {
		expect(OVERRIDE_KEYS.open_holding).toEqual(['qty', 'avg_price', 'currency']);
		expect(OVERRIDE_KEYS.set_qty_avg).toEqual(['qty', 'avg_price']);
		expect(OVERRIDE_KEYS.close).toEqual([]);
		expect(canOverride(makeItem({ change_type: 'close' }))).toBe(false);
		expect(canOverride(makeItem({ change_type: 'set_qty_avg' }))).toBe(true);
	});

	it('감시 가격·방향·손익분기·관심만은 어떤 유형에도 허용 키가 아니다', () => {
		for (const t of Object.keys(OVERRIDE_KEYS)) {
			for (const k of FORBIDDEN_OVERRIDE_KEYS) {
				expect((OVERRIDE_KEYS[t] as readonly string[]).includes(k)).toBe(false);
			}
		}
	});

	it('사용자 기록 수정(proposed_by_type=user)에는 고쳐서 반영이 없다', () => {
		expect(overrideKeys(makeItem({ proposed_by_type: 'user' }))).toEqual([]);
	});

	it('overrides는 봇 요청 값과 다른 허용 키만 담는다(trigger 등은 넣지 않음)', () => {
		const item = makeItem({
			proposed_values: { qty: 13, avg_price: 1234, trigger_price: 9 } as never
		});
		expect(buildOverrides(item, { qty: 12, avg_price: 1234 })).toEqual({ qty: 12 });
		expect(buildOverrides(item, { qty: 13, avg_price: 1234 })).toBeNull();
		const oh = makeItem({
			change_type: 'open_holding',
			proposed_values: { qty: 4, avg_price: 10.5, currency: 'USD' },
			currency: 'USD'
		});
		expect(buildOverrides(oh, { qty: 4, avg_price: 10.5, currency: 'KRW' })).toEqual({
			currency: 'KRW'
		});
	});

	it('USD 평균 단가는 2자리로 미리 채우고, 손대지 않으면 원래 4자리 값을 쓴다(D-4)', () => {
		const item = makeItem({ proposed_values: { qty: 2, avg_price: 12.3456 }, currency: 'USD' });
		const pre = prefill(item);
		expect(pre.avg_price).toBe('12.35');
		expect(readMine(item, pre).avg_price).toBe(12.3456);
		expect(readMine(item, { ...pre, avg_price: '12.40' }).avg_price).toBe(12.4);
	});
});

describe('고쳐서 반영 사유 문장 우선순위', () => {
	const item = makeItem();
	it('입력 오류 → 지금 기록과 같음 → 봇 요청 값과 같음 → 이유 없음 → 통과', () => {
		expect(checkOverrideDraft(item, { qty: 0, avg_price: 1234 }, 'x').message).toContain(
			'수량은 0보다'
		);
		expect(checkOverrideDraft(item, { qty: 12.5, avg_price: 1234 }, 'x').message).toContain(
			'1주 단위'
		);
		expect(checkOverrideDraft(item, { qty: 11, avg_price: 1111 }, 'x').message).toContain(
			'지금 기록과 같아요'
		);
		expect(checkOverrideDraft(item, { qty: 13, avg_price: 1234 }, 'x').message).toContain(
			'봇 요청 값과 같아요'
		);
		expect(checkOverrideDraft(item, { qty: 12, avg_price: 1234 }, '  ').field).toBe('reason');
		const ok = checkOverrideDraft(item, { qty: 12, avg_price: 1234 }, '체결 확인');
		expect(ok.ok).toBe(true);
		expect(ok.message).toContain('고친 항목: 수량');
	});
	it('미리 막힘·서버 결과가 가장 먼저이고 화면 문장에 규칙 코드가 없다', () => {
		const b = makeItem({ approval_version: 4 });
		const m = checkOverrideDraft(b, { qty: 12, avg_price: 1234 }, '이유');
		expect(m.ok).toBe(false);
		expect(m.message).toContain('지금은 반영할 수 없어요');
		const c = checkOverrideDraft(item, { qty: 12, avg_price: 1234 }, '이유', { conflict: true });
		expect(c.message).toContain('반영 안 됨(보유가 달라짐)');
		for (const s of [m.message, c.message]) expect(s).not.toMatch(/R-[A-Z]+-|충돌/);
	});
});

describe('미리 막힘 vs 서버 conflict (§14-4)', () => {
	it('대기·보류이고 approval_version ≠ base_version일 때만 미리 막힘', () => {
		expect(isPreBlocked(makeItem({ approval_version: 4 }))).toBe(true);
		expect(isPreBlocked(makeItem({ status: 'on_hold', approval_version: 4 }))).toBe(true);
		expect(isPreBlocked(makeItem())).toBe(false);
		expect(isPreBlocked(makeItem({ approval_version: null }))).toBe(false);
		// 서버 conflict는 미리 막힘이 아니다(배지·묶음이 다름)
		expect(isPreBlocked(makeItem({ status: 'conflict', approval_version: 4 }))).toBe(false);
		expect(badgeKind(makeItem({ approval_version: 4 }))).toBe('pending');
	});
	it('노트에 실제 수량(요청 기준 → 지금)을 쓴다', () => {
		const note = preBlockedNote(
			makeItem({ approval_version: 4, request_values: { qty: 11 }, live_values: { qty: 17 } })
		);
		expect(note).toContain('요청 기준 11주 → 지금 17주');
		expect(note).toContain('보류·거절은 할 수 있어요');
	});
});

describe('반영됨 · 값 고침 판정 (§14-4)', () => {
	const base = makeItem({ status: 'approved', proposed_values: { qty: 13, avg_price: 1234 } });
	it('허용 키만 Number() 정규화해 applied ≠ proposed일 때만', () => {
		expect(isValueModified({ ...base, applied_values: { qty: 12, avg_price: 1234 } })).toBe(true);
		expect(
			isValueModified({ ...base, applied_values: { qty: '13', avg_price: '1234.0000' } })
		).toBe(false);
		// 허용 키가 아닌 값 차이는 보지 않는다
		expect(
			isValueModified({
				...base,
				applied_values: { qty: 13, avg_price: 1234, status: 'closed' }
			})
		).toBe(false);
	});
	it('approved가 아니거나 close·사용자 기록 수정이면 쓰지 않는다', () => {
		const changed = { qty: 12, avg_price: 1234 };
		expect(isValueModified({ ...base, status: 'pending', applied_values: changed })).toBe(false);
		expect(isValueModified({ ...base, change_type: 'close', applied_values: changed })).toBe(false);
		expect(isValueModified({ ...base, proposed_by_type: 'user', applied_values: changed })).toBe(
			false
		);
		expect(badgeKind({ ...base, applied_values: changed })).toBe('modified');
	});
	it('open_holding 통화는 문자열로 비교', () => {
		const oh = makeItem({
			status: 'approved',
			change_type: 'open_holding',
			proposed_values: { qty: 1, avg_price: 2, currency: 'USD' },
			applied_values: { qty: 1, avg_price: 2, currency: 'KRW' }
		});
		expect(isValueModified(oh)).toBe(true);
	});
});

describe('지난 내역 정렬', () => {
	it('확인 필요 → 새 요청으로 바뀜·봇이 취소 → 반영됨·거절, 같은 묶음은 순서 유지', () => {
		const rows = ['approved', 'superseded', 'expired', 'rejected', 'conflict', 'cancelled'].map(
			(status, i) => ({ status, i })
		);
		expect(sortHistory(rows).map((r) => r.status)).toEqual([
			'expired',
			'conflict',
			'superseded',
			'cancelled',
			'approved',
			'rejected'
		]);
	});
});

describe('diff', () => {
	it('close는 상태와 수량(→ 0)만', () => {
		const rows = diffRows(makeItem({ change_type: 'close', proposed_values: {} }));
		expect(rows.map((r) => [r.label, r.from, r.to])).toEqual([
			['상태', '보유', '보유 종료'],
			['수량', '11주', '0주']
		]);
	});
	it('금액은 축약하지 않고, USD는 2자리 표시', () => {
		const rows = diffRows(
			makeItem({
				currency: 'USD',
				proposed_values: { qty: 13, avg_price: 123456.789 },
				live_values: { qty: 11, avg_price: 100000 }
			})
		);
		expect(rows.find((r) => r.key === 'avg_price')?.to).toBe('$123,456.79');
	});
});

describe('기록 수정 입력(§7-12)', () => {
	const t: CorrectionTarget = {
		id: 'pos-1',
		name: '테스트종목',
		status: 'holding',
		currency: 'KRW',
		qty: 11,
		avg_price: 1111,
		approval_version: 3,
		asset_type: 'stock'
	};
	it('바뀐 값이 없거나 이유가 없으면 막고, 바뀐 항목만 미리보기', () => {
		const pre = correctionPrefill(t);
		expect(checkCorrection(t, { ...pre, reason: '이유' }).message).toContain('바뀐 값이 없어요');
		expect(checkCorrection(t, { ...pre, qty: '12' }).field).toBe('reason');
		expect(checkCorrection(t, { ...pre, qty: '12.5', reason: 'x' }).message).toContain('1주 단위');
		const ok = checkCorrection(t, { ...pre, qty: '12', reason: '증권사 앱 확인' });
		expect(ok.ok).toBe(true);
		expect(ok.rows.map((r) => r.key)).toEqual(['qty']);
		expect(ok.values).toEqual({ qty: 12, avg_price: 1111, currency: 'KRW' });
	});
});

describe('폼 액션 결과 분류', () => {
	it('R-FMT-13(소수 4자리 초과)은 한국어 안내, 규칙 코드는 쓰지 않는다', () => {
		expect(
			classifyActionResult({ type: 'failure', status: 400, data: { ruleIds: ['R-FMT-13'] } })
		).toEqual({ kind: 'error', message: '평균 단가는 소수 넷째 자리까지 입력할 수 있어요.' });
	});
	it('승인 시점 재검증(source=proposed)은 봇이 보낸 값 문제라고 알리고 푸는 방법(고쳐서 반영·거절)을 안내한다', () => {
		const r = classifyActionResult({
			type: 'failure',
			status: 400,
			data: { ruleIds: ['R-FMT-13'], source: 'proposed', key: 'avg_price' }
		});
		expect(r).toMatchObject({ kind: 'error' });
		expect((r as { message: string }).message).toContain(
			'봇이 보낸 평균 단가가 소수 넷째 자리를 넘어서'
		);
		expect((r as { message: string }).message).toContain('고쳐서 반영');
		expect((r as { message: string }).message).not.toMatch(/R-[A-Z]+-\d+/);
		// 사용자 입력 문제(source 없음/override)는 기존 문구
		for (const data of [{ ruleIds: ['R-FMT-13'] }, { ruleIds: ['R-FMT-13'], source: 'override' }]) {
			expect(classifyActionResult({ type: 'failure', status: 400, data })).toEqual({
				kind: 'error',
				message: '평균 단가는 소수 넷째 자리까지 입력할 수 있어요.'
			});
		}
		// 매핑 없는 규칙은 일반 안내
		expect(
			classifyActionResult({
				type: 'failure',
				status: 400,
				data: { ruleIds: ['R-XX-99'], source: 'proposed' }
			})
		).toEqual({ kind: 'error', message: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' });
	});
	it('code SUPERSEDED는 superseded(409·conflict보다 먼저, 일반 오류 아님)', () => {
		expect(
			classifyActionResult({
				type: 'failure',
				status: 400,
				data: { code: 'SUPERSEDED', status: 'superseded', ruleIds: ['UNMAPPED'] }
			})
		).toEqual({ kind: 'superseded' });
		expect(
			classifyActionResult({ type: 'failure', status: 409, data: { code: 'SUPERSEDED' } })
		).toEqual({ kind: 'superseded' });
		// status 문자열만으로는 superseded가 아니다(서버 code가 기준).
		expect(
			classifyActionResult({ type: 'failure', status: 400, data: { status: 'superseded' } }).kind
		).toBe('error');
		expect(SUPERSEDED_TEXT).toBe('이미 새 요청으로 바뀌었어요. 새 요청을 확인해 주세요');
	});
	it('409·CONFLICT는 conflict(일반 오류 아님)', () => {
		expect(
			classifyActionResult({ type: 'failure', status: 409, data: { code: 'CONFLICT' } })
		).toEqual({
			kind: 'conflict'
		});
	});
	it('검증 오류는 한국어 문장, 서버 원문·규칙 코드는 쓰지 않는다', () => {
		const out = classifyActionResult({
			type: 'failure',
			status: 400,
			data: { message: '[R-VAL-M03] qty must be integer', ruleIds: ['R-VAL-M03'] }
		});
		expect(out.kind).toBe('error');
		if (out.kind === 'error') {
			expect(out.message).toContain('1주 단위');
			expect(out.message).not.toMatch(/R-VAL|qty/);
		}
		const other = classifyActionResult({ type: 'error' });
		expect(other).toEqual({
			kind: 'error',
			message: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
		});
	});
	it('성공이면 proposal.status를 넘긴다(expired 대비)', () => {
		expect(
			classifyActionResult({
				type: 'success',
				status: 200,
				data: { proposal: { status: 'expired' } }
			})
		).toEqual({ kind: 'ok', status: 'expired' });
	});
});
