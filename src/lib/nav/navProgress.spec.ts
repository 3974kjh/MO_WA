import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	FINISH_HOLD_MS,
	IDLE_STATE,
	RECV_CAP,
	RECV_FLOOR,
	REQ_CAP,
	REQ_FLOOR,
	SHOW_DELAY_MS,
	createNavProgress,
	stepForPercent,
	type NavProgressState
} from './navProgress';

function setup() {
	const seen: NavProgressState[] = [];
	const p = createNavProgress({ onChange: (s) => seen.push(s), now: () => Date.now() });
	return { p, seen };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('문구 단계 구간', () => {
	it('퍼센트 구간으로 0·1·2단계를 정한다', () => {
		expect(stepForPercent(0)).toBe(0);
		expect(stepForPercent(21)).toBe(0);
		expect(stepForPercent(22)).toBe(1);
		expect(stepForPercent(69)).toBe(1);
		expect(stepForPercent(70)).toBe(2);
		expect(stepForPercent(100)).toBe(2);
	});
});

describe('진행률 규칙', () => {
	it('시작하면 4%·요청 단계, 아직 패널은 숨김', () => {
		const { p } = setup();
		p.begin('/stocks');
		expect(p.state).toMatchObject({
			active: true,
			visible: false,
			phase: 'request',
			percent: REQ_FLOOR,
			step: 0
		});
	});

	it('180ms 안에 끝나는 이동은 아무것도 보이지 않고 흔적도 없다(깜빡임 방지)', () => {
		const { p, seen } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(SHOW_DELAY_MS - 20);
		p.finish();
		expect(p.state).toEqual(IDLE_STATE);
		expect(seen.every((s) => !s.visible)).toBe(true);
		expect(seen.some((s) => s.percent === 100)).toBe(false);
		vi.advanceTimersByTime(5000);
		expect(p.state).toEqual(IDLE_STATE);
	});

	it('180ms가 지나면 패널이 보인다', () => {
		const { p } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(SHOW_DELAY_MS + 60);
		expect(p.state.visible).toBe(true);
		expect(p.state.percent).toBeGreaterThan(REQ_FLOOR);
	});

	it('응답이 오지 않으면 요청 단계 상한(58%)을 넘지 않고, 100%도 되지 않는다', () => {
		const { p } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(60_000);
		expect(p.state.percent).toBeLessThanOrEqual(REQ_CAP);
		expect(p.state.percent).toBeLessThan(100);
		expect(p.state.phase).toBe('request');
	});

	it('퍼센트는 줄어들지 않는다', () => {
		const { p, seen } = setup();
		p.begin('/stocks');
		for (let i = 0; i < 40; i++) vi.advanceTimersByTime(100);
		p.received();
		for (let i = 0; i < 40; i++) vi.advanceTimersByTime(100);
		const pcts = seen.map((s) => s.percent);
		expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
	});

	it('응답을 받으면 72% 이상으로 올라 "화면 구성"(2단계)이 되고, 상한 94%를 넘지 않는다', () => {
		const { p } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(400);
		expect(p.state.step).toBe(0);
		p.received();
		expect(p.state).toMatchObject({ phase: 'received', step: 2 });
		expect(p.state.percent).toBeGreaterThanOrEqual(RECV_FLOOR);
		vi.advanceTimersByTime(60_000);
		expect(p.state.percent).toBeLessThanOrEqual(RECV_CAP);
		expect(p.state.percent).toBeLessThan(100);
	});

	it('서버 응답이 길어지면 1단계 문구를 거친다', () => {
		const { p, seen } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(2000);
		expect(seen.map((s) => s.step)).toContain(1);
		expect(p.state.percent).toBeLessThan(70);
	});

	it('완료하면 100%를 채우고, 잠깐 둔 뒤 사라진다', () => {
		const { p } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(700);
		p.received();
		p.finish();
		expect(p.state).toMatchObject({ phase: 'done', percent: 100, visible: true, active: true });
		vi.advanceTimersByTime(FINISH_HOLD_MS - 1);
		expect(p.state.percent).toBe(100);
		vi.advanceTimersByTime(2);
		expect(p.state).toEqual(IDLE_STATE);
	});

	it('보이기 전까지는 100%가 한 번도 나오지 않는다', () => {
		const { p, seen } = setup();
		p.begin('/a');
		vi.advanceTimersByTime(100);
		p.received();
		p.finish();
		expect(seen.filter((s) => s.percent === 100)).toHaveLength(0);
	});
});

describe('취소·연속 클릭·정리', () => {
	it('취소하면 100% 없이 바로 비운다', () => {
		const { p, seen } = setup();
		p.begin('/stocks');
		vi.advanceTimersByTime(900);
		expect(p.state.visible).toBe(true);
		p.cancel();
		expect(p.state).toEqual(IDLE_STATE);
		expect(seen.some((s) => s.percent === 100)).toBe(false);
		vi.advanceTimersByTime(5000);
		expect(p.state).toEqual(IDLE_STATE);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('연속 클릭: 보이는 중이면 패널을 유지한 채 새 목적지로 처음부터 다시 센다', () => {
		const { p } = setup();
		p.begin('/a');
		vi.advanceTimersByTime(1500);
		const before = p.state.percent;
		expect(p.state.visible).toBe(true);
		p.begin('/b');
		expect(p.state).toMatchObject({
			key: '/b',
			visible: true,
			phase: 'request',
			percent: REQ_FLOOR
		});
		expect(before).toBeGreaterThan(REQ_FLOOR);
		expect(vi.getTimerCount()).toBe(1); // 이전 틱 타이머가 남지 않는다
	});

	it('연속 클릭: 아직 안 보이던 중이면 새로 180ms를 센다', () => {
		const { p } = setup();
		p.begin('/a');
		vi.advanceTimersByTime(150);
		p.begin('/b');
		vi.advanceTimersByTime(100);
		expect(p.state.visible).toBe(false);
		vi.advanceTimersByTime(100);
		expect(p.state.visible).toBe(true);
	});

	it('완료 연출 중에 새 이동이 시작돼도 이전 숨김 타이머가 새 이동을 지우지 않는다', () => {
		const { p } = setup();
		p.begin('/a');
		vi.advanceTimersByTime(800);
		p.finish();
		vi.advanceTimersByTime(100);
		p.begin('/b');
		vi.advanceTimersByTime(FINISH_HOLD_MS);
		expect(p.state).toMatchObject({ active: true, key: '/b' });
		p.cancel();
	});

	it('에러·무신호로 끝나도(finish 없이 cancel) 타이머가 남지 않는다', () => {
		const { p } = setup();
		p.begin('/x');
		vi.advanceTimersByTime(3000);
		p.dispose();
		expect(vi.getTimerCount()).toBe(0);
		expect(p.state).toEqual(IDLE_STATE);
	});

	it('이동 중이 아닐 때의 received·finish는 아무 일도 하지 않는다', () => {
		const { p, seen } = setup();
		p.received();
		p.finish();
		expect(seen).toHaveLength(0);
		expect(p.state).toEqual(IDLE_STATE);
	});

	it('received는 한 번만 먹는다(중복 응답 관측)', () => {
		const { p } = setup();
		p.begin('/a');
		vi.advanceTimersByTime(300);
		p.received();
		vi.advanceTimersByTime(300);
		const pct = p.state.percent;
		p.received();
		expect(p.state.percent).toBe(pct);
	});
});
