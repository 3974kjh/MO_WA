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
	diff3Rows,
	proposedProblem,
	proposedProblemNote,
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
			'봇이 보낸 평균 단가가 소수점 아래 4자리를 넘어서'
		);
		expect((r as { message: string }).message).toContain('고쳐서 반영');
		expect((r as { message: string }).message).not.toMatch(/R-[A-Z]+-\d+/);
		expect(
			(
				classifyActionResult({
					type: 'failure',
					status: 400,
					data: { ruleIds: ['R-VAL-M02'], source: 'proposed' }
				}) as { message: string }
			).message
		).toContain('숫자가 아니거나 0 이하');
		expect(
			(
				classifyActionResult({
					type: 'failure',
					status: 400,
					data: { ruleIds: ['R-VAL-M03'], source: 'proposed', asset: 'stock' }
				}) as { message: string }
			).message
		).toContain('이 종목에 쓸 수 없는 단위예요(주식·ETF는 정수만)');
		expect(
			(
				classifyActionResult({
					type: 'failure',
					status: 400,
					data: { ruleIds: ['R-VAL-P07'], source: 'proposed' }
				}) as { message: string }
			).message
		).toBe('봇이 바꿀 수 없는 항목까지 보내서 이 요청은 반영할 수 없어요. 거절해 주세요.');
		expect(
			(
				classifyActionResult({
					type: 'failure',
					status: 400,
					data: { ruleIds: ['R-PERM-13'], source: 'proposed' }
				}) as { message: string }
			).message
		).toBe('봇이 바꿀 수 없는 항목까지 보내서 이 요청은 반영할 수 없어요. 거절해 주세요.');
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

/* ── M-1: 반올림 표시와 '고쳐서 반영' 루프 ── */
describe('M-1: 봇 평균 단가가 소수 5자리 이상일 때(화면은 반올림해 보임)', () => {
	const usd = (v: number) =>
		makeItem({
			currency: 'USD',
			proposed_values: { qty: 5, avg_price: v },
			live_values: { qty: 4, avg_price: 1, currency: 'USD', status: 'holding' }
		});
	const krw = (v: number) =>
		makeItem({
			currency: 'KRW',
			proposed_values: { qty: 5, avg_price: v },
			live_values: { qty: 4, avg_price: 1, currency: 'KRW', status: 'holding' }
		});

	for (const [name, mk, v, rounded] of [
		['USD 1.00005', usd, 1.00005, '1.0001'],
		['KRW 100.00005', krw, 100.00005, '100.0001']
	] as const) {
		it(`${name}: 문제로 표시되고 입력칸에는 4자리로 맞춘 값이 채워진다(2자리 '1.00' 아님)`, () => {
			const item = mk(v);
			expect(proposedProblem(item)).toEqual({ ruleId: 'R-FMT-13', keys: ['avg_price'] });
			expect(prefill(item).avg_price).toBe(rounded);
			expect(proposedProblemNote(item)).toContain('소수점 아래 4자리를 넘어서');
		});

		it(`${name}: 채워진 값을 그대로 두면 변경으로 읽어 overrides 로 보낸다(루프 없음)`, () => {
			const item = mk(v);
			const mine = readMine(item, { ...prefill(item) });
			expect(mine.avg_price).toBe(Number(rounded));
			expect(buildOverrides(item, mine)).toEqual({ avg_price: Number(rounded) });
			expect(diff3Rows(item, mine).find((r) => r.key === 'avg_price')?.changed).toBe(true);
			const check = checkOverrideDraft(item, mine, '4자리로 맞춤');
			expect(check.ok).toBe(true);
			expect(checkOverrideDraft(item, mine, '').message).not.toContain('봇 요청 값과 같아요');
			expect(checkOverrideDraft(item, mine, '').field).toBe('reason');
		});

		it(`${name}: 사용자가 다른 4자리 값을 입력해도 그 값이 보내진다`, () => {
			const item = mk(v);
			const mine = readMine(item, { ...prefill(item), avg_price: '1.5' });
			expect(buildOverrides(item, mine)).toEqual({ avg_price: 1.5 });
		});
	}

	it('사용자가 5자리 이상을 직접 입력하면 입력 오류로 막는다(서버 R-FMT-13 과 같은 규칙)', () => {
		const item = usd(1.00005);
		const mine = readMine(item, { ...prefill(item), avg_price: '2.00005' });
		const c = checkOverrideDraft(item, mine, '이유');
		expect(c).toMatchObject({ ok: false, field: 'avg_price', invalid: ['avg_price'] });
		expect(c.message).toContain('소수점 아래 4자리');
		expect(c.message).not.toMatch(/R-[A-Z]+-\d+/);
	});

	it('4자리 이내 값은 문제 없음: 2자리 표시로 두면 원래 값을 그대로 쓴다(변경 아님)', () => {
		const item = usd(1.2345);
		expect(proposedProblem(item)).toBeNull();
		expect(prefill(item).avg_price).toBe('1.23');
		const mine = readMine(item, { ...prefill(item) });
		expect(mine.avg_price).toBe(1.2345);
		expect(buildOverrides(item, mine)).toBeNull();
		expect(checkOverrideDraft(item, mine, '').message).toContain('봇 요청 값과 같아요');
	});

	it('4자리 미만 차이(1.2345 → 1.23)도 변경으로 센다(반올림 비교로 지워지지 않는다)', () => {
		const item = usd(1.2345);
		const mine = readMine(item, { ...prefill(item), avg_price: '1.2346' });
		expect(buildOverrides(item, mine)).toEqual({ avg_price: 1.2346 });
	});

	it('이미 처리된(approved 등) 요청과 close·사용자 기록 수정은 문제로 보지 않는다', () => {
		expect(proposedProblem({ ...usd(1.00005), status: 'approved' })).toBeNull();
		expect(proposedProblem({ ...usd(1.00005), change_type: 'close' })).toBeNull();
		expect(proposedProblem({ ...usd(1.00005), proposed_by_type: 'user' })).toBeNull();
	});
});

describe('proposedProblem: 서버 재검증과 같은 규칙으로 미리 찾기', () => {
	const mk = (pv: Record<string, unknown>, over = {}) =>
		makeItem({ proposed_values: pv as never, ...over });
	it.each([
		[{ qty: 2, avg_price: 0 }, 'R-VAL-M02', ['avg_price']],
		[{ qty: 2, avg_price: -1 }, 'R-VAL-M02', ['avg_price']],
		[{ qty: 2, avg_price: '5' }, 'R-VAL-M02', ['avg_price']],
		[{ qty: 0 }, 'R-VAL-P04', ['qty']],
		[{ qty: -3 }, 'R-VAL-P04', ['qty']],
		[{ qty: 1.5 }, 'R-VAL-M03', ['qty']],
		[{ qty: '3' }, 'R-VAL-M03', ['qty']],
		[{ qty: 2, avg_price: 1.00005 }, 'R-FMT-13', ['avg_price']],
		[{}, 'R-VAL-P04', ['qty', 'avg_price']]
	])('set_qty_avg %j → %s', (pv, rule, keys) => {
		expect(proposedProblem(mk(pv))).toEqual({ ruleId: rule, keys });
	});
	it('정상 값·KRW 큰 단가는 문제 없음', () => {
		expect(proposedProblem(mk({ qty: 10, avg_price: 70000 }))).toBeNull();
		expect(proposedProblem(mk({ avg_price: 23090.0123 }))).toBeNull();
	});
	it('open_holding: 값 누락·통화 오류·포지션 없는 새 보유의 통화 누락', () => {
		const oh = (pv: Record<string, unknown>, over = {}) =>
			mk(pv, { change_type: 'open_holding', ...over });
		expect(proposedProblem(oh({ qty: 3, currency: 'KRW' }))?.ruleId).toBe('R-VAL-P04');
		expect(proposedProblem(oh({ qty: 3, avg_price: 1, currency: 'EUR' }))).toEqual({
			ruleId: 'R-VAL-M01',
			keys: ['currency']
		});
		expect(proposedProblem(oh({ qty: 3, avg_price: 1 }, { position_id: null }))).toEqual({
			ruleId: 'R-VAL-M01',
			keys: ['currency']
		});
		expect(proposedProblem(oh({ qty: 3, avg_price: 1 }))).toBeNull(); // 포지션 있음: 통화는 기존 값
		expect(
			proposedProblem(oh({ qty: 3, avg_price: 1, currency: 'USD' }, { position_id: null }))
		).toBeNull();
	});
	it('L-B: 통화 누락과 잘못된 통화는 안내 문구가 다르다(고쳐서 반영으로 통화를 고름)', () => {
		const oh = (pv: Record<string, unknown>, over = {}) =>
			mk(pv, { change_type: 'open_holding', position_id: null, ...over });
		const missing = proposedProblemNote(oh({ qty: 3, avg_price: 1 }));
		expect(missing).toBe(
			'봇이 보낸 요청에 통화가 빠져 있어요. ‘고쳐서 반영’으로 통화를 고르거나 거절해 주세요.'
		);
		expect(missing).not.toContain('수량이나 평균 단가');
		expect(missing).not.toContain('원화·달러가 아니라서');
		const invalid = proposedProblemNote(oh({ qty: 3, avg_price: 1, currency: 'EUR' }));
		expect(invalid).toContain('통화가 원화·달러가 아니라서');
		expect(invalid).toContain('고쳐서 반영');
		expect(invalid).not.toBe(missing);
	});
	it('Nit-1: legacy {currency:null}은 통화 누락이 아니라 잘못된 통화로 안내한다', () => {
		const oh = (pv: Record<string, unknown>, over = {}) =>
			mk(pv, { change_type: 'open_holding', position_id: null, ...over });
		const legacy = oh({ qty: 3, avg_price: 1, currency: null });
		expect(proposedProblem(legacy)).toEqual({ ruleId: 'R-VAL-M01', keys: ['currency'] });
		const note = proposedProblemNote(legacy);
		expect(note).toContain('통화가 원화·달러가 아니라서');
		expect(note).not.toContain('통화가 빠져 있어요');
		expect(note).not.toBe(proposedProblemNote(oh({ qty: 3, avg_price: 1 })));
		// 서버 안내도 동일: missing 이 아니면(값이 있으나 무효) 누락 문구가 아니다.
		const server = classifyActionResult({
			type: 'failure',
			status: 400,
			data: { ruleIds: ['R-VAL-M01'], source: 'proposed' }
		}) as { message: string };
		expect(server.message).toContain('통화가 원화·달러가 아니라서');
		expect(server.message).not.toContain('통화가 빠져 있어요');
	});
	it('수량 단위 안내는 종목 종류에 맞는다(주식·ETF 정수 / 현금 둘째 자리 / 그 밖은 괄호 없음)', () => {
		expect(proposedProblemNote(mk({ qty: 1.5 }, { asset_type: 'stock' }))).toContain(
			'(주식·ETF는 정수만)'
		);
		expect(proposedProblemNote(mk({ qty: 1.555 }, { asset_type: 'cash' }))).toContain(
			'(현금은 소수 둘째 자리까지)'
		);
		const n = proposedProblemNote(mk({ qty: 0 }, { asset_type: 'bond' }));
		expect(n).not.toContain('(');
		expect(n).toContain('고쳐서 반영');
	});
	it('안내 문장에는 규칙 코드가 없다', () => {
		for (const pv of [{ qty: 0 }, { avg_price: 0 }, { avg_price: 1.00005 }, {}]) {
			expect(proposedProblemNote(mk(pv))).not.toMatch(/R-[A-Z]+-\d+/);
		}
		expect(
			proposedProblemNote(
				mk({ qty: 3, avg_price: 1 }, { change_type: 'open_holding', position_id: null })
			)
		).not.toMatch(/R-[A-Z]+-\d+/);
	});
});

describe('Nit-2·G3: 사용자 입력 문구와 보관 오류 문구', () => {
	const cls = (data: Record<string, unknown>) =>
		classifyActionResult({ type: 'failure', status: 400, data }) as { message: string };
	it('R-VAL-P04·R-VAL-M01(사용자 입력)은 일반 문구가 아니라 전용 문구', () => {
		expect(cls({ ruleIds: ['R-VAL-P04'] }).message).toBe(
			'수량과 평균 단가는 0보다 큰 값으로 입력해 주세요.'
		);
		expect(cls({ ruleIds: ['R-VAL-M01'] }).message).toBe('통화는 원 또는 달러만 고를 수 있어요.');
	});
	it('봇 값이 비어서 막힌 경우(missing)는 거절만이 아니라 고쳐서 반영을 안내한다', () => {
		for (const ruleId of ['R-VAL-P07', 'R-VAL-P04']) {
			const m = cls({ ruleIds: [ruleId], source: 'proposed', missing: true }).message;
			expect(m).toContain('고쳐서 반영');
			expect(m).toContain('수량이나 평균 단가가 빠져 있어요');
		}
		const cur = cls({ ruleIds: ['R-VAL-M01'], source: 'proposed', missing: true }).message;
		expect(cur).toBe(
			'봇이 보낸 요청에 통화가 빠져 있어요. ‘고쳐서 반영’으로 통화를 고르거나 거절해 주세요.'
		);
		expect(cur).not.toContain('수량이나 평균 단가');
		expect(cur).not.toContain('원화·달러가 아니라서');
		// 비어 있지 않은 P07(바꿀 수 없는 항목)은 그대로 거절 안내
		expect(cls({ ruleIds: ['R-VAL-P07'], source: 'proposed' }).message).toContain('거절해 주세요');
		expect(cls({ ruleIds: ['R-VAL-P07'], source: 'proposed' }).message).not.toContain(
			'고쳐서 반영'
		);
	});
	it('보관된 보유 기록·종목은 코드로 구분해 서로 다른 문구, 규칙 코드·영문 없음', () => {
		const a = cls({ code: 'ARCHIVED_POSITION', ruleIds: ['R-VAL-P02'] }).message;
		const b = cls({ code: 'ARCHIVED_INSTRUMENT', ruleIds: ['R-VAL-P02'] }).message;
		expect(a).toContain('보유 기록은 보관');
		expect(b).toContain('종목은 보관');
		expect(a).not.toBe(b);
		for (const m of [a, b]) {
			expect(m).toContain('거절');
			expect(m).not.toMatch(/R-[A-Z]+-\d+|archived/);
		}
	});
});
