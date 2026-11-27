<script lang="ts">
	/**
	 * MO_WA 마크 — 1안 반사 (handoff §19-5, 사용자 확정 11/27 13:50): 틸 타일 + M(위)·거울 W(아래).
	 * 색은 토큰: 타일 var(--color-accent), 획 var(--color-on-accent) → data-theme·OS 다크를 따른다.
	 * 기본 28×28. 옆에 'MO_WA' 글자가 있으면 SVG는 aria-hidden, 로고만 있는 링크는 aria-label="MO_WA 홈".
	 * 부모 inline-flex items-center gap 10px(gap-2.5) — 글자 줄높이 28px로 마크와 세로 가운데.
	 */
	import { resolve } from '$app/paths';

	let {
		size = 28,
		showWordmark = true,
		link = true,
		label = 'MO_WA 홈'
	}: {
		size?: number;
		showWordmark?: boolean;
		/** true면 홈(/) 링크. 이미 링크 안에 넣을 때는 false */
		link?: boolean;
		/** 링크 접근 이름(로고만 있을 때 필수) */
		label?: string;
	} = $props();
</script>

{#snippet body()}
	<svg
		viewBox="0 0 32 32"
		width={size}
		height={size}
		class="block shrink-0"
		aria-hidden="true"
		focusable="false"
	>
		<rect x="1" y="1" width="30" height="30" rx="7.5" fill="var(--color-accent)" />
		<path
			d="M7.5 13V7L16 13 24.5 7v6"
			fill="none"
			stroke="var(--color-on-accent)"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			d="M7.5 19v6L16 19 24.5 25v-6"
			fill="none"
			stroke="var(--color-on-accent)"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
	{#if showWordmark}<span class="mw-logo-text">MO_WA</span>{/if}
{/snippet}

{#if link}
	<a class="mw-logo" href={resolve('/')} aria-label={label}>{@render body()}</a>
{:else}
	<span class="mw-logo">{@render body()}</span>
{/if}

<style>
	.mw-logo {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--color-text);
	}
	a.mw-logo:hover {
		text-decoration: none;
	}
	.mw-logo-text {
		font-size: var(--text-lg);
		line-height: 28px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
</style>
