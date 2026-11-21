import { describe, expect, it } from 'vitest';
import { MINUS } from './money';
import { deltaDirection, formatQty, formatSigned } from './number';
import { formatKstShort } from './datetime';

describe('Delta 부호·방향 (결정 ④ 전 종목 한국식)', () => {
	it('>0 up, <0 down, 0 flat', () => {
		expect(deltaDirection(1.39)).toBe('up');
		expect(deltaDirection(-5.21)).toBe('down');
		expect(deltaDirection(0)).toBe('flat');
		expect(deltaDirection(0.001)).toBe('flat'); // 표시 자릿수에서 0
	});
	it('부호 + 유니코드 마이너스', () => {
		expect(formatSigned(1.39)).toBe('+1.39');
		expect(formatSigned(-5.21)).toBe(`${MINUS}5.21`);
		expect(formatSigned(0)).toBe('0.00');
		expect(formatSigned(-8.6, 1)).toBe(`${MINUS}8.6`);
	});
});

describe('formatQty(v, assetType) — R-VAL-M03 / Q-15', () => {
	it('stock·etf는 정수 표기(기본 stock)', () => {
		expect(formatQty(27)).toBe('27');
		expect(formatQty(1200, 'stock')).toBe('1,200');
		expect(formatQty(30, 'etf')).toBe('30');
		expect(formatQty(5.4, 'etf')).toBe('5');
	});
	it('cash는 소수 최대 2자리', () => {
		expect(formatQty(1234.567, 'cash')).toBe('1,234.57');
		expect(formatQty(10, 'cash')).toBe('10');
		expect(formatQty(0.5, 'cash')).toBe('0.5');
	});
	it('음수는 유니코드 −', () => {
		expect(formatQty(-3)).toBe(`${MINUS}3`);
	});
});

describe('KST 시간 표기 (R-SYS-02)', () => {
	it('UTC 입력을 KST로 보여준다', () => {
		expect(formatKstShort('2026-11-20T08:36:00Z')).toBe('11/20 17:36 KST');
		expect(formatKstShort('2026-11-20T17:36:00+09:00')).toBe('11/20 17:36 KST');
	});
});
