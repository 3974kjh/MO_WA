import { describe, expect, it } from 'vitest';
import { formatMoney, formatUsd, formatWon, formatWonUnit, MINUS } from './money';

const won = (v: number, plus = false) => {
	const f = formatWon(v, { plus });
	return f.text + (f.unit === '원' && f.text.includes('억') ? ' ' : '') + f.unit;
};

describe('formatWon — DS §3-1 예시', () => {
	it('1만 원 미만은 전체 + 원 (9,759원), 축약 아님', () => {
		expect(won(9759)).toBe('9,759원');
		expect(formatWon(9759).abbreviated).toBe(false);
	});
	it('1만~10만: 소수 1자리 (97,590 → 9.8만 원)', () => {
		expect(won(97590)).toBe('9.8만 원');
		expect(won(10000)).toBe('1만 원'); // .0 생략
		expect(won(99_950)).toBe('10만 원');
	});
	it('10만~1억: 정수 만 원 (360,000 → 36만 원, 24,141,484 → 2,414만 원)', () => {
		expect(won(360000)).toBe('36만 원');
		expect(won(24_141_484)).toBe('2,414만 원');
		expect(won(1_820_115)).toBe('182만 원');
	});
	it('1억 이상: N억 M만 원 (243,105,000 → 2억 4,311만 원), M=0이면 N억 원', () => {
		expect(won(243_105_000)).toBe('2억 4,311만 원');
		expect(won(100_000_000)).toBe('1억 원');
	});
	it('1억 경계 올림: 99,995,000 → 1억 원, 99,994,999 → 9,999만 원, 199,995,000 → 2억 원', () => {
		expect(won(99_995_000)).toBe('1억 원');
		expect(won(99_994_999)).toBe('9,999만 원');
		expect(won(199_995_000)).toBe('2억 원');
	});
	it('음수는 유니코드 − (−227만 원)', () => {
		expect(won(-2_271_309)).toBe(`${MINUS}227만 원`);
		expect(won(-2_271_309).startsWith('-')).toBe(false);
	});
	it('plus 옵션은 양수에만 +', () => {
		expect(won(360000, true)).toBe('+36만 원');
		expect(won(0, true)).toBe('0원');
	});
	it('exact는 전체 원 값', () => {
		expect(formatWon(24_141_484).exact).toBe('24,141,484원');
		expect(formatWon(-2_271_309).exact).toBe(`${MINUS}2,271,309원`);
	});
});

describe('단가는 절대 축약하지 않는다', () => {
	it('원화 단가 전체 (161,600원 · 210,000원)', () => {
		expect(formatWonUnit(161_600).text).toBe('161,600');
		expect(formatWonUnit(210_000).exact).toBe('210,000원');
		expect(formatMoney(210_000, 'KRW', 'unit').abbreviated).toBe(false);
		expect(formatMoney(243_105_000, 'KRW', 'unit').text).toBe('243,105,000');
	});
	it('달러 단가 $272.66 전체', () => {
		expect(formatUsd(272.66, { kind: 'unit' }).text).toBe('$272.66');
		expect(formatUsd(18_400, { kind: 'unit' }).text).toBe('$18,400.00');
	});
});

describe('formatUsd 금액', () => {
	it('1만 달러 미만 전체 ($1,820.12)', () => {
		expect(formatUsd(1820.115).text).toBe('$1,820.12');
		expect(formatUsd(1820.115).abbreviated).toBe(false);
	});
	it('1만 달러 이상 $1.8만 ($18,400)', () => {
		expect(formatUsd(18_400).text).toBe('$1.8만');
		expect(formatUsd(18_400).exact).toBe('$18,400.00');
		expect(formatUsd(10_000).text).toBe('$1만');
	});
	it('음수는 −$1.2만', () => {
		expect(formatUsd(-12_000).text).toBe(`${MINUS}$1.2만`);
	});
});

describe('D-4: USD 단가는 저장 4자리 유지, 표시만 2자리', () => {
	it('12.3456 → 표시 $12.35 (exact·text 모두), 입력값은 변하지 않는다', () => {
		const stored = 12.3456;
		const f = formatMoney(stored, 'USD', 'unit');
		expect(f.text).toBe('$12.35');
		expect(f.exact).toBe('$12.35');
		expect(f.abbreviated).toBe(false);
		expect(stored).toBe(12.3456);
		expect(String(stored)).toBe('12.3456');
	});
	it('표시 자릿수는 항상 2자리(0 채움·반올림)', () => {
		expect(formatMoney(272.6549, 'USD', 'unit').text).toBe('$272.65');
		expect(formatMoney(272.6551, 'USD', 'unit').text).toBe('$272.66');
		expect(formatMoney(5, 'USD', 'unit').text).toBe('$5.00');
		expect(formatMoney(0.00004, 'USD', 'unit').text).toBe('$0.00');
		expect(formatMoney(1234.5678, 'USD', 'unit').text).toBe('$1,234.57');
	});
	it('부호: 음수는 −, plus는 +', () => {
		expect(formatMoney(-12.3456, 'USD', 'unit').text).toBe(`${MINUS}$12.35`);
		expect(formatMoney(12.3456, 'USD', 'unit', { plus: true }).text).toBe('+$12.35');
	});
	it('같은 값을 여러 번 포맷해도 값이 바뀌지 않고 결과가 같다(순수 함수)', () => {
		const a = formatMoney(12.3456, 'USD', 'unit');
		const b = formatMoney(12.3456, 'USD', 'unit');
		expect(a).toEqual(b);
	});
	it('달러 금액(1만 미만)도 소수 2자리를 넘지 않는다', () => {
		expect(formatMoney(1820.1234, 'USD', 'amount').text).toBe('$1,820.12');
		expect(formatMoney(1820.1234, 'USD', 'amount').exact).toBe('$1,820.12');
	});
	it('KRW 단가·금액 규칙은 그대로', () => {
		expect(formatMoney(161_600, 'KRW', 'unit').text).toBe('161,600');
		expect(formatMoney(24_141_484, 'KRW', 'amount').text).toBe('2,414');
	});
});
