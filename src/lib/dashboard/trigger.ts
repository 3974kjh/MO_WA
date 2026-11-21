/**
 * 감시 가격 거리 게이지 (G-8 확정, R-VAL-P16). 화면 전용 계산 — 서버는 가격과 감시 가격 필드만 준다.
 *
 * - below(기본): distance = (price − trigger) / trigger × 100
 * - above:       distance = (trigger − price) / trigger × 100
 * - state = distance ≤ 0 ? 'hit' : distance ≤ 3 ? 'warn' : 'idle'
 * - trigger_price == null || watch_only → 'watch'(게이지·거리·방향 숨김, direction 무시)
 * - 마커 위치 min(distance, 20) / 20, 20 초과 라벨 `20%+`
 *
 * G-8이 정하지 않은 경우: 감시 가격은 있는데 현재가가 없으면 'unpriced'(게이지·거리 숨김, 방향은 보임).
 * 감시 가격·방향은 웹에서 바꾸지 않는다.
 */
import { MINUS } from '$lib/format/money';

export type TriggerDirection = 'below' | 'above';

export const TRIGGER_WARN_PCT = 3;
export const TRIGGER_SCALE_PCT = 20;

export type TriggerInput = {
	price: number | null | undefined;
	trigger: number | null | undefined;
	direction?: TriggerDirection | null;
	watchOnly?: boolean | null;
};

export type TriggerState =
	| { state: 'watch' }
	| { state: 'unpriced'; direction: TriggerDirection }
	| { state: 'hit' | 'warn' | 'idle'; direction: TriggerDirection; distance: number };

export function triggerState(input: TriggerInput): TriggerState {
	const { price, trigger, watchOnly } = input;
	if (trigger == null || watchOnly) return { state: 'watch' };
	const direction: TriggerDirection = input.direction === 'above' ? 'above' : 'below';
	if (price == null || !Number.isFinite(price) || !Number.isFinite(trigger) || trigger <= 0) {
		return { state: 'unpriced', direction };
	}
	const distance =
		direction === 'above'
			? ((trigger - price) / trigger) * 100
			: ((price - trigger) / trigger) * 100;
	const state = distance <= 0 ? 'hit' : distance <= TRIGGER_WARN_PCT ? 'warn' : 'idle';
	return { state, direction, distance };
}

/** 마커 위치 0~1 (트랙 왼쪽 끝 = 감시 가격, 오른쪽 끝 = 20%). 도달(≤0)이면 0. */
export function gaugePosition(distance: number): number {
	return Math.max(0, Math.min(distance, TRIGGER_SCALE_PCT)) / TRIGGER_SCALE_PCT;
}

/** 거리 라벨: 도달이면 부호 그대로(−1.20% 등), 20 초과면 `20%+`, 그 밖은 `+2.35%`. */
export function distanceLabel(distance: number): string {
	if (distance <= 0) {
		const body = Math.abs(distance).toFixed(2);
		return (distance < 0 && body !== '0.00' ? MINUS : '') + body + '%';
	}
	if (distance > TRIGGER_SCALE_PCT) return `${TRIGGER_SCALE_PCT}%+`;
	return `+${distance.toFixed(2)}%`;
}

export const DIRECTION_BADGE: Record<
	TriggerDirection,
	{ icon: string; label: string; title: string }
> = {
	below: {
		icon: '▼',
		label: '이하',
		title: '이하로 내려가면(기본): 현재가가 감시 가격 이하이면 도달'
	},
	above: {
		icon: '▲',
		label: '이상(재돌파)',
		title: '이상으로 오르면(다시 넘으면): 현재가가 감시 가격 이상이면 도달'
	}
};

const ORDER: Record<TriggerState['state'], number> = {
	hit: 0,
	warn: 1,
	idle: 2,
	unpriced: 3,
	watch: 4
};

/** 목록 정렬: 도달 → 3% 이내 → 그 밖(가까운 순) → 현재가 없음 → 관심만. */
export function compareTrigger(a: TriggerState, b: TriggerState): number {
	const d = ORDER[a.state] - ORDER[b.state];
	if (d !== 0) return d;
	if ('distance' in a && 'distance' in b) return a.distance - b.distance;
	return 0;
}
