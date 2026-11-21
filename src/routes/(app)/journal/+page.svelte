<script lang="ts">
	// FE-10: 목록 검색·URL 상태(?type=&ticker=&view=&q=). 행 디자인·상세 패널은 FE-06에서 채운다.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import {
		cleanText,
		JOURNAL_TYPE_LABEL,
		JOURNAL_TYPES,
		journalSearch,
		SEARCH_DEBOUNCE_MS,
		type JournalQuery,
		type JournalView
	} from '$lib/routing/listQuery';

	let { data }: { data: PageData } = $props();

	/** G-10 상태 라벨 */
	const STATE_LABEL: Record<string, string> = {
		pending: '대기',
		done: '실행',
		hold: '보류',
		closed: '종료'
	};
	const VIEW_OPTIONS: { value: JournalView; label: string }[] = [
		{ value: 'tl', label: '타임라인' },
		{ value: 'tb', label: '표' }
	];

	type Row = {
		id: string;
		entry_date: string;
		kind: string;
		state: string;
		title: string;
		tickers: string[];
	};
	let rows = $derived(
		data.journal.items.map((r) => ({
			id: String(r.id),
			entry_date: String(r.entry_date ?? ''),
			kind: String(r.kind ?? ''),
			state: String(r.state ?? ''),
			title: String(r.title ?? ''),
			tickers: Array.isArray(r.tickers) ? r.tickers.map(String) : []
		})) satisfies Row[]
	);
	const typeLabel = (k: string) => JOURNAL_TYPE_LABEL[k as keyof typeof JOURNAL_TYPE_LABEL] ?? k;

	let qInput = $state('');
	$effect.pre(() => {
		const q = data.query.q;
		// qInput은 추적하지 않는다(입력할 때마다 되돌리지 않도록). URL의 q가 바뀔 때만 실행.
		untrack(() => {
			if (cleanText(qInput) !== q) qInput = q;
		});
	});

	function navigate(next: Partial<JournalQuery>, replaceState = false) {
		const search = journalSearch({ ...data.query, ...next });
		if (search === page.url.search) return;
		// 경로는 resolve()로 만들고 쿼리만 붙인다.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/journal')}${search}`, { replaceState, keepFocus: true, noScroll: true });
	}

	let tickers = $derived(
		[...rows.flatMap((r) => r.tickers), data.query.ticker].filter(
			(t, i, all) => t !== '' && all.indexOf(t) === i
		)
	);
	let filtered = $derived(Boolean(data.query.q || data.query.type || data.query.ticker));
</script>

<svelte:head><title>매매일지 · MO_WA</title></svelte:head>

<div class="toolbar">
	<div class="row">
		<div class="grow">
			<SearchBox
				bind:value={qInput}
				label="일지 검색"
				placeholder="제목·메모 검색"
				debounce={SEARCH_DEBOUNCE_MS}
				oninput={(v) => navigate({ q: v }, true)}
			/>
		</div>
		<label>
			<span class="sr-only">종목</span>
			<select
				class="select"
				value={data.query.ticker}
				onchange={(e) => navigate({ ticker: e.currentTarget.value })}
			>
				<option value="">모든 종목</option>
				{#each tickers as t (t)}<option value={t}>{t}</option>{/each}
			</select>
		</label>
		<SegmentedControl
			ariaLabel="보기 방식"
			options={VIEW_OPTIONS}
			value={data.query.view}
			onchange={(v) => navigate({ view: v })}
		/>
	</div>
	<div class="chips" role="group" aria-label="구분 필터">
		<FilterChip pressed={!data.query.type} onclick={() => navigate({ type: '' })}>전체</FilterChip>
		{#each JOURNAL_TYPES as t (t)}
			<FilterChip pressed={data.query.type === t} onclick={() => navigate({ type: t })}
				>{JOURNAL_TYPE_LABEL[t]}</FilterChip
			>
		{/each}
	</div>
	<p class="count" aria-live="polite">{data.journal.total}건</p>
</div>

{#if data.error}
	<ErrorState desc="잠시 후 다시 시도해 주세요." />
{:else if rows.length === 0}
	<EmptyState
		title={filtered ? '조건에 맞는 일지가 없어요' : '아직 일지가 없어요'}
		desc={filtered ? '검색어나 필터를 바꿔 보세요.' : undefined}
	>
		{#snippet action()}
			{#if filtered}
				<button type="button" class="btn" onclick={() => navigate({ q: '', type: '', ticker: '' })}
					>필터 초기화</button
				>
			{/if}
		{/snippet}
	</EmptyState>
{:else if data.query.view === 'tb'}
	<div class="tbl-wrap">
		<table data-testid="journal-table">
			<thead>
				<tr><th>날짜</th><th>구분</th><th>제목</th><th>종목</th><th>상태</th></tr>
			</thead>
			<tbody>
				{#each rows as r (r.id)}
					<tr>
						<td class="num">{r.entry_date}</td>
						<td>{typeLabel(r.kind)}</td>
						<td>{r.title}</td>
						<td>{r.tickers.join(', ')}</td>
						<td>{STATE_LABEL[r.state] ?? r.state}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<ul class="list" data-testid="journal-timeline">
		{#each rows as r (r.id)}
			<li>
				<span class="date num">{r.entry_date}</span>
				<span class="grow">
					<span class="meta">{typeLabel(r.kind)} · {STATE_LABEL[r.state] ?? r.state}</span>
					<span class="title">{r.title}</span>
				</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 16px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.grow {
		flex: 1 1 200px;
		min-width: 0;
	}
	.select {
		height: var(--size-touch);
		padding: 0 10px;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
	}
	.count {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.list li {
		display: flex;
		gap: 12px;
		padding: 12px 16px;
		border-top: 1px solid var(--color-line);
	}
	.list li:first-child {
		border-top: 0;
	}
	.list .grow {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.date,
	.meta {
		color: var(--color-muted);
		font-size: var(--text-sm);
		flex: none;
	}
	.title {
		font-weight: 600;
	}
	.tbl-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	th,
	td {
		text-align: left;
		padding: 10px 12px;
		border-top: 1px solid var(--color-line);
		white-space: nowrap;
	}
	thead th {
		border-top: 0;
		color: var(--color-muted);
		font-weight: 600;
	}
	.btn {
		min-height: var(--size-touch);
		padding: 0 14px;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
	}
</style>
