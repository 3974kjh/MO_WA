<script lang="ts">
	/**
	 * 등급별 보기(시안 .rm-legend): 글리프+이름+곳 수+눈 아이콘, 누르면 그 등급을 지도·목록에서 켜고 끈다(aria-pressed).
	 * 꺼진 등급은 점선. 아래에 핀 숫자 읽는 법. 지도·목록이 같은 hidden 상태를 쓴다.
	 */
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import { TIER_LABEL, TIER_ORDER, type ComplexTier } from '$lib/maps/points';
	import TierGlyph from './TierGlyph.svelte';

	let {
		counts,
		hidden,
		ontoggle
	}: {
		counts: Record<ComplexTier, number>;
		hidden: ComplexTier[];
		ontoggle: (t: ComplexTier) => void;
	} = $props();
	let tiers = $derived(TIER_ORDER.filter((t) => counts[t] > 0));
</script>

<fieldset class="rm-legend" data-testid="map-legend">
	<legend>등급별 보기</legend>
	{#each tiers as t (t)}
		{@const on = !hidden.includes(t)}
		<button
			type="button"
			class="rm-lc"
			data-g={t}
			aria-pressed={on}
			aria-label="{TIER_LABEL[t]} {counts[t]}곳 표시"
			onclick={() => ontoggle(t)}
		>
			<TierGlyph tier={t} />
			<span class="nm">{TIER_LABEL[t]}</span>
			<span class="n">{counts[t]}</span>
			{#if on}<Eye class="st" size={16} aria-hidden="true" />{:else}<EyeOff
					class="st"
					size={16}
					aria-hidden="true"
				/>{/if}
		</button>
	{/each}
	<p class="rm-legnote">
		최우선·일반 핀의 숫자는 총점(100점 만점)이에요. 점수가 없으면 숫자 없이 모양만 보여요. ‘후’는
		후보, ‘참’은 참고예요.
	</p>
</fieldset>

<style>
	.rm-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		font-weight: 600;
		padding: 0;
		margin-right: 4px;
		float: left;
		line-height: 40px;
	}
	.rm-lc {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 12px 0 8px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-line-strong);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		box-shadow: var(--shadow-card);
	}
	.rm-lc:hover {
		background: var(--color-surface-2);
	}
	.rm-lc:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	.n {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--color-muted);
	}
	.rm-lc :global(.st) {
		flex: none;
		color: var(--color-accent);
	}
	.rm-lc[aria-pressed='true'] {
		background: var(--color-accent-soft);
		border-color: var(--color-accent);
	}
	.rm-lc[aria-pressed='false'] {
		background: transparent;
		border-style: dashed;
		color: var(--color-muted);
		box-shadow: none;
	}
	.rm-lc[aria-pressed='false'] :global(svg.g) {
		opacity: 0.45;
	}
	.rm-lc[aria-pressed='false'] :global(.st) {
		color: var(--color-subtle);
	}
	.rm-legnote {
		flex-basis: 100%;
		font-size: var(--text-xs);
		color: var(--color-subtle);
		line-height: 1.2rem;
		margin: 0;
	}
	@media (min-width: 640px) and (max-width: 1023px) {
		.rm-legend {
			gap: 6px;
		}
		.rm-lc {
			padding: 0 10px 0 6px;
		}
	}
	/* 모바일: 범례는 '범례' 버튼으로 여는 패널(부모 .rm[data-legend=open]이 보이게 함) */
	@media (max-width: 639px) {
		.rm-legend {
			display: none;
			grid-column: 1 / -1;
			position: absolute;
			left: 0;
			right: 0;
			top: 56px;
			z-index: 30;
			background: var(--color-surface);
			border-radius: var(--radius-md);
			box-shadow: var(--shadow-pop);
			padding: 12px;
			gap: 8px;
			grid-template-columns: 1fr 1fr;
		}
		:global(.rm[data-legend='open']) .rm-legend {
			display: grid;
		}
		legend {
			display: none;
		}
		.rm-lc {
			min-height: 44px;
			font-size: var(--text-base);
		}
		.rm-legnote {
			grid-column: 1 / -1;
			font-size: var(--text-sm);
		}
	}
</style>
