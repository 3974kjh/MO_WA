<script lang="ts">
	/**
	 * 본문 영역 이동 로딩 (사용자 요청: 메뉴 이동 시 화면 데이터 준비 중을 퍼센트로).
	 * 경로가 바뀌는 이동이 SHOW_DELAY_MS(180ms)를 넘기면 본문 자리에 로딩 패널을 보이고, 끝나면 100%를 채운 뒤 사라진다.
	 * 이전 화면은 지우지 않고 visibility:hidden으로 가린다. 자리(높이·스크롤)는 그대로라 패널이 뜨고 질 때 레이아웃이 튀지 않고,
	 * 이동이 취소되면 그대로 돌아온다. 완료 때도 패널이 완전히 사라진 뒤에 새 화면을 보여 카드와 본문이 겹친 프레임이 없다.
	 * 패널은 스크롤한 화면에서도 보이도록 상단바 아래에 sticky로 붙는다(본문보다 먼저 두어야 stage 맨 위에서 시작한다).
	 * 가려진 이전 본문은 visibility:hidden + inert라 포커스·스크린리더에서 빠진다. 숨기기 전에 포커스가 본문 안에 있었으면
	 * 이동이 취소될 때 그 요소로 돌려놓는다(스크롤은 높이가 유지돼 그대로다).
	 * 알려진 동작: 목적지 __data.json이 끝내 오지 않으면 타임아웃 없이 패널이 58% 이하에서 멈춘다. 다른 메뉴를 누르면
	 * 새 이동으로 바뀌어 복구된다(현재 동작 그대로 둔다. 필요하면 타임아웃·다시 시도는 따로 정한다).
	 * 진행률 규칙은 $lib/nav/navProgress.ts, 문구는 navCopy.ts. 서버 load·훅은 건드리지 않는다.
	 */
	import { tick, type Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { navigating } from '$app/state';
	import { observeDataResponse } from '$lib/nav/dataSignal';
	import { NAV_DONE_TEXT, navCopyFor } from '$lib/nav/navCopy';
	import {
		IDLE_STATE,
		createNavProgress,
		type NavProgress,
		type NavProgressState
	} from '$lib/nav/navProgress';
	import { isMenuNavigation } from '$lib/nav/navTarget';
	import NavLoading from './NavLoading.svelte';

	let { children }: { children: Snippet } = $props();

	let nav = $state.raw<NavProgressState>(IDLE_STATE);
	let name = $state('화면');
	let steps = $state<readonly [string, string, string]>(['', '', '']);

	const progress: NavProgress = createNavProgress({ onChange: (s) => (nav = s) });
	let stopObserve: (() => void) | null = null;
	let tracked: object | null = null;
	let completed = false;
	let contentEl: HTMLElement | undefined;
	/** 패널을 띄우기 전에 본문 안에서 포커스를 갖고 있던 요소(취소 때 되돌림) */
	let focusBefore: HTMLElement | null = null;

	/** 이동 중 현재 화면으로 돌아오려는 취소(현재 메뉴 클릭 등): 그 이동이 끝난 뒤 스크롤·포커스를 되돌린다 */
	let stay: { x: number; y: number; el: HTMLElement | null } | null = null;

	function cancelNav(returnToCurrent = false) {
		progress.cancel();
		const el = focusBefore;
		focusBefore = null;
		// 돌아오는 경우: 지금 포커스(방금 누른 메뉴 링크 등)를 우선, 없으면 패널 전에 본문에서 갖고 있던 요소
		const now = document.activeElement;
		const keep = now instanceof HTMLElement && now !== document.body ? now : el;
		stay = returnToCurrent ? { x: scrollX, y: scrollY, el: keep } : null;
		if (!el || returnToCurrent) return;
		void tick().then(() => {
			// 본문이 다시 보인 뒤에도 포커스가 body에 떨어져 있을 때만 돌려놓는다(스크롤은 건드리지 않는다)
			if (el.isConnected && document.activeElement === document.body)
				el.focus({ preventScroll: true });
		});
	}

	function stop() {
		stopObserve?.();
		stopObserve = null;
		tracked = null;
	}

	// 이동 완료 신호(성공). 취소·실패는 이 콜백이 없다.
	afterNavigate(() => {
		completed = true;
		if (!stay) return;
		// SvelteKit은 링크 이동을 끝내며 맨 위로 올리고 포커스를 body로 보낸다. 패널이 떠 있다 돌아온 경우엔 원래 자리로 되돌린다.
		const s = stay;
		stay = null;
		void tick().then(() => {
			scrollTo(s.x, s.y);
			if (s.el?.isConnected) s.el.focus({ preventScroll: true });
		});
	});

	$effect(() => {
		const to = navigating.to;
		const from = navigating.from;
		const type = navigating.type;
		if (!to) {
			// 이동이 끝났다: 성공이면 100%, 취소·실패면 흔적 없이 정리.
			if (tracked) {
				stop();
				if (completed) {
					focusBefore = null;
					progress.finish();
				} else cancelNav();
			}
			return;
		}
		if (tracked === to) return;
		if (!isMenuNavigation({ from, to, type })) {
			// 현재 경로로 돌아오는 이동(현재 메뉴 클릭·쿼리만 바뀜): 패널 없음. 진행 중이던 것이 있으면 정리하고 자리를 기억한다.
			if (tracked) {
				stop();
				cancelNav(true);
			}
			return;
		}
		const active = document.activeElement;
		if (active instanceof HTMLElement && active !== document.body && contentEl?.contains(active))
			focusBefore = active;
		stopObserve?.();
		tracked = to;
		completed = false;
		stay = null;
		const copy = navCopyFor(to.route.id);
		name = copy.name;
		steps = copy.steps;
		progress.begin(to.url.href);
		stopObserve = observeDataResponse(to.url.pathname, () => progress.received());
	});

	$effect(() => () => {
		stopObserve?.();
		progress.dispose();
	});
</script>

<div class="stage" aria-busy={nav.active && nav.visible}>
	{#if nav.visible}
		<NavLoading
			{name}
			step={nav.phase === 'done' ? NAV_DONE_TEXT : steps[nav.step]}
			percent={nav.percent}
			done={nav.phase === 'done'}
		/>
	{/if}
	<div class="content" class:hidden={nav.visible} inert={nav.visible} bind:this={contentEl}>
		{@render children()}
	</div>
</div>

<style>
	.content {
		display: contents;
	}
	.content.hidden {
		visibility: hidden;
	}
</style>
