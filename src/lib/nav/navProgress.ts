/**
 * 메뉴 이동 로딩 진행률 (프레임워크 비의존 상태 기계).
 *
 * 퍼센트는 실제 신호에 묶는다. 신호 사이는 상한 있는 완만한 증가이고, 완료 신호 전에는 100%가 되지 않는다.
 *  - begin   : 이동 시작(SvelteKit이 목적지 load 요청을 보낸 때). 4%에서 시작해 상한 58%를 향해 완만히 오른다.
 *  - received: 목적지 데이터 응답을 받음(`__data.json` 응답 관측). 72%로 올리고 상한 94%를 향해 오른다.
 *  - finish  : 이동 완료. 100%를 채우고 잠깐 둔 뒤 사라진다. 취소·에러는 cancel()로 100% 없이 바로 정리한다.
 * 문구 단계(step)는 퍼센트 구간으로 정한다. 0=요청 중, 1=서버 응답이 길어질 때, 2=응답 받고 화면 구성 중.
 * 1단계(둘째 문구)는 서버 응답 대기가 길어질 때만 보이는 추정 단계다(실제 신호 아님).
 * 실측: 응답 관측(received)은 이동 완료와 거의 동시에 온다(수십 ms). 2단계가 눈에 띄는 때는 응답 뒤에 화면 코드(청크)가
 * 늦게 올 때뿐이다. 서버 load 안의 실제 중간 단계는 클라이언트만으로는 알 수 없다(제안: 스트리밍 load).
 * 짧은 이동(SHOW_DELAY_MS 안에 끝남)은 아무것도 보이지 않는다(깜빡임 방지).
 */
export const SHOW_DELAY_MS = 180;
export const FINISH_HOLD_MS = 480;
export const TICK_MS = 60;

export const REQ_FLOOR = 4;
export const REQ_CAP = 58;
export const REQ_TAU_MS = 1200;
export const RECV_FLOOR = 72;
export const RECV_CAP = 94;
export const RECV_TAU_MS = 600;
export const STEP1_AT = 22;
export const STEP2_AT = 70;

export type NavPhase = 'idle' | 'request' | 'received' | 'done';
export type NavStep = 0 | 1 | 2;

export interface NavProgressState {
	/** 이동 중이거나 완료 연출 중 */
	active: boolean;
	/** 로딩 패널을 보이는 중(SHOW_DELAY_MS 이후) */
	visible: boolean;
	phase: NavPhase;
	/** 0~100 정수. 100은 phase==='done'일 때만 */
	percent: number;
	step: NavStep;
	key: string | null;
}

export const IDLE_STATE: NavProgressState = Object.freeze({
	active: false,
	visible: false,
	phase: 'idle',
	percent: 0,
	step: 0,
	key: null
});

export function stepForPercent(percent: number): NavStep {
	return percent < STEP1_AT ? 0 : percent < STEP2_AT ? 1 : 2;
}

const approach = (from: number, cap: number, tau: number, elapsed: number) =>
	from + (cap - from) * (1 - Math.exp(-Math.max(0, elapsed) / tau));

export interface NavProgressOptions {
	onChange: (state: NavProgressState) => void;
	now?: () => number;
}

export interface NavProgress {
	begin(key: string): void;
	received(): void;
	finish(): void;
	cancel(): void;
	dispose(): void;
	readonly state: NavProgressState;
}

export function createNavProgress({
	onChange,
	now = () => performance.now()
}: NavProgressOptions): NavProgress {
	let state: NavProgressState = IDLE_STATE;
	let startAt = 0;
	let receivedAt = 0;
	let tickTimer: ReturnType<typeof setTimeout> | null = null;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function clearTimers() {
		if (tickTimer !== null) clearTimeout(tickTimer);
		if (holdTimer !== null) clearTimeout(holdTimer);
		tickTimer = holdTimer = null;
	}
	function set(next: NavProgressState) {
		const same =
			next.active === state.active &&
			next.visible === state.visible &&
			next.phase === state.phase &&
			next.percent === state.percent &&
			next.step === state.step &&
			next.key === state.key;
		state = next;
		if (!same) onChange(state);
	}
	function reset() {
		clearTimers();
		set(IDLE_STATE);
	}
	function compute(): NavProgressState {
		const t = now();
		const raw =
			state.phase === 'received'
				? approach(RECV_FLOOR, RECV_CAP, RECV_TAU_MS, t - receivedAt)
				: approach(REQ_FLOOR, REQ_CAP, REQ_TAU_MS, t - startAt);
		// 단조 증가, 완료 전에는 99를 넘지 않는다.
		const percent = Math.min(99, Math.max(state.percent, Math.floor(raw)));
		return {
			...state,
			visible: state.visible || t - startAt >= SHOW_DELAY_MS,
			percent,
			step: stepForPercent(percent)
		};
	}
	function tick() {
		tickTimer = null;
		if (!state.active || state.phase === 'done') return;
		set(compute());
		tickTimer = setTimeout(tick, TICK_MS);
	}

	return {
		get state() {
			return state;
		},
		begin(key) {
			// 연속 클릭: 이미 보이는 중이면 패널은 유지한 채 새 목적지로 다시 시작한다.
			const keepVisible = state.visible;
			clearTimers();
			startAt = now();
			set({
				active: true,
				visible: keepVisible,
				phase: 'request',
				percent: REQ_FLOOR,
				step: 0,
				key
			});
			tickTimer = setTimeout(tick, TICK_MS);
		},
		received() {
			if (!state.active || state.phase !== 'request') return;
			receivedAt = now();
			const percent = Math.max(state.percent, RECV_FLOOR);
			set({ ...state, phase: 'received', percent, step: stepForPercent(percent) });
		},
		finish() {
			if (!state.active || state.phase === 'done') return;
			clearTimers();
			const visible = state.visible || now() - startAt >= SHOW_DELAY_MS;
			// 보이지 않던 짧은 이동은 흔적 없이 끝낸다.
			if (!visible) return reset();
			set({ ...state, visible: true, phase: 'done', percent: 100, step: 2 });
			holdTimer = setTimeout(reset, FINISH_HOLD_MS);
		},
		cancel() {
			reset();
		},
		dispose() {
			reset();
		}
	};
}
