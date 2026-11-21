/**
 * 숫자 공통 표기 (FE-02).
 * - 등락률: 부호 필수(+1.39%, −5.21%), 유니코드 마이너스 (R-FMT-07)
 * - 수량: 주식·ETF는 정수만(Q-15 사용자 확정, R-VAL-M03). 기본은 정수 표기.
 */
import { MINUS } from './money';

export type DeltaDirection = 'up' | 'down' | 'flat';

export function deltaDirection(v: number, digits = 2): DeltaDirection {
	// 표시 자릿수에서 0으로 보이면 보합으로 본다(▲ +0.00% 방지).
	const r = Number(Math.abs(v).toFixed(digits));
	if (r === 0) return 'flat';
	return v > 0 ? 'up' : 'down';
}

/** `+1.39` / `−5.21` / `0.00` (단위 없음) */
export function formatSigned(v: number, digits = 2): string {
	const dir = deltaDirection(v, digits);
	const body = Math.abs(v).toLocaleString('ko-KR', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
	return (dir === 'up' ? '+' : dir === 'down' ? MINUS : '') + body;
}

/**
 * 수량 규칙이 정해진 자산 유형(work-breakdown v0.5 FE-02, R-VAL-M03).
 * 새 자산 유형(코인 등)의 수량 규칙은 미결이라 여기에 넣지 않는다 — 정해지면 유형을 추가한다.
 */
export type QtyAssetType = 'stock' | 'etf' | 'cash';

const QTY_MAX_FRACTION: Record<QtyAssetType, number> = { stock: 0, etf: 0, cash: 2 };

/**
 * 수량 표기: stock·etf는 정수(Q-15 사용자 확정), cash는 소수 최대 2자리.
 * 정수 유형에 소수가 들어오면 서버 검증(R-VAL-M03 ERROR)을 통과하지 못한 값이므로 반올림해 정수로만 보여준다.
 */
export function formatQty(v: number, assetType: QtyAssetType = 'stock'): string {
	const digits = QTY_MAX_FRACTION[assetType];
	const a = Math.abs(v);
	const body = (digits === 0 ? Math.round(a) : a).toLocaleString('ko-KR', {
		maximumFractionDigits: digits
	});
	return (v < 0 && body !== '0' ? MINUS : '') + body;
}
