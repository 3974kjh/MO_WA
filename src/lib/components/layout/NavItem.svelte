<script lang="ts">
	/**
	 * 내비 항목 (FE-01, H §3: NavItem{href, icon, label, current, badge, disabled})
	 * - variant side: 사이드바(≥1024 라벨 표시) / 레일(640~1023 라벨 숨김, pill 유지)
	 * - variant tab: 모바일 하단 탭
	 * - disabled: 45% 불투명 + '준비 중' 배지, 이동 없음(aria-disabled)
	 */
	import Badge from '$lib/components/ui/Badge.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import NavGlyph from './NavGlyph.svelte';
	import type { NavIcon } from './nav';

	let {
		href,
		icon,
		label,
		current = false,
		badge = 0,
		disabled = false,
		variant = 'side',
		onclick
	}: {
		href?: string;
		icon: NavIcon;
		label: string;
		current?: boolean;
		/** 확인 대기 건수(pending만, G-1). 0이면 표시 안 함 */
		badge?: number;
		disabled?: boolean;
		variant?: 'side' | 'tab' | 'sheet';
		/** 링크를 누른 뒤 할 일(더보기 시트 닫기 등) */
		onclick?: () => void;
	} = $props();
</script>

{#if disabled || !href}
	<span class="item {variant} off" aria-disabled="true" title="{label} — 준비 중">
		<NavGlyph {icon} size={variant === 'tab' ? 22 : 20} />
		<span class="t">{label}</span>
		<span class="soon"><Badge>준비 중</Badge></span>
	</span>
{:else}
	<!-- href는 AppShell에서 resolve()한 값 -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="item {variant}" {href} {onclick} aria-current={current ? 'page' : undefined}>
		<NavGlyph {icon} size={variant === 'tab' ? 22 : 20} />
		<span class="t">{label}</span>
		{#if badge > 0}<span class="badge-slot"><Pill count={badge} /></span>{/if}
	</a>
{/if}

<style>
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 10px;
		border-radius: var(--radius-sm);
		color: var(--color-muted);
		font-size: var(--text-base);
		font-weight: 500;
		min-height: var(--size-touch);
		position: relative;
		text-decoration: none;
	}
	a.item:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
		text-decoration: none;
	}
	a.item[aria-current='page'] {
		background: var(--color-accent-soft);
		color: var(--color-accent);
		font-weight: 700;
	}
	.off {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.badge-slot,
	.soon {
		margin-left: auto;
		display: inline-flex;
	}

	/* 레일(640~1023): 라벨 숨김(스크린리더용으로는 남김), pill은 아이콘 우상단 */
	@media (min-width: 640px) and (max-width: 1023px) {
		.side {
			justify-content: center;
			padding: 10px;
		}
		.side .t {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
		.side .soon {
			display: none;
		}
		.side .badge-slot {
			position: absolute;
			margin: 0;
			top: 0;
			left: 50%;
			transform: translate(4px, -2px);
		}
	}

	/* 하단 탭(<640) */
	.tab {
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		min-height: var(--size-tabbar);
		padding: 0 2px;
		background: transparent;
		color: var(--color-muted);
		font-size: 11px;
		line-height: 14px;
		font-weight: 500;
	}
	a.tab:hover {
		background: transparent;
	}
	a.tab[aria-current='page'] {
		background: transparent;
		color: var(--color-accent);
		font-weight: 700;
	}
	/* 200% 확대에서도 라벨이 글자 중간에서 끊기지 않게 한 줄 + 말줄임 */
	.tab {
		min-width: 0;
	}
	.tab .t {
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tab .badge-slot {
		position: absolute;
		margin: 0;
		top: 2px;
		left: calc(50% + 6px);
	}
	.tab .soon {
		display: none;
	}
</style>
