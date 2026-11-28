/* eslint-disable svelte/prefer-svelte-reactivity -- 테스트 전용 가짜 상태: Set·URL은 반응형일 필요가 없다 */
/**
 * NavStage 스펙용 가짜 `$app/state`·`$app/navigation`. 테스트에서만 쓴다(운영 번들에 들어가지 않는다).
 * `navigating`은 실제처럼 반응형이고, 성공 완료는 afterNavigate 콜백을 먼저 부른 뒤 navigating을 비운다(SvelteKit 순서).
 */
type Dest = { url: URL; route: { id: string | null } };
type State = { to: Dest | null; from: { url: URL } | null; type: string | null };
const EMPTY: State = { to: null, from: null, type: null };
let s = $state.raw<State>(EMPTY);

export const navigating = {
	get to() {
		return s.to;
	},
	get from() {
		return s.from;
	},
	get type() {
		return s.type;
	}
};

const afterCbs = new Set<() => void>();
export const afterNavigate = (cb: () => void) => {
	afterCbs.add(cb);
	cb(); // 마운트 시 한 번 불린다(실제와 같음)
};

const BASE = 'https://x.test';
export const fakeNav = {
	start(from: string, to: string, routeId: string | null, type = 'link') {
		s = {
			to: { url: new URL(to, BASE), route: { id: routeId } },
			from: { url: new URL(from, BASE) },
			type
		};
	},
	complete() {
		afterCbs.forEach((cb) => cb());
		s = EMPTY;
	},
	cancel() {
		s = EMPTY;
	},
	reset() {
		afterCbs.clear();
		s = EMPTY;
	}
};
