<script lang="ts">
	/**
	 * Skeleton 토스트 묶음 (DS §7-0: `createToaster()` + 루트 `<Toast.Group>` 하나). ToastHost가 지연 로드한다.
	 * toast.svelte.ts의 `toast.items`를 그대로 비춘다: 새 항목은 create, 빠진 항목은 dismiss. Zag 자체 타이머는 끈다(duration ∞).
	 * 위치: app.css `--mw-toast-bottom` (기본 24px · 모바일 하단 탭 위). 열린 시트와 겹치면 시트 실제 윗선 위 12px, 자리 없으면 상단바 바로 아래(DS §7-0). 86dvh 금지.
	 */
	import { onMount } from 'svelte';
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { toast, type ToastTone } from './toast.svelte';
	import { toastBottomOffset } from './toastLift';

	const TYPE: Record<ToastTone, 'info' | 'success' | 'error'> = {
		default: 'info',
		ok: 'success',
		err: 'error'
	};

	const toaster = createToaster({
		placement: 'bottom',
		gap: 8,
		max: 5,
		offsets: { top: '16px', left: '16px', right: '16px', bottom: 'var(--mw-toast-bottom, 24px)' }
	});

	/** 이미 Zag에 넘긴 id (반응형일 필요 없는 장부) */
	const shown: Record<string, true> = {};
	$effect(() => {
		const live = toast.items.map((item) => String(item.id));
		for (const item of toast.items) {
			const id = String(item.id);
			if (shown[id]) continue;
			shown[id] = true;
			toaster.create({ id, description: item.message, type: TYPE[item.tone], duration: Infinity });
		}
		for (const id of Object.keys(shown)) {
			if (live.includes(id)) continue;
			delete shown[id];
			toaster.dismiss(id);
		}
	});

	const itemOf = (id: string | undefined) => toast.items.find((t) => String(t.id) === id);

	// 토스트가 생기거나 높이가 바뀌면 위치를 다시 계산한다.
	$effect(() => {
		void toast.items.length;
		if (typeof document !== 'undefined') queueMicrotask(applyLift);
	});

	function defaultBottomPx(): number {
		// lift 변수를 읽지 않고 CSS 기본값과 같은 값을 쓴다(순환 계산 방지).
		if (window.matchMedia('(max-width: 639px)').matches) {
			const cs = getComputedStyle(document.documentElement);
			const tab = parseFloat(cs.getPropertyValue('--size-tabbar')) || 52;
			const inset = parseFloat(cs.getPropertyValue('--inset-b')) || 8;
			return tab + inset + 20;
		}
		return 24;
	}

	/** 열린 시트·모달: `role=dialog` + aria-modal, 닫히면 Sheet 가 inert 를 붙인다(클래스 이름에 기대지 않는다) */
	const OPEN_DIALOG = '[role="dialog"][aria-modal="true"]:not([inert])';

	// 열린 시트의 크기가 바뀌면(내용 변화) 다시 잰다. transform 슬라이드는 ResizeObserver 에 안 잡혀 transitionend 가 맡는다.
	let ro: ResizeObserver | undefined;
	let watched: HTMLElement | null = null;
	function watch(el: HTMLElement | null) {
		if (watched === el) return;
		if (watched) ro?.unobserve(watched);
		watched = el;
		if (el) ro?.observe(el);
	}

	function applyLift() {
		const sheet = document.querySelector(OPEN_DIALOG) as HTMLElement | null;
		watch(sheet);
		const root = document.documentElement;
		if (!sheet) {
			root.style.removeProperty('--mw-toast-bottom-lift');
			return;
		}
		const sb = sheet.getBoundingClientRect();
		// visibility:hidden 인 닫힌 시트(클래스는 남을 수 있음)는 건너뛴다
		if (sb.height <= 0 || getComputedStyle(sheet).visibility === 'hidden') {
			root.style.removeProperty('--mw-toast-bottom-lift');
			return;
		}
		const group = document.querySelector('.mw-toasts[data-part="group"]') as HTMLElement | null;
		const bar = document.querySelector('header.topbar') as HTMLElement | null;
		const toastW = Math.min(420, window.innerWidth - 32);
		const toastH = group?.getBoundingClientRect().height || 48;
		const next = toastBottomOffset({
			sheet: { top: sb.top, right: sb.right, bottom: sb.bottom, left: sb.left },
			viewportH: window.innerHeight,
			viewportW: window.innerWidth,
			toastH,
			toastW,
			defaultBottom: defaultBottomPx(),
			barBottom: bar?.getBoundingClientRect().bottom ?? 0
		});
		if (next == null) root.style.removeProperty('--mw-toast-bottom-lift');
		else root.style.setProperty('--mw-toast-bottom-lift', `${next}px`);
	}

	/**
	 * 시트가 열리는 순간(class 변경)에는 아직 화면 밖(translateY)이라 겹침이 안 잡힌다 → 슬라이드가 끝난 뒤 다시 잰다(L-1).
	 * 시트 안 자식(버튼 등)의 transitionend 는 걸러 낸다.
	 */
	function onTransitionEnd(e: TransitionEvent) {
		const t = e.target;
		if (t instanceof Element && t.matches('[role="dialog"]')) applyLift();
	}

	onMount(() => {
		ro = new ResizeObserver(applyLift);
		document.addEventListener('transitionend', onTransitionEnd, true);
		const mo = new MutationObserver(applyLift);
		mo.observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ['class'],
			childList: true
		});
		window.addEventListener('resize', applyLift);
		applyLift();
		return () => {
			mo.disconnect();
			ro?.disconnect();
			ro = undefined;
			watched = null;
			document.removeEventListener('transitionend', onTransitionEnd, true);
			window.removeEventListener('resize', applyLift);
			document.documentElement.style.removeProperty('--mw-toast-bottom-lift');
		};
	});
</script>

<Toast.Group {toaster} class="mw-toasts">
	{#snippet children(t)}
		{@const item = itemOf(t.id)}
		<Toast toast={t} class="mw-toast">
			{#if t.type === 'success'}<CircleCheck size={18} strokeWidth={1.8} aria-hidden="true" />
			{:else if t.type === 'error'}<CircleAlert
					size={18}
					strokeWidth={1.8}
					aria-hidden="true"
				/>{/if}
			<Toast.Message>
				<Toast.Description>{t.description}</Toast.Description>
			</Toast.Message>
			{#if item?.action}
				<button
					type="button"
					class="act"
					onclick={() => {
						item.action?.onclick();
						toast.dismiss(item.id);
					}}>{item.action.label}</button
				>
			{/if}
		</Toast>
	{/snippet}
</Toast.Group>

<style>
	/* Zag가 left·right 16px를 인라인으로 준다 → 너비 고정 + margin auto로 가운데 */
	:global(.mw-toasts[data-part='group']) {
		width: min(420px, calc(100vw - 32px));
		margin-inline: auto;
	}
	:global(.mw-toast[data-part='root']) {
		width: 100%;
		max-width: none;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border: 0;
		border-radius: var(--radius-md);
		background: var(--color-text);
		color: var(--color-canvas);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
		line-height: var(--text-sm--line-height);
		font-weight: 600;
	}
	:global(.mw-toast[data-part='root'] > svg) {
		flex: none;
	}
	:global(.mw-toast [data-part='message']) {
		flex: 1;
		min-width: 0;
	}
	:global(.mw-toast [data-part='description']) {
		font-size: inherit;
	}
	.act {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: var(--size-touch);
		margin-block: -8px;
		padding: 0 4px;
		border: 0;
		background: transparent;
		color: inherit;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
