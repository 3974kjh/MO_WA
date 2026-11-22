import { describe, expect, it } from 'vitest';
import { MINUS } from './money';
import { deltaDirection, formatQty, formatSigned } from './number';
import { formatAsOf, formatKstShort } from './datetime';

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

describe('기준일 표기 formatAsOf (date-only는 시각을 지어내지 않는다)', () => {
	it('DB 형태 date-only 2026-11-20 → 11/20, 시각·KST 없음', () => {
		const v = formatAsOf('2026-11-20');
		expect(v).toBe('11/20');
		expect(v).not.toMatch(/\d{2}:\d{2}/);
		expect(v).not.toContain('KST');
	});
	it('한 자리 월·일은 0 패딩 그대로(01/05)', () => {
		expect(formatAsOf('2026-01-05')).toBe('01/05');
	});
	it('오프셋 있는 timestamp는 KST 시각 표기', () => {
		expect(formatAsOf('2026-11-20T06:30:00Z')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20T15:30:00+09:00')).toBe('11/20 15:30 KST');
	});
	it('정상 timestamptz 오프셋 형태(Z, +09:00, +0900, +09, 소수초, 공백 구분)는 그대로 KST 표기', () => {
		expect(formatAsOf('2026-11-20T06:30:00Z')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20T15:30:00+09:00')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20T15:30:00+0900')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20 15:30:00+09')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20T06:30:00.123Z')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20T00:30:00-05:00')).toBe('11/20 14:30 KST');
		expect(formatAsOf('2026-11-20 15:30:00+09:00')).toBe('11/20 15:30 KST');
		expect(formatAsOf('2026-11-20T06:30Z')).toBe('11/20 15:30 KST');
	});
	it("날짜·시각 형태가 아닌데 끝만 오프셋처럼 보이는 쓰레기는 null('11-20', 'x-12')", () => {
		expect(formatAsOf('11-20')).toBeNull();
		expect(formatAsOf('x-12')).toBeNull();
		expect(formatAsOf('2026-11')).toBeNull();
		expect(formatAsOf('foo+09:00')).toBeNull();
		expect(formatAsOf('12-31-2026-05')).toBeNull();
		expect(formatAsOf('Nov 20 2026 GMT+0900')).toBeNull();
	});
	it('오프셋 없는 timestamp는 브라우저 시간대에 따라 달라지므로 날짜만', () => {
		expect(formatAsOf('2026-11-20T00:00:00')).toBe('11/20');
	});
	it('비어 있거나 해석 불가한 값은 던지지 않고 null', () => {
		expect(formatAsOf(null)).toBeNull();
		expect(formatAsOf(undefined)).toBeNull();
		expect(formatAsOf('')).toBeNull();
		expect(formatAsOf('garbage')).toBeNull();
		expect(formatAsOf('2026-13-45T99:99:99Z')).toBeNull();
	});
});
