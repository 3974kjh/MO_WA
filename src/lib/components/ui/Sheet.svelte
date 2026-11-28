<script lang="ts">
	/**
	 * 시트·모달 (FE-02, DS §7-11, H §3)
	 * - <640: bottom(최대 var(--sheet-max-h), 그랩 핸들) 또는 full(전체 화면 + '← 목록으로')
	 * - ≥640: center 520px 모달 (variant=center는 모든 폭에서 중앙)
	 * - 포커스 트랩, 스크림 클릭·Esc·닫기 버튼으로 닫힘, 열릴 때 포커스 이동·닫힐 때 트리거로 복귀
	 * - v1.7.3(DS §7-11-1): bottom <640 은 X 없음. 손잡이 = '닫기' 버튼(누름 120×44) + 아래로 끌어 닫기(sheetDrag)
	 * - v1.7.6(DS §7-11-0): .sheet > 손잡이 · .sheet-head(고정) · .sheet-main > (.sheet-body(유일한 스크롤) + 목차 점) · .sheet-foot(고정, 선택).
	 *   스크롤바는 모달 안에서 숨기고, 위·아래로 더 있으면 머리 아래·꼬리 위에 선·그림자. 목차 = 본문 넘침 AND [data-toc] ≥ 2.
	 */
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import X from '@lucide/svelte/icons/x';
	import { portal } from '$lib/actions/portal';
	import { focusableIn, trapTab } from '$lib/actions/focusTrap';
	import { sheetDrag } from '$lib/actions/sheetDrag';
	import type { SheetVariant } from './types';
	import { isTopEntry, registerOpenSheet, type OpenSheet } from './sheetStack';
	import { currentSection, dotHeight, moreEdges, overflows } from './sheetScroll';
	import SheetToc from './SheetToc.svelte';

	let {
		open,
		onclose,
		variant = 'bottom',
		title,
		backLabel = '목록으로',
		footer,
		children
	}: {
		open: boolean;
		onclose: () => void;
		variant?: SheetVariant;
		title: string;
		/** variant=full 모바일 상단 '← {backLabel}' */
		backLabel?: string;
		footer?: Snippet;
		children: Snippet;
	} = $props();

	const uid = $props.id();
	let panel = $state<HTMLDivElement>();
	let scrimEl = $state<HTMLDivElement>();
	let bodyEl = $state<HTMLDivElement>();
	// 본문 스크롤 상태: 가장자리 단서·키보드 영역·목차(점 이름·현재·높이)
	let view = $state({
		up: false,
		down: false,
		over: false,
		names: [] as string[],
		cur: 0,
		h: 40,
		avail: 0
	});
	let pin: number | null = null; // 목차를 누른 직후 그 구역을 현재로 고정(사용자가 다시 스크롤하면 해제)
	let returnTo: HTMLElement | null = null;
	let stackEntry: OpenSheet | undefined;

	$effect(() => {
		if (!open || !panel) return;
		returnTo = document.activeElement as HTMLElement | null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const el = panel;
		const focusFirst = () => {
			if (!el.isConnected) return;
			if (el.contains(document.activeElement)) return;
			const items = focusableIn(el);
			// 손잡이·X·뒤로 다음의 첫 내용 요소로, 없으면 보이는 닫기 컨트롤(<640 손잡이, ≥640 X)
			(
				items.find((n) => !n.matches('.grab, .close, .back, .sheet-body')) ??
				items[0] ??
				el
			).focus();
		};
		tick().then(focusFirst);
		// 포커스가 시트 밖에 남아 있어도 Esc로 닫히게. 맨 위 시트만 처리(겹친 시트를 한 번에 닫지 않음).
		const reg = registerOpenSheet(onclose);
		stackEntry = reg.entry;
		return () => {
			reg.unregister();
			stackEntry = undefined;
			document.body.style.overflow = prevOverflow;
			const target = returnTo;
			returnTo = null;
			if (target && document.contains(target)) target.focus();
		};
	});

	const tocSecs = () =>
		[...(bodyEl?.querySelectorAll<HTMLElement>('[data-toc]') ?? [])].filter(
			(e) => e.getClientRects().length > 0
		);
	function measure() {
		const b = bodyEl;
		if (!b) return;
		const { scrollTop: top, clientHeight: ch, scrollHeight: sh } = b;
		const over = overflows(ch, sh);
		const S = over ? tocSecs() : [];
		const names = S.length >= 2 ? S.map((e) => (e.dataset.toc || e.textContent || '').trim()) : [];
		const y0 = b.getBoundingClientRect().top;
		const avail = Math.max(0, ch - 16);
		const e = moreEdges(top, ch, sh);
		view.up = e.up;
		view.down = e.down;
		view.over = over;
		if (names.join('\u0001') !== view.names.join('\u0001')) view.names = names;
		view.cur = names.length
			? pin != null
				? Math.min(pin, names.length - 1)
				: currentSection(
						top,
						ch,
						sh,
						S.map((x) => x.getBoundingClientRect().top - y0)
					)
			: 0;
		view.h = dotHeight(
			avail,
			names.length || 1,
			matchMedia('(min-width: 640px)').matches ? 40 : 44
		);
		view.avail = avail;
	}
	$effect(() => {
		const b = bodyEl;
		if (!open || !b) return;
		b.scrollTop = 0;
		pin = null;
		let raf = 0;
		const sched = () => (raf ||= requestAnimationFrame(() => ((raf = 0), measure())));
		const unpin = () => (pin = null);
		const ev = ['wheel', 'touchstart', 'keydown'] as const;
		b.addEventListener('scroll', sched, { passive: true });
		ev.forEach((t) => b.addEventListener(t, unpin, { passive: true }));
		const ro = new ResizeObserver(sched);
		ro.observe(b);
		const mo = new MutationObserver(sched);
		mo.observe(b, { childList: true, subtree: true, characterData: true });
		sched();
		return () => {
			cancelAnimationFrame(raf);
			b.removeEventListener('scroll', sched);
			ev.forEach((t) => b.removeEventListener(t, unpin));
			ro.disconnect();
			mo.disconnect();
		};
	});
	function goToc(i: number) {
		const b = bodyEl;
		const e = tocSecs()[i];
		if (!b || !e) return;
		pin = i;
		view.cur = i;
		const y = b.scrollTop + e.getBoundingClientRect().top - b.getBoundingClientRect().top - 8;
		b.scrollTo({
			top: Math.max(0, y),
			behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
		});
		if (!e.hasAttribute('tabindex')) e.setAttribute('tabindex', '-1');
		e.focus({ preventScroll: true });
	}

	function onkeydown(e: KeyboardEvent) {
		if (!open || !panel) return;
		if (e.key === 'Escape') {
			if (!isTopEntry(stackEntry)) return;
			e.stopPropagation();
			e.stopImmediatePropagation();
			onclose();
			return;
		}
		trapTab(e, panel);
	}
</script>

<div use:portal class="sheet-root">
	<div bind:this={scrimEl} class="scrim" class:open aria-hidden="true" onclick={onclose}></div>
	<div
		bind:this={panel}
		class="sheet {variant}"
		class:open
		class:more-up={view.up}
		class:more-down={view.down}
		role="dialog"
		aria-modal="true"
		aria-labelledby="{uid}-title"
		tabindex="-1"
		inert={!open}
		{onkeydown}
		use:sheetDrag={{ enabled: open && variant === 'bottom', onclose, scrim: () => scrimEl }}
	>
		{#if variant === 'bottom'}
			<button
				type="button"
				class="grab"
				aria-label="닫기"
				title="아래로 끌거나 눌러서 닫기"
				onclick={onclose}
			></button>
		{/if}
		<div class="sheet-head">
			{#if variant === 'full'}
				<button
					type="button"
					class="back btn text-muted btn-sm hover:preset-tonal"
					onclick={onclose}
				>
					<ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />{backLabel}
				</button>
			{/if}
			<h2 id="{uid}-title" class="title">{title}</h2>
			<button
				type="button"
				class="close btn-icon preset-outlined-surface-500"
				aria-label="닫기"
				onclick={onclose}
			>
				<X size={20} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
		<div class="sheet-main">
			<!-- 넘칠 때만 키보드로 스크롤할 수 있는 영역(region)으로 -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				bind:this={bodyEl}
				class="sheet-body"
				class:has-toc={view.names.length >= 2}
				tabindex={view.over ? 0 : undefined}
				role={view.over ? 'region' : undefined}
				aria-labelledby={view.over ? `${uid}-title` : undefined}
			>
				{@render children()}
			</div>
			<SheetToc
				names={view.names}
				cur={view.cur}
				h={view.h}
				avail={view.avail}
				scrolls={view.names.length * view.h > view.avail}
				onpick={goToc}
			/>
		</div>
		{#if footer}<div class="sheet-foot">{@render footer()}</div>{/if}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-scrim);
		z-index: 60;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s;
	}
	.scrim.open {
		opacity: 1;
		pointer-events: auto;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: var(--sheet-max-h);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-surface);
		color: var(--color-text);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-sheet);
		z-index: 70;
		transform: translateY(105%);
		visibility: hidden;
		transition:
			transform 0.25s var(--ease-out),
			visibility 0s 0.25s;
		outline: none;
	}
	.sheet.open {
		transform: none;
		visibility: visible;
		transition-delay: 0s;
	}
	/* L-1: Skeleton `.btn { transition: all .15s }` 가 visibility 까지 물려 받아,
	   열린 직후 focus() 시점에 버튼이 아직 hidden 이라 포커스가 무시된다. visibility 는 전환하지 않는다. */
	.sheet :global(.btn),
	.sheet :global(.btn-icon) {
		transition-property: color, background-color, border-color, box-shadow, filter;
	}
	.sheet.full {
		top: 0;
		max-height: none;
		border-radius: 0;
	}
	.sheet.full .sheet-head {
		padding-top: calc(12px + var(--safe-top));
	}
	/* 손잡이 = 버튼: 보이는 막대 40×4(위 12px), 누름 120×44. 자리는 예전 그랩과 같음(시트 위 8 패딩을 -8로 상쇄, 아래 -12) */
	.grab {
		display: block;
		position: relative;
		z-index: 2;
		width: 120px;
		height: 44px;
		flex: none;
		margin: 0 auto -12px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-base);
		background: transparent;
		cursor: grab;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}
	.grab::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 12px;
		width: 40px;
		height: 4px;
		margin-left: -20px;
		border-radius: 2px;
		background: var(--color-line-strong);
	}
	.grab:hover::before {
		background: var(--color-muted);
	}
	.grab:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	/* 끄는 동안 손가락을 그대로 따라가게 전환 끔(놓으면 클래스가 빠져 원래 0.25s 전환으로 닫힘/되돌아감) */
	.sheet:global(.dragging),
	.scrim:global(.dragging) {
		transition: none;
	}
	.sheet:global(.dragging) {
		cursor: grabbing;
		user-select: none;
	}
	@media (max-width: 639px) {
		.sheet.bottom .sheet-head {
			padding-top: 8px; /* 손잡이 누름 영역 아래 12px 이 제목 글자에 닿지 않게 */
			touch-action: none;
		}
		.sheet.bottom .close {
			display: none; /* X 없음 — 닫기: 손잡이(버튼)·끌기·스크림·Esc·'취소' */
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet,
		.scrim,
		.sheet-head::after,
		.sheet-foot::before,
		.sheet-main:last-child::after {
			transition-duration: 0.01ms;
		}
	}
	.sheet-head {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		position: relative;
		background: var(--color-surface);
		z-index: 2;
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: var(--text-lg);
		line-height: var(--text-lg--line-height);
	}
	.back {
		margin-left: -8px;
	}
	.sheet-main {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.sheet-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 4px 16px 16px;
	}
	.sheet-main:last-child .sheet-body {
		padding-bottom: max(20px, var(--inset-b));
	}
	.sheet-body.has-toc {
		padding-right: 44px;
	}
	.sheet-body:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	.sheet-foot {
		flex: none;
		position: relative;
		z-index: 2;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		background: var(--color-surface);
		padding: 12px 16px max(16px, var(--inset-b));
	}
	.sheet-foot :global(.btn) {
		flex: 1 1 0;
	}
	/* 스크롤바는 모달 안에서 모두 숨김(본문·표·코드·목차) — 대신 위·아래로 더 있을 때만 머리 아래·꼬리 위에 선·그림자 */
	.sheet,
	.sheet :global(*) {
		scrollbar-width: none;
	}
	.sheet::-webkit-scrollbar,
	.sheet :global(*::-webkit-scrollbar) {
		display: none;
	}
	.sheet-head::after,
	.sheet-foot::before,
	.sheet-main:last-child::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 14px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.sheet-head::after {
		top: 100%;
		border-top: 1px solid var(--color-line);
		background: linear-gradient(var(--sheet-edge), transparent);
	}
	.sheet-foot::before {
		bottom: 100%;
	}
	/* 꼬리가 없는 모달(full·안내)은 같은 단서를 본문 하단에 (v1.7.7) */
	.sheet-main:last-child::after {
		bottom: 0;
		z-index: 1;
	}
	.sheet-foot::before,
	.sheet-main:last-child::after {
		border-bottom: 1px solid var(--color-line);
		background: linear-gradient(to top, var(--sheet-edge), transparent);
	}
	.more-up .sheet-head::after,
	.more-down .sheet-foot::before,
	.more-down .sheet-main:last-child::after {
		opacity: 1;
	}
	/* 안쪽 가로 스크롤(표·코드)은 스크롤바 대신 가장자리 그늘(JS 없음). 특이도 0 — 자기 배경을 가진 요소는 그대로 둔다 */
	:global(:where(.sheet) :where(.tbl-wrap, pre)) {
		background:
			linear-gradient(to right, var(--color-surface) 30%, transparent) 0 0 / 32px 100% no-repeat
				local,
			linear-gradient(to left, var(--color-surface) 30%, transparent) 100% 0 / 32px 100% no-repeat
				local,
			linear-gradient(to right, var(--sheet-edge), transparent) 0 0 / 10px 100% no-repeat scroll,
			linear-gradient(to left, var(--sheet-edge), transparent) 100% 0 / 10px 100% no-repeat scroll;
	}
	/* 목차 머리글(<h4 class="sheet-sec" data-toc="이름">) — 이동·포커스 대상은 머리글 자신 */
	.sheet-body :global(.sheet-sec) {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.25rem;
		font-weight: 700;
		color: var(--color-muted);
	}
	.sheet-body :global(.sheet-sec:not(:first-child)) {
		margin-top: 8px;
	}
	.sheet-body :global(:is(.form, .stack) > .sheet-sec) {
		margin-bottom: -6px;
	}
	.sheet-body :global([data-toc]:focus) {
		outline: none;
	}
	.sheet-body :global([data-toc]:focus-visible) {
		outline: 2px solid var(--color-focus);
		outline-offset: 3px;
		border-radius: 4px;
	}
	/* 중앙 모달: center는 모든 폭, bottom·full은 640 이상 */
	.sheet.center {
		top: 50%;
		bottom: auto;
		left: 50%;
		right: auto;
		width: min(520px, calc(100vw - 32px));
		max-height: var(--sheet-max-h);
		border-radius: var(--radius-lg);
		transform: translate(-50%, -46%);
		opacity: 0;
		transition:
			transform 0.2s var(--ease-out),
			opacity 0.2s,
			visibility 0s 0.2s;
	}
	.sheet.center.open {
		transform: translate(-50%, -50%);
		opacity: 1;
		transition-delay: 0s;
	}
	@media (min-width: 640px) {
		.sheet.bottom,
		.sheet.full {
			top: 50%;
			bottom: auto;
			left: 50%;
			right: auto;
			width: 520px;
			max-height: var(--sheet-max-h);
			border-radius: var(--radius-lg);
			transform: translate(-50%, -46%);
			opacity: 0;
			transition:
				transform 0.2s var(--ease-out),
				opacity 0.2s,
				visibility 0s 0.2s;
		}
		.sheet.bottom.open,
		.sheet.full.open {
			transform: translate(-50%, -50%);
			opacity: 1;
			transition-delay: 0s;
		}
		.grab,
		.back {
			display: none;
		}
	}
</style>
