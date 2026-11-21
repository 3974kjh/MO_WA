<script lang="ts">
	/**
	 * PC·태블릿(≥640) 축약 금액의 정확값 팝오버 (DS §7-3b, handoff §13-1, 시안 shared/shell.js v1.2).
	 * role=tooltip, Esc·바깥 클릭·스크롤·포커스 이탈에 닫힘, 화면 밖으로 나가지 않게 보정. 앱에 하나만 둔다.
	 */
	import { tick } from 'svelte';
	import { EXACT_POPOVER_ID, EXACT_SHEET_MQ, exactPopover } from './exactValue.svelte';

	let el = $state<HTMLDivElement | null>(null);
	let pos = $state({ x: 0, y: 0 });

	$effect(() => {
		const a = exactPopover.anchor;
		if (!a) return;
		tick().then(() => place(a));
	});

	function place(a: HTMLElement) {
		if (!el) return;
		const r = a.getBoundingClientRect();
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		const vw = document.documentElement.clientWidth;
		let x = r.left + r.width / 2 - w / 2;
		x = Math.max(8, Math.min(x, vw - w - 8));
		let y = r.bottom + 8;
		if (r.bottom + h + 16 > window.innerHeight) y = r.top - h - 8;
		pos = { x: x + window.scrollX, y: y + window.scrollY };
	}

	function onDocClick(e: MouseEvent) {
		const a = exactPopover.anchor;
		if (!a) return;
		const t = e.target as Node;
		if (a.contains(t) || el?.contains(t)) return;
		exactPopover.hide();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && exactPopover.open) exactPopover.hide();
	}

	function onResize() {
		if (window.matchMedia(EXACT_SHEET_MQ).matches) exactPopover.hide();
	}
</script>

<svelte:window
	onclick={onDocClick}
	onkeydown={onKey}
	onscroll={() => exactPopover.hide()}
	onresize={onResize}
/>

{#if exactPopover.open}
	<div
		bind:this={el}
		id={EXACT_POPOVER_ID}
		class="popover"
		role="tooltip"
		style="left:{pos.x}px;top:{pos.y}px"
	>
		<div class="pl">{exactPopover.label || '정확한 금액'}</div>
		<div class="pv num">{exactPopover.exact}</div>
		<div class="pn">화면에는 ‘만 원’ 단위로 줄여 보여 줘요 · Esc로 닫기</div>
	</div>
{/if}

<style>
	.popover {
		position: absolute;
		z-index: 90;
		max-width: 280px;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-pop);
		padding: 10px 12px;
	}
	.pl {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.pv {
		font-size: var(--text-lg);
		font-weight: 700;
		margin-top: 2px;
	}
	.pn {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		margin-top: 4px;
	}
</style>
