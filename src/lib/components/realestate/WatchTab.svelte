<script lang="ts">
	/**
	 * FE-12 ④ 관심 단지 골격(시안 realestate.html '관심 단지'): 단지 카드 격자(모바일 1열 · 태블릿 이상 2열).
	 * 지도 탭과 같은 단지 자료(점수·실거래 중앙값·네이버 링크)만 쓴다. 시안의 최저 호가·180일 거래·점수 근거 펼침·
	 * 지역 칩·정렬은 이 화면이 읽는 자료에 없어 후속(FE-12d)으로 둔다.
	 */
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { TIER_LABEL, isLocated, type ComplexItem } from '$lib/maps/points';
	import ComplexInfo from './ComplexInfo.svelte';

	let {
		items,
		openId = null,
		mapHref
	}: { items: ComplexItem[]; openId?: string | null; mapHref: (id: string) => string } = $props();

	let groups = $derived(
		(['top', 'target', 'cand'] as const)
			.map((t) => ({ t, rows: items.filter((i) => i.tier === t) }))
			.filter((g) => g.rows.length)
	);
</script>

{#if groups.length === 0}
	<Card>
		<EmptyState
			icon="🗂"
			title="관심 단지가 아직 없어요"
			desc="관심 단지가 정해지면 점수와 실거래 중앙값이 카드로 보여요."
		/>
	</Card>
{:else}
	{#each groups as g (g.t)}
		<section class="grp" aria-labelledby="w-{g.t}">
			<h2 id="w-{g.t}">{TIER_LABEL[g.t]} <span class="n">{g.rows.length}곳</span></h2>
			<ul class="re-cards" data-testid="watch-cards">
				{#each g.rows as it (it.id)}
					<li id="w-{it.id}" class:open={openId === it.id}>
						<article class="card">
							<h3>{it.name}</h3>
							<ComplexInfo item={it} />
							{#if isLocated(it)}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 주소는 page의 href()가 resolve('/(app)/realestate')에 ?tab을 붙여 만든 것 -->
								<a class="lnk" href={mapHref(it.id)}>지도에서 위치 보기</a>{/if}
						</article>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style>
	.grp {
		margin-bottom: 20px;
	}
	h2 {
		font-size: var(--text-lg);
		font-weight: 700;
		margin: 0 0 8px;
	}
	.n {
		font-size: var(--text-sm);
		color: var(--color-subtle);
		font-weight: 500;
	}
	.re-cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 639px) {
		.re-cards {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.re-cards > li {
		min-width: 0;
	}
	h3 {
		font-size: var(--text-lg);
		font-weight: 700;
		margin: 0 0 6px;
		overflow-wrap: anywhere;
	}
	.card {
		height: 100%;
	}
	.open .card {
		outline: 2px solid var(--color-accent);
	}
	.lnk {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-weight: 600;
		color: var(--color-accent);
	}
</style>
