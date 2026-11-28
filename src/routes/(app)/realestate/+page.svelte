<script lang="ts">
	/**
	 * FE-12 `/realestate` 골격 + ⑤ 지도 탭(시안 design/screens/realestate.html 5-5, PLAN naver-map §3).
	 * - 탭 줄은 확정 5탭을 보이되 지금은 지도만 열려 있다(나머지는 '준비 중', 이유 문장 표시).
	 *   지도는 기본 탭이라 링크는 `/realestate`(다른 탭이 열리면 `?tab=`을 붙인다).
	 * - 지도 컴포넌트(ComplexMap)는 키가 있을 때만 import()한다 → 라우트 동기 클로저에 지도 코드·SDK 없음.
	 *   키가 없거나 청크가 안 오면 MapFallback(동기)이 같은 자리를 채운다. 목록·정보 카드는 늘 보인다.
	 * - 표시 전용: 쓰기 액션 없음.
	 */
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import ComplexDetail from '$lib/components/realestate/ComplexDetail.svelte';
	import ComplexList from '$lib/components/realestate/ComplexList.svelte';
	import MapFallback from '$lib/components/realestate/MapFallback.svelte';
	import { formatKstShort } from '$lib/format/datetime';
	import { lazyImport } from '$lib/lazyImport';
	import { isLocated } from '$lib/maps/points';
	import { RE_TABS } from '$lib/realestate/view';

	let { data }: { data: PageData } = $props();

	const mapChunk = lazyImport(() => import('$lib/components/realestate/ComplexMap.svelte'));

	let located = $derived(data.items.filter(isLocated));
	// 처음 고를 단지: 주소의 c → 없으면 1위(시안: PC는 1위를 펼쳐 둔다)
	// svelte-ignore state_referenced_locally
	let picked = $state<string | null>(
		data.items.find((i) => i.id === data.query.c)?.id ?? data.items[0]?.id ?? null
	);
	let selected = $derived(data.items.find((i) => i.id === picked) ?? null);
	let attempt = $state(0);
	const select = (id: string) => (picked = id);
</script>

<svelte:head><title>부동산 · MO_WA</title></svelte:head>

<nav class="tabs" aria-label="부동산 하위 탭">
	{#each RE_TABS as t (t.id)}
		{#if t.ready}
			<a
				href={resolve('/(app)/realestate')}
				aria-current={data.query.tab === t.id ? 'page' : undefined}>{t.label}</a
			>
		{:else}
			<span class="off" aria-disabled="true" aria-describedby="re-tabs-why"
				>{t.label}<span class="soon">준비 중</span></span
			>
		{/if}
	{/each}
</nav>
<p class="why" id="re-tabs-why">다른 탭은 준비 중이에요. 지금은 지도와 단지 목록을 볼 수 있어요.</p>

{#if data.error}
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
			title="지도에 표시할 단지가 없어요"
			desc="관심 단지에 위치 정보가 들어오면 지도와 목록에 함께 보여요."
		/>
	</Card>
{:else}
	<p class="asof" data-testid="re-asof">
		<b>단지 위치</b> 지도 {data.located}곳{#if data.missing}
			· 위치 정보 없음 {data.missing}곳{/if}{#if data.priceAsOf}
			<span class="sep">·</span> <b>가격</b> {data.priceAsOf} 기준{/if}
	</p>
	{#if data.priceError}
		<div class="gap">
			<Banner tone="warn">가격 자료를 불러오지 못해 가격 없이 보여요.</Banner>
		</div>
	{/if}
	<a class="skip" href="#re-list">지도 건너뛰고 단지 목록으로</a>
	<div class="grid">
		<div class="c-7 stack">
			<Card title="단지 위치" sub="{data.located}곳 · 핀 숫자는 총점">
				{#if located.length === 0}
					<EmptyState
						icon="🗂"
						title="지도에 표시할 단지가 없어요"
						desc="관심 단지에 위치 정보가 들어오면 지도와 목록에 함께 보여요."
					/>
				{:else if !data.mapKeyId}
					<div class="mapbox" data-testid="complex-map" data-state="nokey" data-markers="0">
						<MapFallback reason="nokey" />
					</div>
				{:else}
					{#key attempt}
						{#await mapChunk.load()}
							<div class="mapbox" data-testid="complex-map" data-state="init" data-markers="0">
								<div class="ld" role="status">지도를 불러오는 중…</div>
							</div>
						{:then { default: ComplexMap }}
							<ComplexMap
								items={located}
								keyId={data.mapKeyId}
								selectedId={picked}
								onselect={select}
							/>
						{:catch}
							<div
								class="mapbox"
								data-testid="complex-map"
								data-state="load-failed"
								data-markers="0"
							>
								<MapFallback reason="load-failed" onretry={() => attempt++} />
							</div>
						{/await}
					{/key}
				{/if}
			</Card>
			<ComplexDetail item={selected} />
		</div>
		<div class="c-5" id="re-list" tabindex="-1">
			<Card flush title="단지 목록" sub="총점 높은 순 · {data.items.length}곳">
				<ComplexList items={data.items} selectedId={picked} onselect={select} />
			</Card>
		</div>
	</div>
{/if}

<style>
	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--color-line);
		overflow-x: auto;
	}
	.tabs a,
	.tabs .off {
		padding: 10px 14px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		color: var(--color-muted);
		font-weight: 500;
		border-bottom: 3px solid transparent;
		text-decoration: none;
	}
	.tabs a[aria-current='page'] {
		color: var(--color-accent);
		font-weight: 700;
		border-bottom-color: var(--color-accent);
	}
	.tabs .off {
		color: var(--color-subtle);
		cursor: not-allowed;
	}
	.soon {
		font-size: var(--text-xs);
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--color-surface-2);
	}
	.why,
	.asof {
		margin: 8px 0 12px;
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.asof b {
		color: var(--color-text);
		font-weight: 600;
	}
	.sep {
		color: var(--color-subtle);
	}
	.skip {
		position: absolute;
		left: -9999px;
	}
	.skip:focus {
		position: static;
		display: inline-block;
		margin-bottom: 8px;
		color: var(--color-accent);
		font-weight: 600;
	}
	.gap {
		margin-bottom: 12px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 16px;
	}
	.grid > * {
		grid-column: span 12;
		min-width: 0;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (min-width: 1024px) {
		.c-7 {
			grid-column: span 7;
		}
		.c-5 {
			grid-column: span 5;
		}
	}
	.mapbox {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		max-height: 560px;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-surface-2);
	}
	@media (max-width: 639px) {
		.mapbox {
			aspect-ratio: auto;
			height: 320px;
		}
	}
	.ld {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
</style>
