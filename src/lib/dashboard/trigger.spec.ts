import { describe, expect, it } from 'vitest';
import {
	compareTrigger,
	DIRECTION_BADGE,
	distanceLabel,
	gaugePosition,
	triggerState,
	type TriggerState
} from './trigger';

describe('G-8 감시 가격 거리(triggerState)', () => {
	it('below(기본): (현재가 − 감시 가격) / 감시 가격 × 100', () => {
		const t = triggerState({ price: 110, trigger: 100 });
		expect(t).toMatchObject({ state: 'idle', direction: 'below' });
		expect('distance' in t && t.distance).toBeCloseTo(10);
	});
	it('above: (감시 가격 − 현재가) / 감시 가격 × 100', () => {
		const t = triggerState({ price: 98, trigger: 100, direction: 'above' });
		expect(t).toMatchObject({ state: 'warn', direction: 'above' });
		expect('distance' in t && t.distance).toBeCloseTo(2);
	});
	it('경계: 0 이하 hit, 3 이하 warn, 3 초과 idle', () => {
		expect(triggerState({ price: 100, trigger: 100 }).state).toBe('hit');
		expect(triggerState({ price: 95, trigger: 100 }).state).toBe('hit');
		expect(triggerState({ price: 103, trigger: 100 }).state).toBe('warn');
		expect(triggerState({ price: 103.01, trigger: 100 }).state).toBe('idle');
		expect(triggerState({ price: 105, trigger: 100, direction: 'above' }).state).toBe('hit');
		expect(triggerState({ price: 96.9, trigger: 100, direction: 'above' }).state).toBe('idle');
	});
	it('trigger_price null 또는 watch_only면 watch(방향 무시)', () => {
		expect(triggerState({ price: 100, trigger: null, direction: 'above' })).toEqual({
			state: 'watch'
		});
		expect(triggerState({ price: 100, trigger: 90, watchOnly: true })).toEqual({ state: 'watch' });
	});
	it('감시 가격은 있는데 현재가가 없으면 unpriced(거리 없음)', () => {
		const t = triggerState({ price: null, trigger: 90, direction: 'above' });
		expect(t).toEqual({ state: 'unpriced', direction: 'above' });
		expect('distance' in t).toBe(false);
	});
	it('알 수 없는 방향 값은 below로 본다', () => {
		expect(
			triggerState({ price: 110, trigger: 100, direction: 'sideways' as never })
		).toMatchObject({ direction: 'below' });
	});
});

describe('게이지 위치·라벨', () => {
	it('마커 위치 = min(distance, 20) / 20, 도달이면 0', () => {
		expect(gaugePosition(10)).toBe(0.5);
		expect(gaugePosition(20)).toBe(1);
		expect(gaugePosition(35)).toBe(1);
		expect(gaugePosition(-4)).toBe(0);
	});
	it('20 초과면 20%+, 그 밖은 부호와 소수 2자리', () => {
		expect(distanceLabel(25)).toBe('20%+');
		expect(distanceLabel(20)).toBe('+20.00%');
		expect(distanceLabel(2.345)).toBe('+2.35%');
		expect(distanceLabel(0)).toBe('0.00%');
		expect(distanceLabel(-1.2)).toBe('\u22121.20%');
	});
	it('방향 배지: ▼ 이하 / ▲ 이상(재돌파)', () => {
		expect(DIRECTION_BADGE.below).toMatchObject({ icon: '▼', label: '이하' });
		expect(DIRECTION_BADGE.above).toMatchObject({ icon: '▲', label: '이상(재돌파)' });
	});
});

describe('정렬', () => {
	it('도달 → 3% 이내 → 가까운 순 → 현재가 없음 → 관심만', () => {
		const list: TriggerState[] = [
			{ state: 'watch' },
			{ state: 'idle', direction: 'below', distance: 12 },
			{ state: 'unpriced', direction: 'below' },
			{ state: 'idle', direction: 'below', distance: 5 },
			{ state: 'hit', direction: 'above', distance: -1 },
			{ state: 'warn', direction: 'below', distance: 2 }
		];
		expect(
			list.toSorted(compareTrigger).map((t) => ('distance' in t ? t.distance : t.state))
		).toEqual([-1, 2, 5, 12, 'unpriced', 'watch']);
	});
});
