<script lang="ts">
	/**
	 * FE-12 `/realestate`: 하위 탭 5개(오늘 브리핑 · 시세 동향 · 청약 · 관심 단지 · 지도, 시안 realestate.html)와
	 * ④ 관심 단지·⑤ 지도 탭(시안 realestate-map.html). 브리핑·시세·청약은 자료원이 아직 없어 빈 상태 골격이다.
	 * - 지도 코드(ComplexMap)는 지도 탭을 열 때, 키와 좌표가 있을 때만 import()한다 → 이 라우트 동기 클로저에 지도 코드·SDK 없음.
	 * - 표시 전용: 쓰기 액션 없음.
	 */
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import MapTab from '$lib/components/realestate/MapTab.svelte';
	import WatchTab from '$lib/components/realestate/WatchTab.svelte';
	import { formatKstShort } from '$lib/format/datetime';
	import { RE_TABS, type RealestateTab } from '$lib/realestate/view';

	let { data }: { data: PageData } = $props();
	let tab = $derived(data.query.tab);

	const href = (t: RealestateTab, c?: string) =>
		`${resolve('/(app)/realestate')}?tab=${t}${c ? `&c=${encodeURIComponent(c)}` : ''}`;
	const watchHref = (id: string) => href('watch', id || undefined);
	const mapHref = (id: string) => href('map', id);

	const EMPTY: Record<'brief' | 'trend' | 'subs', { title: string; desc: string }> = {
		brief: {
			title: '오늘 브리핑이 아직 없어요',
			desc: '수도권 부동산·청약 브리핑이 만들어지면 이 탭에서 요약과 상세로 읽을 수 있어요.'
		},
		trend: {
			title: '시세 동향 자료가 아직 없어요',
			desc: '지역별 주간 변동률이 들어오면 출처와 지역을 바꿔 가며 볼 수 있어요.'
		},
		subs: {
			title: '청약 일정이 아직 없어요',
			desc: '청약 공고가 들어오면 달력과 목록으로 보여요.'
		}
	};
</script>

<svelte:head><title>부동산 · MO_WA</title></svelte:head>

<nav class="subnav" aria-label="부동산 하위 탭">
	{#each RE_TABS as t (t.id)}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 주소는 page의 href()가 resolve('/(app)/realestate')에 ?tab을 붙여 만든 것 -->
		<a href={href(t.id)} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
	{/each}
</nav>

{#if tab === 'brief' || tab === 'trend' || tab === 'subs'}
	<Card>
		<EmptyState icon="🗂" title={EMPTY[tab].title} desc={EMPTY[tab].desc} />
	</Card>
{:else if data.error}
	<Card>
		<ErrorState
			title="부동산 자료를 불러오지 못했어요"
			desc="잠시 후 다시 시도해 주세요. 마지막으로 불러온 시각은 {formatKstShort(
				data.loadedAt
			)}예요."
			onretry={() => invalidateAll()}
		/>
	</Card>
{:else if data.items.length === 0}
	<Card>
		<EmptyState
			icon="🗂"
			title={tab === 'map' ? '지도에 표시할 단지가 없어요' : '관심 단지가 아직 없어요'}
			desc="단지에 위치 정보가 들어오면 지도와 목록에 함께 보여요."
		/>
	</Card>
{:else}
	{#if data.priceError}
		<div class="gap">
			<Banner tone="warn">가격 자료를 불러오지 못해 가격 없이 보여요.</Banner>
		</div>
	{/if}
	{#if tab === 'watch'}
		<WatchTab items={data.items} openId={data.query.c} {mapHref} />
	{:else}
		<MapTab
			items={data.items}
			mapKeyId={data.mapKeyId}
			asOfText={data.priceAsOf ? `${data.priceAsOf} 기준` : ''}
			initialId={data.query.c}
			{watchHref}
		/>
	{/if}
{/if}

<style>
	.subnav {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--color-line);
		overflow-x: auto;
		margin-bottom: 12px;
	}
	.subnav a {
		padding: 10px 14px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		color: var(--color-muted);
		font-weight: 500;
		border-bottom: 3px solid transparent;
		text-decoration: none;
	}
	.subnav a[aria-current='page'] {
		color: var(--color-accent);
		font-weight: 700;
		border-bottom-color: var(--color-accent);
	}
	.subnav a:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	.gap {
		margin-bottom: 12px;
	}
</style>
