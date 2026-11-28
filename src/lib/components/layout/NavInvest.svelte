<script lang="ts">
	/**
	 * '투자' 메뉴(v1.6.2 B안, handoff §17). 사이드바 기본 메뉴 4개 바로 다음 · '곧 열려요' 앞.
	 * - PC(≥1024): 사이드바 안 접기. 종목·부동산 화면이면 펼친 채 시작, 그 밖은 접힘. 바깥 클릭으로 닫지 않는다.
	 * - 태블릿 레일(640~1023): 아이콘 하나 + 오른쪽 플라이아웃(바깥 클릭·Esc로 닫힘, Esc 뒤 버튼으로 포커스).
	 *   키보드로 열면 현재 항목(없으면 첫 항목)에 포커스. hover로 열지 않는다. 닫힌 채 시작.
	 * - 모바일(<640)은 사이드바가 없어 보이지 않는다(더보기 '투자' 묶음).
	 * 하위 항목 href가 없으면(부동산, FE-12 전) '준비 중' 비활성.
	 */
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import NavItem from './NavItem.svelte';
	import { INVEST_NAV, type SectionId } from './nav';

	let { current }: { current: SectionId | null } = $props();

	let isCur = $derived(INVEST_NAV.some((n) => n.id === current));
	// svelte-ignore state_referenced_locally
	let open = $state(isCur);
	let ready = $state(false);
	let btn = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();
	let top = $state(0);
	const RAIL = '(min-width: 640px) and (max-width: 1023px)';
	const rail = () => matchMedia(RAIL).matches;

	function place() {
		if (!btn || !menu || !rail()) return;
		const r = btn.getBoundingClientRect();
		top = Math.max(8, Math.min(r.top, innerHeight - (menu.offsetHeight || 100) - 8));
	}
	function set(o: boolean, focus = false) {
		open = o;
		if (!o) return;
		requestAnimationFrame(() => {
			place();
			if (focus) menu?.querySelector<HTMLElement>('[aria-current], a')?.focus();
		});
	}
	onMount(() => {
		const pc = matchMedia('(min-width: 1024px)');
		const r = matchMedia(RAIL);
		const reset = () => set(pc.matches && isCur);
		reset();
		ready = true;
		pc.addEventListener('change', reset);
		r.addEventListener('change', reset);
		return () => {
			pc.removeEventListener('change', reset);
			r.removeEventListener('change', reset);
		};
	});
</script>

<svelte:window
	onclick={(e) => {
		if (open && rail() && !(e.target as Element).closest('.inv')) set(false);
	}}
	onkeydown={(e) => {
		if (e.key !== 'Escape' || !open || !rail()) return;
		const inside = menu?.contains(document.activeElement) || document.activeElement === btn;
		set(false);
		if (inside) btn?.focus();
	}}
	onresize={() => open && place()}
/>

<div class="inv" class:cur={isCur} class:ready>
	<button
		bind:this={btn}
		type="button"
		class="disc"
		aria-expanded={open}
		aria-controls="inv-menu"
		aria-label="투자{isCur ? ' (현재 메뉴)' : ''}"
		title="투자"
		onclick={(e) => set(!open, !open && rail() && e.detail === 0)}
	>
		<Briefcase size={20} strokeWidth={1.8} aria-hidden="true" />
		<span class="t">투자</span>
		<span class="chev"><ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" /></span>
	</button>
	<div
		bind:this={menu}
		id="inv-menu"
		class="sub"
		role="group"
		aria-label="투자"
		hidden={!open}
		style:top="{top}px"
	>
		{#each INVEST_NAV as n (n.id)}
			<NavItem
				href={n.href ? resolve(n.href) : undefined}
				icon={n.icon}
				label={n.label}
				current={current === n.id}
				variant="sheet"
				onclick={() => rail() && set(false)}
			/>
		{/each}
	</div>
</div>

<style>
	.disc {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		min-height: var(--size-touch);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-muted);
		font-size: var(--text-base);
		font-weight: 500;
		text-align: left;
	}
	.disc:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
	}
	.cur .disc {
		color: var(--color-accent);
		font-weight: 700;
	}
	.chev {
		margin-left: auto;
		display: inline-flex;
		transition: transform 0.15s;
	}
	[aria-expanded='true'] .chev {
		transform: rotate(180deg);
	}
	.sub {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 2px;
	}
	.sub[hidden] {
		display: none;
	}
	@media (min-width: 1024px) {
		.sub :global(.item) {
			padding-left: 40px;
		}
		.sub {
			top: auto !important;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chev {
			transition: none;
		}
	}
	@media (min-width: 640px) and (max-width: 1023px) {
		.disc {
			justify-content: center;
			padding: 10px;
		}
		.t,
		.chev {
			display: none;
		}
		.cur .disc {
			background: var(--color-accent-soft);
		}
		.sub {
			position: fixed;
			left: calc(var(--size-sidebar-rail) + 8px);
			z-index: 80;
			width: 200px;
			margin: 0;
			padding: 8px;
			background: var(--color-surface);
			border: 1px solid var(--color-card-line);
			border-radius: var(--radius-md);
			box-shadow: var(--shadow-pop);
		}
		.inv:not(.ready) .sub {
			display: none;
		}
	}
</style>
