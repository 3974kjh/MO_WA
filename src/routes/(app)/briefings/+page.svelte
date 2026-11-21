<script lang="ts">
	// FE-10: 목록 검색·URL 상태(?q=&tag=&month=). FE-04: 월 그룹(sticky 헤더)·행 전체 링크·등락률(PC)·페이지 이동.
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Delta from '$lib/components/ui/Delta.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import MonthGroupList from '$lib/components/ui/MonthGroupList.svelte';
	import Tag from '$lib/components/ui/Tag.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import { gotoListSearch } from '$lib/routing/listNav';
	import { createSearchSync } from '$lib/routing/searchSync';
	import {
		briefingSearch,
		isValidTag,
		SEARCH_DEBOUNCE_MS,
		type BriefingQuery
	} from '$lib/routing/listQuery';
	import {
		briefingDetailPath,
		dateParts,
		groupByMonth,
		headlineText
	} from '$lib/routing/briefings';

	type BriefingListItem = PageData['briefings']['items'][number];

	let { data }: { data: PageData } = $props();

	// 입력 중인 글자(끝 공백 포함)는 지키고, 뒤로 가기 등으로 URL이 바뀌었을 때만 맞춘다.
	let qInput = $state('');
	let box = $state<ReturnType<typeof SearchBox>>();
	// FE-10 Low-1: 입력 대기 중이거나 우리가 보낸 q로의 이동이 아직 안 끝났으면 입력창을 덮지 않는다.
	const sync = createSearchSync();
	$effect.pre(() => {
		const q = data.query.q;
		// qInput은 추적하지 않는다(입력할 때마다 되돌리지 않도록). load 결과가 바뀔 때만 실행.
		untrack(() => {
			const v = sync.next(q, qInput, box?.isPending() ?? false);
			if (v !== null) qInput = v;
		});
	});
	// 뒤로 가기·링크 등 우리가 만들지 않은 이동: 대기 중인 입력을 버리고 URL 값을 따른다.
	beforeNavigate((nav) => {
		if (nav.type === 'goto') return;
		box?.cancel();
		sync.reset();
	});

	/**
	 * 쿼리 이동. 대기 중인 디바운스는 먼저 취소하고, 입력창의 현재 글자를 같은 이동에 싣는다
	 * (200ms 뒤 이전 q가 이 이동을 덮어쓰지 않도록). pageNo는 페이지 이동용.
	 */
	function navigate(next: Partial<BriefingQuery>, replaceState = false, pageNo?: number) {
		box?.cancel();
		if (next.q !== undefined) qInput = next.q;
		const q = next.q ?? qInput;
		const search = briefingSearch({ ...data.query, ...next, q }, { page: pageNo });
		const done = () => sync.settled(q);
		sync.sent(q);
		const nav = gotoListSearch(resolve('/briefings'), search, replaceState);
		if (nav) nav.then(done, done);
		else done();
	}

	let tags = $derived(
		// 허용 문자 밖 태그는 칩으로 내지 않는다(눌러도 필터가 버려지므로, FE-10 Low-2).
		[...data.briefings.items.flatMap((b) => b.tags), data.query.tag].filter(
			(t, i, all) => isValidTag(t) && all.indexOf(t) === i
		)
	);
	let groups = $derived(groupByMonth(data.briefings.items));
	let pageNo = $derived(data.briefings.page);
	let totalPages = $derived(data.briefings.totalPages);
	let filtered = $derived(Boolean(data.query.q || data.query.tag || data.query.month));
</script>

<svelte:head><title>브리핑 · MO_WA</title></svelte:head>

<div class="toolbar">
	<div class="row">
		<div class="grow">
			<SearchBox
				bind:this={box}
				bind:value={qInput}
				label="브리핑 검색"
				placeholder="키워드 검색 (예: 사이드카)"
				debounce={SEARCH_DEBOUNCE_MS}
				oninput={(v) => navigate({ q: v }, true)}
			/>
		</div>
		<label class="month">
			<span class="sr-only">월</span>
			<input
				type="month"
				value={data.query.month}
				onchange={(e) => navigate({ month: e.currentTarget.value })}
			/>
		</label>
	</div>
	{#if tags.length}
		<div class="chips" role="group" aria-label="태그 필터">
			<FilterChip pressed={!data.query.tag} onclick={() => navigate({ tag: '' })}>전체</FilterChip>
			{#each tags as t (t)}
				<FilterChip pressed={data.query.tag === t} onclick={() => navigate({ tag: t })}
					>{t}</FilterChip
				>
			{/each}
		</div>
	{/if}
	<p class="count" aria-live="polite">{data.briefings.total}건</p>
</div>

{#if data.error}
	<ErrorState desc="잠시 후 다시 시도해 주세요." />
{:else if data.briefings.items.length === 0}
	<EmptyState
		title={filtered ? '조건에 맞는 브리핑이 없어요' : '아직 브리핑이 없어요'}
		desc={filtered ? '검색어나 필터를 바꿔 보세요.' : undefined}
	>
		{#snippet action()}
			{#if filtered}
				<button type="button" class="btn" onclick={() => navigate({ q: '', tag: '', month: '' })}
					>필터 초기화</button
				>
			{/if}
		{/snippet}
	</EmptyState>
{:else}
	<div class="groups" data-testid="briefing-list">
		<MonthGroupList {groups} itemKey={(b) => b.id}>
			{#snippet item(b: BriefingListItem)}
				{@const path = briefingDetailPath(b)}
				{@const d = dateParts(b.report_date)}
				{@const hl = headlineText(b.headline)}
				{#snippet row()}
					<span class="date-col num">
						{#if d}<b>{d.day}</b><span>{d.month}월 {d.weekday}</span>{:else}{b.report_date}{/if}
					</span>
					<span class="body">
						<span class="headline" class:missing={hl.missing}>{hl.text}</span>
						{#if b.tags.length}
							<span class="tags">
								{#each b.tags as t (t)}<Tag>{t}</Tag>{/each}
							</span>
						{/if}
					</span>
					{#if b.kospi_change_pct != null}
						<span class="pct hide-sm"><Delta value={b.kospi_change_pct} /></span>
					{/if}
				{/snippet}
				{#if path}
					<a class="item" href={resolve(path)}>{@render row()}</a>
				{:else}
					<div class="item">{@render row()}</div>
				{/if}
			{/snippet}
		</MonthGroupList>
	</div>
	{#if totalPages > 1}
		<nav class="pager" aria-label="페이지">
			<button
				type="button"
				class="btn"
				disabled={pageNo <= 1}
				onclick={() => navigate({}, false, pageNo - 1)}>이전</button
			>
			<span class="num text-sm">{pageNo} / {totalPages}</span>
			<button
				type="button"
				class="btn"
				disabled={pageNo >= totalPages}
				onclick={() => navigate({}, false, pageNo + 1)}>다음</button
			>
		</nav>
	{/if}
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
		gap: 12px;
		align-items: center;
	}
	.grow {
		flex: 1 1 220px;
		min-width: 0;
	}
	.month input {
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
	.item {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 56px;
		padding: 12px 16px;
		color: inherit;
		text-decoration: none;
	}
	a.item:hover {
		background: var(--color-surface-2);
	}
	.date-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: none;
		width: 44px;
		color: var(--color-muted);
		font-size: var(--text-xs);
	}
	.date-col b {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-text);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}
	.headline {
		font-weight: 600;
		line-height: 1.4rem;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.headline.missing {
		color: var(--color-muted);
		font-weight: 400;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pct {
		flex: none;
		min-width: 64px;
		text-align: right;
		font-size: var(--text-sm);
	}
	@media (max-width: 767px) {
		.hide-sm {
			display: none;
		}
	}
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
	}
	.btn {
		min-height: var(--size-touch);
		padding: 0 14px;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
	}
	.btn:disabled {
		opacity: 0.5;
	}
</style>
