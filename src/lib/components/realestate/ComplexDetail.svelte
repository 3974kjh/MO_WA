<script lang="ts">
	/**
	 * 고른 단지 정보 카드(정보창 대신 — PLAN §3-4, 접근성·테마 일관). aria-live=polite로 바뀐 내용을 알린다.
	 * DB 문자열은 텍스트로만 넣는다. 외부 링크는 네이버 지도 검색만(isAllowedMapLink) 새 창 + noopener.
	 */
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import { TIER_LABEL, isAllowedMapLink, isLocated, type ComplexItem } from '$lib/maps/points';

	let { item }: { item: ComplexItem | null } = $props();
	const nf = new Intl.NumberFormat('ko-KR');
</script>

<Card>
	<div class="dt" aria-live="polite" data-testid="complex-detail">
		{#if item}
			<header class="hd">
				<h2>{item.rank}. {item.name}</h2>
				<Badge tone={item.tier === 'top' ? 'warn' : item.tier === 'target' ? 'accent' : 'default'}
					>{TIER_LABEL[item.tier]}</Badge
				>
			</header>
			<p class="meta">
				{[
					item.region,
					item.households != null ? `${nf.format(item.households)}세대` : null,
					item.builtYear != null ? `${item.builtYear}년 준공` : null,
					item.mainType
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
			<dl class="kv">
				<div>
					<dt>총점</dt>
					<dd class="tot">
						{#if item.score != null}{nf.format(item.score)}<small>/100</small>{:else}<small
								>점수 없음</small
							>{/if}
					</dd>
				</div>
				{#if item.rating != null}
					<div>
						<dt>별점</dt>
						<dd>{item.rating.toFixed(1)}<small>/5</small></dd>
					</div>
				{/if}
				<div>
					<dt>실거래 중앙값</dt>
					<dd>
						{#if item.medPrice != null}<Money
								value={item.medPrice * 1e4}
								label="실거래 중앙값"
							/>{#if item.priceAsOf}<small class="asof">{item.priceAsOf} 기준</small>{/if}
						{:else}<small>자료 없음</small>{/if}
					</dd>
				</div>
			</dl>
			{#if item.address}<p class="addr">{item.address}</p>{/if}
			{#if !isLocated(item)}
				<p class="note">위치 정보가 아직 없어 지도에는 표시하지 않았어요.</p>
			{/if}
			{#if isAllowedMapLink(item.naverUrl)}
				<a class="lk" href={item.naverUrl} target="_blank" rel="noopener noreferrer external"
					>네이버 지도에서 보기<Icon icon={ExternalLink} size={14} /><span class="sr-only"
						>(새 창)</span
					></a
				>
			{/if}
		{:else}
			<p class="empty">목록이나 지도에서 단지를 고르면 자세한 내용이 여기에 보여요.</p>
		{/if}
	</div>
</Card>

<style>
	.dt {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.hd {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}
	h2 {
		font-size: var(--text-lg);
		overflow-wrap: anywhere;
	}
	.meta,
	.addr,
	.note,
	.empty {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.kv {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 12px 24px;
	}
	.kv dt {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.kv dd {
		margin: 0;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		display: flex;
		align-items: baseline;
		gap: 4px;
	}
	.tot {
		font-size: var(--text-xl);
	}
	small {
		font-size: var(--text-xs);
		color: var(--color-muted);
		font-weight: 400;
	}
	.lk {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		color: var(--color-accent);
		font-weight: 600;
	}
</style>
