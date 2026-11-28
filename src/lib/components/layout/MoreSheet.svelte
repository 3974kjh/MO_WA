<script lang="ts">
	/**
	 * 모바일 더보기 시트 (FE-01, 시안 shots/more-sheet-m.png)
	 * 투자(종목·부동산, v1.6.1) · 곧 열려요(준비 중) · 관리 그룹(보관함·설정) · 화면 그룹(화면 모드·로그아웃) — 디자인 v1.1. Sheet 공통(포커스 트랩·Esc·닫힐 때 트리거로 복귀).
	 */
	import { resolve } from '$app/paths';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import ThemeIcon from '$lib/components/theme/ThemeIcon.svelte';
	import { THEME_LABEL } from '$lib/theme/theme';
	import { themeState } from '$lib/theme/themeState.svelte';
	import NavItem from './NavItem.svelte';
	import { ACCOUNT_NAV, INVEST_NAV, LOGOUT_PATH, SOON_NAV, type SectionId } from './nav';

	let {
		open,
		current = null,
		onclose
	}: { open: boolean; current?: SectionId | null; onclose: () => void } = $props();
</script>

<Sheet {open} {onclose} variant="bottom" title="더보기">
	<nav class="more-nav" aria-label="더보기 메뉴">
		{#each [{ label: '투자', items: INVEST_NAV }, { label: '곧 열려요', items: SOON_NAV }, { label: '관리', items: ACCOUNT_NAV }] as g (g.label)}
			<div class="nav-label">{g.label}</div>
			{#each g.items as n (n.id)}
				<NavItem
					href={n.href ? resolve(n.href) : undefined}
					icon={n.icon}
					label={n.label}
					current={current === n.id}
					disabled={!n.href}
					variant="sheet"
					onclick={onclose}
				/>
			{/each}
		{/each}
		<div class="nav-label">화면</div>
		<button type="button" class="row" onclick={() => themeState.cycle()}>
			<ThemeIcon mode={themeState.mode} />
			<span>화면 모드: {THEME_LABEL[themeState.mode]} (눌러서 변경)</span>
		</button>
		<form method="POST" action={resolve(LOGOUT_PATH)}>
			<button type="submit" class="row">
				<LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
				<span>로그아웃</span>
			</button>
		</form>
	</nav>
</Sheet>

<style>
	.more-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nav-label {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		padding: 12px 10px 4px;
		font-weight: 600;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		min-height: 44px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text);
		font-size: var(--text-base);
		font-weight: 500;
		text-align: left;
	}
	.row:hover {
		background: var(--color-surface-2);
	}
	form {
		margin: 0;
	}
	.row :global(svg) {
		color: var(--color-muted);
		flex: none;
	}
</style>
