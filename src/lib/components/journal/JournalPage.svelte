<script lang="ts">
	/**
	 * FE-06 매매일지 화면(`/journal`과 `/journal/[id]`가 같은 컴포넌트를 쓴다).
	 *
	 * - FE-10 URL 상태 `?type=&ticker=&view=&q=`(+page). 기본 보기는 타임라인, `?view=tb`일 때만 표.
	 * - 구분 칩 5종 + 전체: 건수, aria-pressed. 필터 결과 건수는 aria-live.
	 * - 상세: shallow routing(pushState). 목록에서 열면 `/journal/[id]?…`로 URL만 바꾸고(page.state.journalId),
	 *   닫으면 history.back(). 새로고침·직접 진입은 서버가 `/journal/[id]`를 같은 화면으로 렌더한다.
	 *   PC(≥1024) 우측 sticky 400px 패널 · 태블릿(640~1023) 중앙 모달 · 모바일 전체 시트('← 목록으로').
	 *   이전/다음은 같은 쪽 목록 안에서 replaceState로 옮긴다(뒤로 가기 한 번이면 목록).
	 */
	import { beforeNavigate, goto, invalidateAll, pushState, replaceState } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import Banner from '$lib/components/ui/Banner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import { toast } from '$lib/components/ui/toast.svelte';
	import { gotoListSearch } from '$lib/routing/listNav';
	import { createSearchSync } from '$lib/routing/searchSync';
	import {
		JOURNAL_TYPE_LABEL,
		JOURNAL_TYPES,
		journalSearch,
		SEARCH_DEBOUNCE_MS,
		type JournalQuery,
		type JournalView
	} from '$lib/routing/listQuery';
	import {
		detailPath,
		kstToday,
		neighbors,
		type InstrumentOption,
		type JournalItem,
		type KindCounts,
		type ReportOption
	} from '$lib/journal/view';
	import { JOURNAL_SAVED_NOTICE, JOURNAL_SAVED_TRADE_NOTICE } from '$lib/journal/form';
	import JournalDetail from './JournalDetail.svelte';
	import JournalForm from './JournalForm.svelte';
	import JournalTable from './JournalTable.svelte';
	import JournalTimeline from './JournalTimeline.svelte';

	type Data = {
		query: JournalQuery;
		journal: {
			items: JournalItem[];
			page: number;
			total: number;
			totalPages: number;
		};
		kindCounts: KindCounts;
		kindCountsOk: boolean;
		instruments: InstrumentOption[];
		reports: ReportOption[];
		selected: JournalItem | null;
		error: string | null;
		auxError: string | null;
	};

	let { data }: { data: Data } = $props();

	const VIEW_OPTIONS: { value: JournalView; label: string }[] = [
		{ value: 'tl', label: '타임라인' },
		{ value: 'tb', label: '표' }
	];

	const base = resolve('/journal');
	const pc = new MediaQuery('(min-width: 1024px)', false);

	let items = $derived(data.journal.items);

	// ——— 검색(FE-10 Low-1 동기화 그대로) ———
	let qInput = $state('');
	let box = $state<ReturnType<typeof SearchBox>>();
	const sync = createSearchSync();
	$effect.pre(() => {
		const q = data.query.q;
		untrack(() => {
			const v = sync.next(q, qInput, box?.isPending() ?? false);
			if (v !== null) qInput = v;
		});
	});
	beforeNavigate((nav) => {
		if (nav.type === 'goto') return;
		box?.cancel();
		sync.reset();
	});

	function navigate(next: Partial<JournalQuery>, replace = false) {
		box?.cancel();
		if (next.q !== undefined) qInput = next.q;
		const q = next.q ?? qInput;
		const search = journalSearch({ ...data.query, ...next, q });
		const done = () => sync.settled(q);
		sync.sent(q);
		const nav = gotoListSearch(base, search, replace);
		if (nav) nav.then(done, done);
		else done();
	}

	let tickerOptions = $derived(
		[
			...data.instruments.filter((i) => !i.archived).map((i) => i.ticker),
			...items.flatMap((r) => r.tickers),
			data.query.ticker
		].filter((t, i, all) => t !== '' && all.indexOf(t) === i)
	);
	let filtered = $derived(Boolean(data.query.q || data.query.type || data.query.ticker));

	// ——— 상세(shallow routing) ———
	/** page.state가 있으면(우리가 pushState로 연 경우) 그것, 없으면 서버가 렌더한 `/journal/[id]` */
	let selectedId = $derived(
		page.state.journalId !== undefined ? page.state.journalId : (data.selected?.id ?? null)
	);
	let selected = $derived(
		selectedId
			? (items.find((i) => i.id === selectedId) ??
					(data.selected?.id === selectedId ? data.selected : null))
			: null
	);
	let nb = $derived(neighbors(items, selectedId));
	let position = $derived(nb.index >= 0 ? `${nb.index + 1} / ${items.length}` : null);
	let selectedReport = $derived(
		selected?.report_id ? (data.reports.find((r) => r.id === selected?.report_id) ?? null) : null
	);

	/** 목록 쿼리(현재 URL의 search 그대로 — 상세 URL도 같은 쿼리를 싣는다) */
	const currentSearch = () => page.url.search;

	// 아래 shallow routing 경로는 모두 resolve()로 만든 base에 현재 쿼리만 붙인다.
	/* eslint-disable svelte/no-navigation-without-resolve */
	function open(id: string) {
		const href = detailPath(base, id, currentSearch());
		if (selectedId && page.state.journalId)
			replaceState(href, { journalId: id, journalFromList: page.state.journalFromList === true });
		else pushState(href, { journalId: id, journalFromList: true });
	}

	function move(id: string | null) {
		if (!id) return;
		replaceState(detailPath(base, id, currentSearch()), {
			journalId: id,
			journalFromList: page.state.journalFromList === true
		});
	}

	function close() {
		if (page.state.journalFromList === true) {
			// 목록에서 pushState로 연 상세: 뒤로 가기와 같다.
			history.back();
			return;
		}
		// 직접 진입(`/journal/[id]`): 목록 URL로 바꾸고 상세만 닫는다.
		pushState(`${base}${currentSearch()}`, { journalId: null });
	}
	/* eslint-enable svelte/no-navigation-without-resolve */

	// ——— 작성·수정 ———
	let formOpen = $state(false);
	let formItem = $state<JournalItem | null>(null);
	let formKey = $state(0);
	function openForm(item: JournalItem | null) {
		formItem = item;
		formKey += 1;
		formOpen = true;
	}
	async function onsaved(r: { id: string; trade: boolean; created: boolean }) {
		formOpen = false;
		toast.show(r.trade ? JOURNAL_SAVED_TRADE_NOTICE : JOURNAL_SAVED_NOTICE, { tone: 'ok' });
		await invalidateAll();
	}

	// ——— 보관(기존 ?/archive, 확인 시트) ———
	let archiveTarget = $state<JournalItem | null>(null);
	let archiving = $state(false);
	async function confirmArchive() {
		const target = archiveTarget;
		if (!target || archiving) return;
		archiving = true;
		const body = new FormData();
		body.set('id', target.id);
		body.set('table', 'journal_entries');
		let ok: boolean;
		try {
			const res = await fetch(`${base}?/archive`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			ok = deserialize(await res.text()).type === 'success';
		} catch {
			ok = false;
		}
		archiving = false;
		archiveTarget = null;
		if (!ok) {
			toast.show('보관하지 못했어요. 잠시 후 다시 시도해 주세요.', { tone: 'err' });
			return;
		}
		toast.show('보관했어요 · 보관함에서 다시 꺼낼 수 있어요', { tone: 'ok' });
		// 상세를 닫고 목록을 다시 읽는다(경로는 resolve로 만든 base + 현재 쿼리).
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(`${base}${currentSearch()}`, {
			invalidateAll: true,
			noScroll: true,
			replaceState: true
		});
	}

	function pageHref(p: number): string {
		return `${base}${journalSearch(data.query, { page: p })}`;
	}

	let countText = $derived(
		`${data.journal.total}건` +
			(data.journal.totalPages > 1 ? ` · ${data.journal.page}/${data.journal.totalPages}쪽` : '')
	);
</script>

<svelte:head><title>매매일지 · MO_WA</title></svelte:head>

<div class="toolbar">
	<div class="row">
		<div class="grow">
			<SearchBox
				bind:this={box}
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
				{#each tickerOptions as t (t)}<option value={t}>{t}</option>{/each}
			</select>
		</label>
		<SegmentedControl
			ariaLabel="보기 방식"
			options={VIEW_OPTIONS}
			value={data.query.view}
			onchange={(v) => navigate({ view: v })}
		/>
		<button type="button" class="btn primary" onclick={() => openForm(null)}>일지 쓰기</button>
	</div>
	<div class="chips" role="group" aria-label="구분 필터" data-testid="journal-chips">
		<FilterChip
			pressed={!data.query.type}
			count={data.kindCountsOk ? data.kindCounts.all : undefined}
			onclick={() => navigate({ type: '' })}>전체</FilterChip
		>
		{#each JOURNAL_TYPES as t (t)}
			<FilterChip
				pressed={data.query.type === t}
				count={data.kindCountsOk ? data.kindCounts[t] : undefined}
				onclick={() => navigate({ type: t })}>{JOURNAL_TYPE_LABEL[t]}</FilterChip
			>
		{/each}
	</div>
	<p class="count" aria-live="polite" data-testid="journal-count">{countText}</p>
</div>

{#if data.auxError}
	<div class="aux">
		<Banner tone="warn">일부 정보(건수·종목·리포트 목록)를 불러오지 못했어요.</Banner>
	</div>
{/if}

<div class="split" class:with-panel={pc.current}>
	<div class="main">
		{#if data.error}
			<ErrorState desc="잠시 후 다시 시도해 주세요." />
		{:else if items.length === 0}
			<EmptyState
				title={filtered ? '조건에 맞는 일지가 없어요' : '아직 일지가 없어요'}
				desc={filtered ? '검색어나 필터를 바꿔 보세요.' : '‘일지 쓰기’로 첫 기록을 남겨 보세요.'}
			>
				{#snippet action()}
					{#if filtered}
						<button
							type="button"
							class="btn"
							onclick={() => navigate({ q: '', type: '', ticker: '' })}>필터 초기화</button
						>
					{/if}
				{/snippet}
			</EmptyState>
		{:else if data.query.view === 'tb'}
			<JournalTable {items} onopen={open} />
		{:else}
			<JournalTimeline {items} {selectedId} onopen={open} />
		{/if}

		{#if data.journal.totalPages > 1}
			<nav class="pager" aria-label="쪽 이동">
				{#if data.journal.page > 1}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve('/journal') + 쿼리 -->
					<a class="btn" href={pageHref(data.journal.page - 1)}>‹ 이전 쪽</a>
				{/if}
				<span class="num">{data.journal.page} / {data.journal.totalPages}</span>
				{#if data.journal.page < data.journal.totalPages}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve('/journal') + 쿼리 -->
					<a class="btn" href={pageHref(data.journal.page + 1)}>다음 쪽 ›</a>
				{/if}
			</nav>
		{/if}
	</div>

	{#if pc.current}
		<aside class="panel" aria-label="일지 상세" data-testid="journal-panel">
			{#if selected}
				<JournalDetail
					item={selected}
					report={selectedReport}
					{position}
					prev={nb.prev}
					next={nb.next}
					onprev={() => move(nb.prev)}
					onnext={() => move(nb.next)}
					onedit={() => openForm(selected)}
					onarchive={() => (archiveTarget = selected)}
				/>
				<button type="button" class="btn ghost sm close" onclick={close}>닫기</button>
			{:else}
				<p class="muted">일지를 고르면 여기에 자세히 보여요.</p>
			{/if}
		</aside>
	{/if}
</div>

{#if !pc.current}
	<Sheet
		open={selected != null}
		onclose={close}
		variant="full"
		title="일지 상세"
		backLabel="목록으로"
	>
		{#if selected}
			<JournalDetail
				item={selected}
				report={selectedReport}
				{position}
				prev={nb.prev}
				next={nb.next}
				onprev={() => move(nb.prev)}
				onnext={() => move(nb.next)}
				onedit={() => openForm(selected)}
				onarchive={() => (archiveTarget = selected)}
			/>
		{/if}
	</Sheet>
{/if}

<Sheet
	open={formOpen}
	onclose={() => (formOpen = false)}
	variant="bottom"
	title={formItem ? '일지 수정' : '일지 쓰기'}
>
	{#if formOpen}
		{#key formKey}
			<JournalForm
				item={formItem}
				instruments={data.instruments}
				reports={data.reports}
				today={kstToday()}
				{onsaved}
				oncancel={() => (formOpen = false)}
			/>
		{/key}
	{/if}
</Sheet>

<Sheet
	open={archiveTarget != null}
	onclose={() => (archiveTarget = null)}
	variant="center"
	title="일지를 보관할까요?"
>
	<p class="confirm">
		‘{archiveTarget?.title ?? ''}’을(를) 목록에서 내려요. 지우지 않고 보관함에 남아서 다시 꺼낼 수
		있어요.
	</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (archiveTarget = null)}>취소</button>
		<button
			type="button"
			class="btn primary"
			data-action="journal-archive-confirm"
			aria-disabled={archiving ? 'true' : undefined}
			onclick={confirmArchive}>보관하기</button
		>
	{/snippet}
</Sheet>

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
		font-size: 16px;
	}
	@media (min-width: 640px) {
		.select {
			font-size: inherit;
		}
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
	.aux {
		margin-bottom: 12px;
	}
	.split {
		display: block;
	}
	.split.with-panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 400px;
		gap: 16px;
		align-items: start;
	}
	.main {
		min-width: 0;
	}
	.panel {
		position: sticky;
		top: 16px;
		max-height: calc(100dvh - 32px);
		overflow: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-card-line, var(--color-line));
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		padding: 16px;
	}
	.panel .close {
		margin-top: 8px;
	}
	.muted {
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
	}
	.confirm {
		margin: 0;
		line-height: 1.6rem;
	}
</style>
