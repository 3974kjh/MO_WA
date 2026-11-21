<script lang="ts">
	/** 지표 타일 (FE-02, H §3): 라벨 13 · 값 28(모바일 22) · 증감 Delta · 보조. 금액 값은 Money 스니펫으로 넘긴다. */
	import type { Snippet } from 'svelte';
	import Delta from './Delta.svelte';

	let {
		label,
		value,
		delta,
		deltaDigits = 2,
		deltaSuffix = '%',
		tone = 'neutral',
		foot,
		href
	}: {
		label: string;
		value: string | Snippet;
		/** number면 Delta(%)로, Snippet이면 그대로(예: ▼ 하루 약 36만 원 감소) */
		delta?: number | Snippet;
		deltaDigits?: number;
		/** Delta 단위(기본 %). 환율 등 포인트 변화는 '' */
		deltaSuffix?: string;
		/** auto: 값 색을 delta 부호(빨강/파랑)로 · neutral: 본문 색 */
		tone?: 'auto' | 'neutral';
		foot?: string | Snippet;
		href?: string;
	} = $props();

	let toneClass = $derived(
		tone === 'auto' && typeof delta === 'number' ? (delta > 0 ? 'up' : delta < 0 ? 'down' : '') : ''
	);
</script>

{#snippet body()}
	<div class="tile-label">{label}</div>
	<div class="tile-value num {toneClass}">
		{#if typeof value === 'string'}{value}{:else}{@render value()}{/if}
	</div>
	{#if delta != null}
		<div class="tile-delta">
			{#if typeof delta === 'number'}<Delta
					value={delta}
					digits={deltaDigits}
					suffix={deltaSuffix}
				/>{:else}{@render delta()}{/if}
		</div>
	{/if}
	{#if foot}
		<div class="tile-foot">
			{#if typeof foot === 'string'}{foot}{:else}{@render foot()}{/if}
		</div>
	{/if}
{/snippet}

{#if href}
	<!-- href는 호출부에서 resolve()한 값을 받는다 -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="tile link" {href}>{@render body()}</a>
{:else}
	<div class="tile">{@render body()}</div>
{/if}

<style>
	.tile {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		box-shadow: var(--shadow-card);
		min-width: 0;
		color: inherit;
	}
	.link:hover {
		border-color: var(--color-line-strong);
		text-decoration: none;
	}
	.tile-label {
		font-size: var(--text-sm);
		color: var(--color-muted);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tile-value {
		font-size: var(--text-2xl);
		line-height: var(--text-2xl--line-height);
		font-weight: 700;
		margin-top: 4px;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}
	.tile-value :global(.u) {
		font-size: var(--text-base);
	}
	.up {
		color: var(--color-up);
	}
	.down {
		color: var(--color-down);
	}
	.tile-delta {
		font-size: var(--text-sm);
		margin-top: 2px;
		font-weight: 600;
	}
	.tile-foot {
		margin-top: 8px;
		font-size: var(--text-xs);
		color: var(--color-subtle);
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: flex-end;
	}
	@media (max-width: 639px) {
		.tile {
			padding: 12px;
		}
		.tile-value {
			font-size: var(--text-xl);
			line-height: 1.7rem;
		}
	}
</style>
