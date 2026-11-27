import { describe, expect, it } from 'vitest';
import { revalidateMergedForApprove } from './revalidate';

const base = {
	changeType: 'set_qty_avg' as const,
	proposedByType: 'bot' as const,
	overrides: {},
	assetType: 'stock' as const
};
const run = (over: Record<string, unknown>) =>
	revalidateMergedForApprove({ ...base, ...over } as never);

describe('승인 시점 재검증 (합친 값)', () => {
	it('정상 값은 통과하고 합친 값을 돌려준다(소수 4자리 이내 허용)', () => {
		const r = run({ proposedValues: { qty: 1300, avg_price: 23090.0123 } });
		expect(r).toEqual({ ok: true, merged: { qty: 1300, avg_price: 23090.0123 } });
	});

	it('고치지 않은 proposed avg_price 가 소수 5자리면 R-FMT-13 (source=proposed)', () => {
		expect(run({ proposedValues: { avg_price: 1.00005 } })).toMatchObject({
			ok: false,
			ruleId: 'R-FMT-13',
			key: 'avg_price',
			source: 'proposed'
		});
	});

	it('사용자가 고쳐 쓴 값이 proposed 의 문제를 덮으면 통과한다(override 우선)', () => {
		expect(
			run({ proposedValues: { avg_price: 1.00005 }, overrides: { avg_price: 1.0001 } })
		).toMatchObject({ ok: true, merged: { avg_price: 1.0001 } });
	});

	it('문제 값이 override 에서 왔으면 source=override', () => {
		expect(run({ proposedValues: { qty: 5 }, overrides: { avg_price: 1.00005 } })).toMatchObject({
			ok: false,
			ruleId: 'R-FMT-13',
			source: 'override'
		});
	});

	it('avg_price 0·음수·문자열·NaN → R-VAL-M02', () => {
		for (const avg_price of [0, -1, '12', Number.NaN, null]) {
			expect(run({ proposedValues: { avg_price } })).toMatchObject({
				ok: false,
				ruleId: 'R-VAL-M02',
				key: 'avg_price'
			});
		}
	});

	it('통화가 KRW·USD 가 아니면 R-VAL-M01 (open_holding)', () => {
		expect(
			run({
				changeType: 'open_holding',
				proposedValues: { qty: 1, avg_price: 10, currency: 'EUR' }
			})
		).toMatchObject({ ok: false, ruleId: 'R-VAL-M01', key: 'currency' });
	});

	it('open_holding 은 qty·avg_price 둘 다 있어야 한다(R-VAL-P04), 고쳐서 채우면 통과', () => {
		const pv = { qty: 3 };
		expect(run({ changeType: 'open_holding', proposedValues: pv })).toMatchObject({
			ok: false,
			ruleId: 'R-VAL-P04',
			key: 'proposed_values'
		});
		expect(
			run({ changeType: 'open_holding', proposedValues: pv, overrides: { avg_price: 10 } }).ok
		).toBe(true);
	});

	it('qty 0 이하 R-VAL-P04, 숫자 아님 R-VAL-M03, 주식 소수 수량 R-VAL-M03(자산 종류 반영)', () => {
		expect(run({ proposedValues: { qty: 0 } })).toMatchObject({ ruleId: 'R-VAL-P04', key: 'qty' });
		expect(run({ proposedValues: { qty: '3' } })).toMatchObject({ ruleId: 'R-VAL-M03' });
		expect(run({ proposedValues: { qty: 2.5 } })).toMatchObject({ ruleId: 'R-VAL-M03' });
		expect(run({ proposedValues: { qty: 2.5 }, assetType: 'cash' }).ok).toBe(true);
		expect(run({ proposedValues: { qty: 2.555 }, assetType: 'cash' })).toMatchObject({
			ruleId: 'R-VAL-M03'
		});
	});

	it('set_qty_avg 는 qty·avg_price 중 하나는 있어야 한다', () => {
		expect(run({ proposedValues: {} })).toMatchObject({ ok: false, ruleId: 'R-VAL-P07' });
	});

	it('close 는 값이 없어야 하고, 값이 들어 있으면 R-PERM-13', () => {
		expect(run({ changeType: 'close', proposedValues: {} }).ok).toBe(true);
		expect(run({ changeType: 'close', proposedValues: { qty: 1 } })).toMatchObject({
			ruleId: 'R-PERM-13',
			key: 'qty'
		});
	});

	it('직접 쓰기 필드(breakeven 등)나 허용 밖 키는 거부한다(R-VAL-P07 / R-PERM-13)', () => {
		expect(run({ proposedValues: { qty: 1, breakeven: 5 } })).toMatchObject({
			ruleId: 'R-VAL-P07',
			key: 'breakeven'
		});
		expect(run({ proposedValues: { qty: 1, status: 'closed' } })).toMatchObject({
			ruleId: 'R-PERM-13',
			key: 'status'
		});
		// 봇의 set_qty_avg 에는 currency 가 허용되지 않는다(사용자 정정만 허용, DB 트리거와 같음)
		expect(run({ proposedValues: { qty: 1, currency: 'KRW' } })).toMatchObject({
			ruleId: 'R-PERM-13',
			key: 'currency'
		});
		expect(run({ proposedValues: { qty: 1, currency: 'KRW' }, proposedByType: 'user' }).ok).toBe(
			true
		);
	});

	it('proposed_values 가 객체가 아니면 거부(null·배열·문자열)', () => {
		for (const proposedValues of [null, [], 'x', undefined]) {
			expect(run({ proposedValues })).toMatchObject({ ok: false, ruleId: 'R-VAL-P07' });
		}
	});

	it('가격 경계: 23090.01 통과, 1.00005·소수 6자리 거부, 아주 큰 정상 값 통과', () => {
		expect(run({ proposedValues: { avg_price: 23090.01 } }).ok).toBe(true);
		expect(run({ proposedValues: { avg_price: 9999999.1234 } }).ok).toBe(true);
		expect(run({ proposedValues: { avg_price: 10.123456 } })).toMatchObject({
			ruleId: 'R-FMT-13'
		});
	});
});
