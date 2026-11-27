<script lang="ts">
	/**
	 * 시트·모달 (FE-02, DS §7-11, H §3)
	 * - <640: bottom(최대 var(--sheet-max-h), 그랩 핸들) 또는 full(전체 화면 + '← 목록으로')
	 * - ≥640: center 520px 모달 (variant=center는 모든 폭에서 중앙)
	 * - 포커스 트랩, 스크림 클릭·Esc·닫기 버튼으로 닫힘, 열릴 때 포커스 이동·닫힐 때 트리거로 복귀
	 */
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import X from '@lucide/svelte/icons/x';
	import { portal } from '$lib/actions/portal';
	import { focusableIn, trapTab } from '$lib/actions/focusTrap';
	import type { SheetVariant } from './types';
	import { isTopEntry, registerOpenSheet, type OpenSheet } from './sheetStack';

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
			// 닫기 버튼 다음의 첫 요소가 있으면 그쪽으로, 없으면 닫기 버튼
			(items[1] ?? items[0] ?? el).focus();
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
	<div class="scrim" class:open aria-hidden="true" onclick={onclose}></div>
	<div
		bind:this={panel}
		class="sheet {variant}"
		class:open
		role="dialog"
		aria-modal="true"
		aria-labelledby="{uid}-title"
		tabindex="-1"
		inert={!open}
		{onkeydown}
	>
		{#if variant === 'bottom'}<div class="grab" aria-hidden="true"></div>{/if}
		<div class="head">
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
		<div class="body">{@render children()}</div>
		{#if footer}<div class="foot">{@render footer()}</div>{/if}
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
		overflow: auto;
		overscroll-behavior: contain;
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
		padding: 8px 16px calc(20px + var(--inset-b));
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
		padding-top: calc(8px + var(--safe-top));
	}
	.grab {
		width: var(--size-touch);
		height: 4px;
		border-radius: 2px;
		background: var(--color-line-strong);
		margin: 4px auto 12px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0 12px;
		position: sticky;
		top: 0;
		background: var(--color-surface);
		z-index: 1;
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
	.foot {
		display: flex;
		gap: 8px;
		padding-top: 16px;
		flex-wrap: wrap;
	}
	.foot :global(.btn) {
		flex: 1 1 0;
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
		padding: 16px 20px 20px;
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
			padding: 16px 20px 20px;
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
