<script lang="ts">
	/** FE-06 표 보기(`?view=tb`). 행 클릭·Enter로 상세. 가격은 단가(Money kind=unit, 행 통화). */
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { Col } from '$lib/components/ui/types';
	import JournalKindBadges from './JournalKindBadges.svelte';
	import {
		JOURNAL_STATE_LABEL,
		JOURNAL_STATE_TONE,
		dotDate,
		itemTickers,
		qtyText,
		type JournalItem
	} from '$lib/journal/view';

	let { items, onopen }: { items: JournalItem[]; onopen: (id: string) => void } = $props();

	const columns: Col<JournalItem>[] = [
		{ key: 'entry_date', label: '날짜', num: true, render: dateCell },
		{ key: 'kind', label: '구분', render: kindCell },
		{ key: 'title', label: '제목', title: true, render: titleCell },
		{ key: 'tickers', label: '종목', render: tickerCell },
		{ key: 'price', label: '가격', align: 'right', render: priceCell },
		{ key: 'qty', label: '수량', align: 'right', render: qtyCell },
		{ key: 'state', label: '상태', render: stateCell }
	];
</script>

{#snippet dateCell(r: JournalItem)}{dotDate(r.entry_date)}{/snippet}
{#snippet kindCell(r: JournalItem)}<JournalKindBadges
		item={{ ...r, tickers: [], instrument_ticker: null }}
		state={false}
	/>{/snippet}
{#snippet titleCell(r: JournalItem)}{r.title}{/snippet}
{#snippet tickerCell(r: JournalItem)}{itemTickers(r).join(', ') || '—'}{/snippet}
{#snippet priceCell(r: JournalItem)}{#if r.price != null && r.currency}<Money
			value={r.price}
			currency={r.currency}
			kind="unit"
		/>{:else}—{/if}{/snippet}
{#snippet qtyCell(r: JournalItem)}{r.qty == null
		? '—'
		: qtyText(r.qty, r.instrument_asset_type)}{/snippet}
{#snippet stateCell(r: JournalItem)}{#if r.kind === 'review'}—{:else}<Badge
			tone={JOURNAL_STATE_TONE[r.state]}>{JOURNAL_STATE_LABEL[r.state]}</Badge
		>{/if}{/snippet}

<div data-testid="journal-table">
	<DataTable
		{columns}
		rows={items}
		mobile="cards"
		caption="매매일지 표"
		rowKey={(r) => r.id}
		rowLabel={(r) => `${dotDate(r.entry_date)} ${r.title} 상세 보기`}
		onrowclick={(r) => onopen(r.id)}
	/>
</div>
