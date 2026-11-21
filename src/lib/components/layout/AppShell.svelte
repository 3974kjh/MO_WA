<script lang="ts">
	/**
	 * 앱 셸 (FE-01, H §2·§3·§5, DS §5·§6, 시안 shared/shell.js)
	 * - ≥1024: 240px 사이드바(1차/이후/관리 그룹, 하단 로그아웃·계정)
	 * - 640~1023: 72px 아이콘 레일(라벨 숨김, pill 유지)
	 * - <640: 상단바 52px + 하단 탭 4 + 더보기(52px + safe-area)
	 * pendingCount는 확인 대기 pending 건수(보류 제외, G-1). 포트폴리오 항목에 pill로 붙는다.
	 */
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import LogOut from '@lucide/svelte/icons/log-out';
	import MoreSheet from './MoreSheet.svelte';
	import NavItem from './NavItem.svelte';
	import TopBar from './TopBar.svelte';
	import { ACCOUNT_NAV, LATER_NAV, PRIMARY_NAV, type NavEntry, type SectionId } from './nav';

	let {
		current,
		pendingCount,
		title,
		backHref = null,
		userEmail = null,
		children
	}: {
		current: SectionId | null;
		pendingCount: number;
		/** 상단바 제목. 없으면 현재 섹션 이름 */
		title?: string;
		backHref?: string | null;
		userEmail?: string | null;
		children: Snippet;
	} = $props();

	let moreOpen = $state(false);

	const hrefOf = (n: NavEntry) => (n.href ? resolve(n.href) : undefined);
	const badgeOf = (n: NavEntry) => (n.pendingBadge ? pendingCount : 0);
	let pageTitle = $derived(
		title ??
			[...PRIMARY_NAV, ...LATER_NAV, ...ACCOUNT_NAV].find((n) => n.id === current)?.label ??
			'MO_WA'
	);
</script>

<a class="skip" href="#main">본문으로 건너뛰기</a>

<aside class="side" aria-label="주 메뉴">
	<a class="brand" href={resolve('/')} aria-label="MO_WA 홈">
		<span class="brand-mark" aria-hidden="true">M</span><span class="t">MO_WA</span>
	</a>
	<nav class="nav" aria-label="섹션">
		<div class="nav-label">1차 출시</div>
		{#each PRIMARY_NAV as n (n.id)}
			<NavItem
				href={hrefOf(n)}
				icon={n.icon}
				label={n.label}
				current={current === n.id}
				badge={badgeOf(n)}
			/>
		{/each}
		<div class="nav-label">이후 출시</div>
		{#each LATER_NAV as n (n.id)}
			<NavItem icon={n.icon} label={n.label} disabled />
		{/each}
		<!-- 디자인 v1.1: '관리' 그룹(보관함·설정). 화면(FE-08·FE-09)이 생기기 전까지 disabled -->
		<div class="nav-label">관리</div>
		{#each ACCOUNT_NAV as n (n.id)}
			<NavItem
				href={hrefOf(n)}
				icon={n.icon}
				label={n.label}
				current={current === n.id}
				disabled={!n.href}
			/>
		{/each}
	</nav>
	<div class="side-foot">
		<form method="POST" action="/?/logout">
			<button type="submit" class="logout" aria-label="로그아웃" title="로그아웃">
				<LogOut size={20} strokeWidth={1.8} aria-hidden="true" /><span class="t">로그아웃</span>
			</button>
		</form>
		{#if userEmail}<div class="account t" title={userEmail}>{userEmail}</div>{/if}
	</div>
</aside>

<div class="main-col">
	<TopBar title={pageTitle} {backHref} />
	<main id="main" class="page" tabindex="-1">
		{@render children()}
	</main>
</div>

<nav class="tabbar" aria-label="하단 메뉴">
	{#each PRIMARY_NAV as n (n.id)}
		<NavItem
			href={hrefOf(n)}
			icon={n.icon}
			label={n.label}
			current={current === n.id}
			badge={badgeOf(n)}
			variant="tab"
		/>
	{/each}
	<button
		type="button"
		class="more-btn"
		aria-haspopup="dialog"
		aria-expanded={moreOpen}
		onclick={() => (moreOpen = true)}
	>
		<Ellipsis size={22} strokeWidth={1.8} aria-hidden="true" />더보기
	</button>
</nav>

<MoreSheet open={moreOpen} onclose={() => (moreOpen = false)} />

<style>
	.skip {
		position: absolute;
		left: 8px;
		top: -48px;
		z-index: 100;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--color-accent);
		color: var(--color-on-accent);
	}
	.skip:focus {
		top: 8px;
	}
	/* ── 사이드바(≥1024) ── */
	.side {
		position: fixed;
		inset: 0 auto 0 0;
		width: var(--size-sidebar);
		background: var(--color-surface);
		border-right: 1px solid var(--color-line);
		display: flex;
		flex-direction: column;
		padding: 16px 12px;
		padding-left: calc(12px + var(--safe-left));
		z-index: 30;
		overflow-y: auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 8px 16px;
		font-weight: 800;
		font-size: var(--text-lg);
		color: var(--color-text);
		letter-spacing: -0.02em;
	}
	.brand:hover {
		text-decoration: none;
	}
	.brand-mark {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		display: grid;
		place-items: center;
		font-size: 13px;
		font-weight: 800;
		flex: none;
	}
	.nav {
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
	.side-foot {
		margin-top: auto;
		padding-top: 10px;
		border-top: 1px solid var(--color-line);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.side-foot form {
		margin: 0;
	}
	.logout {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		min-height: var(--size-touch);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-muted);
		font-size: var(--text-base);
		font-weight: 500;
		text-align: left;
	}
	.logout:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
	}
	.account {
		padding: 6px 10px 0;
		font-size: var(--text-xs);
		color: var(--color-subtle);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.main-col {
		margin-left: var(--size-sidebar);
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.page {
		width: 100%;
		max-width: var(--size-content);
		margin: 0 auto;
		padding: 24px 28px 56px;
		outline: none;
	}
	.tabbar {
		display: none;
	}

	/* ── 레일(640~1023) ── */
	@media (max-width: 1023px) {
		.side {
			width: var(--size-sidebar-rail);
			padding: 12px 8px;
			padding-left: calc(8px + var(--safe-left));
			align-items: stretch;
		}
		.brand {
			justify-content: center;
			padding: 4px 0 16px;
		}
		.side .t,
		.nav-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
		.logout {
			justify-content: center;
			padding: 10px;
		}
		.main-col {
			margin-left: var(--size-sidebar-rail);
		}
		.page {
			padding: 20px 20px 48px;
		}
	}

	/* ── 모바일(<640): 하단 탭 4 + 더보기 ── */
	@media (max-width: 639px) {
		.side {
			display: none;
		}
		.main-col {
			margin-left: 0;
			padding-bottom: calc(var(--size-tabbar) + 8px + var(--inset-b));
		}
		.page {
			padding: 16px 16px 40px;
		}
		.tabbar {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 50;
			background: var(--color-surface);
			border-top: 1px solid var(--color-line);
			padding: 0 4px var(--inset-b);
		}
		.more-btn {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 2px;
			min-height: var(--size-tabbar);
			border: 0;
			background: transparent;
			color: var(--color-subtle);
			font-size: 11px;
			line-height: 14px;
			font-weight: 600;
			border-radius: var(--radius-sm);
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
		}
	}
	@media print {
		.side,
		.tabbar {
			display: none;
		}
		.main-col {
			margin: 0;
		}
	}
</style>
