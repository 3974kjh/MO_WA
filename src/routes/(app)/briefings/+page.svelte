<script lang="ts">
	// FE-10: 목록 검색·URL 상태(?q=&tag=&month=). 카드 디자인·상세 링크·페이지 이동은 FE-04에서 채운다.
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import { gotoListSearch } from '$lib/routing/listNav';
	import { createSearchSync } from '$lib/routing/searchSync';
	import {
		briefingSearch,
		isValidTag,
		SEARCH_DEBOUNCE_MS,
		type BriefingQuery
	} from '$lib/routing/listQuery';

	let { data }: { data: PageData } = $props();

	const HEADLINE_MISSING = 'headline 미입력';

	// 입력 중인 글자(끝 공백 포함)는 지키고, 뒤로 가기 등으로 URL이 바뀌었을 때만 맞춘다.
	let qInput = $state('');
	let box = $state<ReturnType<typeof SearchBox>>();
	// FE-10 Low-1: 입력 대기 중이거나 우리가 보낸 q의 이동이 아직 안 끝났으면 입력창을 덮지 않는다.
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
	 * (200ms 뒤 이전 q가 이 이동을 덮어쓰지 않도록).
	 */
	function navigate(next: Partial<BriefingQuery>, replaceState = false) {
		box?.cancel();
		if (next.q !== undefined) qInput = next.q;
		const q = next.q ?? qInput;
		const search = briefingSearch({ ...data.query, ...next, q });
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
	<ul class="list" data-testid="briefing-list">
		{#each data.briefings.items as b (b.id)}
			<li>
				<span class="date num">{b.report_date}</span>
				<span class="headline" class:missing={!b.headline?.trim()}
					>{b.headline?.trim() || HEADLINE_MISSING}</span
				>
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
	.date {
		color: var(--color-muted);
		flex: none;
	}
	.headline {
		font-weight: 600;
	}
	.headline.missing {
		color: var(--color-muted);
		font-weight: 400;
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
