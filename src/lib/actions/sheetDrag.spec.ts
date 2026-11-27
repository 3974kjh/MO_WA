import { describe, expect, it } from 'vitest';
import {
	DISMISS_RATIO,
	DISMISS_VELOCITY,
	DRAG_SLOP,
	canBeginBodyDrag,
	decideDragIntent,
	shouldDismiss
} from './sheetDrag';

describe('shouldDismiss (v1.7.3 임계값)', () => {
	const h = 400;

	it('거리와 속도가 둘 다 이하면 닫지 않는다', () => {
		expect(shouldDismiss(0, h, 0)).toBe(false);
		expect(shouldDismiss(h * DISMISS_RATIO, h, DISMISS_VELOCITY)).toBe(false); // 경계는 > 라서 포함 안 함
		expect(shouldDismiss(h * DISMISS_RATIO - 1, h, DISMISS_VELOCITY - 0.001)).toBe(false);
	});

	it('끈 거리가 높이의 25%를 넘으면 속도와 상관없이 닫는다', () => {
		expect(shouldDismiss(h * DISMISS_RATIO + 0.01, h, 0)).toBe(true);
		expect(shouldDismiss(h * 0.35, h, 0)).toBe(true);
		expect(shouldDismiss(h, h, 0)).toBe(true);
	});

	it('마지막 100ms 속도가 0.5px/ms를 넘으면 거리가 짧아도 닫는다', () => {
		expect(shouldDismiss(10, h, DISMISS_VELOCITY + 0.001)).toBe(true);
		expect(shouldDismiss(1, h, 0.8)).toBe(true);
	});
});

describe('canBeginBodyDrag (본문 터치)', () => {
	it('scrollTop이 0(또는 그 이하)일 때만 본문 끌기를 시작한다', () => {
		expect(canBeginBodyDrag(0)).toBe(true);
		expect(canBeginBodyDrag(-1)).toBe(true);
		expect(canBeginBodyDrag(1)).toBe(false);
		expect(canBeginBodyDrag(80)).toBe(false);
	});
});

describe('decideDragIntent (방향·슬롭)', () => {
	it('6px 안쪽이면 아직 기다린다', () => {
		expect(decideDragIntent(0, 0)).toBe('wait');
		expect(decideDragIntent(DRAG_SLOP - 1, DRAG_SLOP - 1)).toBe('wait');
	});

	it('아래로 세로가 더 크면 끌기를 시작한다', () => {
		expect(decideDragIntent(0, DRAG_SLOP)).toBe('arm');
		expect(decideDragIntent(3, 20)).toBe('arm');
	});

	it('위로 끌거나 가로가 더 크면 스크롤에 양보하고 중단한다', () => {
		expect(decideDragIntent(0, -DRAG_SLOP)).toBe('abort');
		expect(decideDragIntent(0, -20)).toBe('abort');
		expect(decideDragIntent(20, 10)).toBe('abort');
	});
});

describe('reduced-motion', () => {
	it('닫힘 판정은 모션 설정과 무관하다(전환만 0.01ms로 줄임)', () => {
		// 액션은 prefers-reduced-motion 을 읽지 않는다. 끄는 동안은 손가락을 따르고,
		// 놓은 뒤 닫힘·되돌아감은 CSS transition-duration: 0.01ms 가 담당한다.
		expect(shouldDismiss(101, 400, 0)).toBe(true);
		expect(shouldDismiss(99, 400, 0)).toBe(false);
		expect(shouldDismiss(10, 400, 0.51)).toBe(true);
	});
});
