<script lang="ts">
	/**
	 * 고른 단지 정보 본문(시안 v1.7.8 .rm-iw 안쪽): 등급 배지, 지역·세대·준공, 총점, 실거래 중앙값, 위치 링크.
	 * 지도 위 카드(PC·태블릿)와 시트(모바일·지도 없음)가 같은 본문을 쓴다. DB 문자열은 텍스트로만 넣는다.
	 * 시안의 '최저 호가·180일 거래·지난주 대비'는 이 화면이 읽는 자료에 없어 넣지 않았다(PLAN 후속).
	 */
	import Money from '$lib/components/ui/Money.svelte';
	import { TIER_LABEL, type ComplexItem } from '$lib/maps/points';
	import NaverLink from './NaverLink.svelte';
	import TierGlyph from './TierGlyph.svelte';

	let { item }: { item: ComplexItem } = $props();
	const nf = new Intl.NumberFormat('ko-KR');
	let meta = $derived(
		[
			item.region,
			item.households != null ? `${nf.format(item.households)}세대` : null,
			item.builtYear != null ? `${item.builtYear}년 준공` : null,
			item.mainType
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="gb"><TierGlyph tier={item.tier} size={18} /><span>{TIER_LABEL[item.tier]}</span></div>
{#if meta}<p class="meta">{meta}</p>{/if}
{#if item.address}<p class="meta">{item.address}</p>{/if}
<div class="sc">
	{#if item.score != null}
		<span class="big">{nf.format(Math.round(item.score * 10) / 10)}<small>/100</small></span>
	{:else}
		<span class="big"><small>점수 없음</small></span>
		<span class="chg"
			>{item.tier === 'ref' ? '참고 단지는 점수를 매기지 않아요' : '아직 점수가 없어요'}</span
		>
	{/if}
</div>
<dl class="kv">
	<dt>실거래 중앙값</dt>
	<dd>
		{#if item.medPrice != null}<Money
				value={item.medPrice * 1e4}
				label="실거래 중앙값"
			/>{:else}<span class="none">자료 없음</span>{/if}
	</dd>
</dl>
{#if item.priceAsOf}<p class="asof">{item.priceAsOf} 기준</p>{/if}
<div class="lk"><NaverLink {item} /></div>

<style>
	.gb {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 8px 0 4px;
		border-radius: var(--radius-xs);
		background: var(--color-surface-2);
		color: var(--color-text);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.meta {
		margin: 2px 0 0;
		font-size: var(--text-sm);
		color: var(--color-muted);
		line-height: 1.25rem;
	}
	.sc {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		margin: 10px 0 2px;
	}
	.big {
		font-size: var(--text-2xl);
		line-height: 2rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}
	.big small {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-subtle);
		margin-left: 2px;
	}
	.chg {
		font-size: var(--text-sm);
		color: var(--color-muted);
		padding-bottom: 3px;
	}
	.kv {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 10px 0 0;
		font-size: var(--text-sm);
	}
	.kv dt {
		color: var(--color-subtle);
	}
	.kv dd {
		margin: 0;
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.none {
		color: var(--color-subtle);
		font-weight: 500;
	}
	.asof {
		margin: 8px 0 0;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.lk {
		margin-top: 6px;
	}
</style>
