<script lang="ts">
	/**
	 * FE-06 타임라인(기본 보기, 결정 ⑥). DS §7-9: 축은 중립 회색 선·점만, 구분은 배지·글자로.
	 * 날짜 구분선 위 날짜 헤더. 선택한 카드는 테두리만 강조(왼쪽 색 세로선 없음).
	 */
	import Money from '$lib/components/ui/Money.svelte';
	import JournalKindBadges from './JournalKindBadges.svelte';
	import { dotDate, groupByDate, qtyText, type JournalItem } from '$lib/journal/view';

	let {
		items,
		selectedId,
		onopen
	}: { items: JournalItem[]; selectedId: string | null; onopen: (id: string) => void } = $props();

	let groups = $derived(groupByDate(items));
</script>

<ol class="timeline" data-testid="journal-timeline">
	{#each groups as g (g.date)}
		<li class="day">
			<h3 class="dayhead num">{dotDate(g.date)}</h3>
			<ol class="cards">
				{#each g.items as it (it.id)}
					<li>
						<button
							type="button"
							class="tl-card"
							data-id={it.id}
							aria-current={selectedId === it.id ? 'true' : undefined}
							onclick={() => onopen(it.id)}
						>
							<JournalKindBadges item={it} />
							<span class="title">{it.title}</span>
							{#if it.price != null && it.currency}
								<span class="mw-sub num"
									><Money value={it.price} currency={it.currency} kind="unit" />{#if it.qty != null}
										· {qtyText(it.qty, it.instrument_asset_type)}{/if}</span
								>
							{/if}
						</button>
					</li>
				{/each}
			</ol>
		</li>
	{/each}
</ol>

<style>
	.timeline,
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.timeline {
		position: relative;
		padding-left: 22px;
	}
	.timeline::before {
		content: '';
		position: absolute;
		left: 6px;
		top: 6px;
		bottom: 6px;
		width: 2px;
		background: var(--color-line);
	}
	.dayhead {
		font-weight: 700;
		font-size: var(--text-sm);
		color: var(--color-muted);
		margin: 6px 0 8px;
	}
	.cards > li {
		position: relative;
		padding-bottom: 14px;
	}
	.cards > li::before {
		content: '';
		position: absolute;
		left: -21px;
		top: 16px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-surface);
		border: 3px solid var(--color-line-strong);
		box-sizing: border-box;
	}
	.tl-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		min-height: 56px;
		text-align: left;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-card-line, var(--color-line));
		border-radius: var(--radius-md);
		padding: 12px 14px;
		box-shadow: var(--shadow-card);
		cursor: pointer;
	}
	.tl-card:hover {
		background: var(--color-surface-2);
	}
	.tl-card:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	.tl-card[aria-current='true'] {
		border-color: var(--color-line-strong);
		box-shadow: 0 0 0 1px var(--color-line-strong);
	}
	.title {
		font-weight: 600;
		line-height: 1.4rem;
	}
	.mw-sub {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
</style>
