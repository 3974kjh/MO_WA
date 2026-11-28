<script lang="ts">
	/**
	 * 본문 영역 이동 로딩 (사용자 요청: 메뉴 이동 시 화면 데이터 준비 중을 퍼센트로).
	 * 경로가 바뀌는 이동이 SHOW_DELAY_MS(180ms)를 넘기면 본문 자리에 로딩 패널을 보이고, 끝나면 100%를 채운 뒤 사라진다.
	 * 이전 화면은 지우지 않고 visibility:hidden으로 가린다. 자리(높이·스크롤)는 그대로라 패널이 뜨고 질 때 레이아웃이 튀지 않고,
	 * 이동이 취소되면 그대로 돌아온다. 완료 때도 패널이 완전히 사라진 뒤에 새 화면을 보여 카드와 본문이 겹친 프레임이 없다.
	 * 진행률 규칙은 $lib/nav/navProgress.ts, 문구는 navCopy.ts. 서버 load·훅은 건드리지 않는다.
	 */
	import type { Snippet } from 'svelte';
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

	function stop() {
		stopObserve?.();
		stopObserve = null;
		tracked = null;
	}

	// 이동 완료 신호(성공). 취소·실패는 이 콜백이 없다.
	afterNavigate(() => {
		completed = true;
	});

	$effect(() => {
		const to = navigating.to;
		const from = navigating.from;
		const type = navigating.type;
		if (!to) {
			// 이동이 끝났다: 성공이면 100%, 취소·실패면 흔적 없이 정리.
			if (tracked) {
				stop();
				if (completed) progress.finish();
				else progress.cancel();
			}
			return;
		}
		if (tracked === to) return;
		if (!isMenuNavigation({ from, to, type })) {
			// 쿼리만 바뀌는 이동 등: 패널 없음. 진행 중이던 것이 있으면 정리.
			if (tracked) {
				stop();
				progress.cancel();
			}
			return;
		}
		stopObserve?.();
		tracked = to;
		completed = false;
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
	<div class="content" class:hidden={nav.visible}>
		{@render children()}
	</div>
	{#if nav.visible}
		<NavLoading
			{name}
			step={nav.phase === 'done' ? NAV_DONE_TEXT : steps[nav.step]}
			percent={nav.percent}
			done={nav.phase === 'done'}
		/>
	{/if}
</div>

<style>
	.stage {
		position: relative;
	}
	.content {
		display: contents;
	}
	.content.hidden {
		visibility: hidden;
	}
</style>
