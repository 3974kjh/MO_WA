<script lang="ts">
	/**
	 * FE-11 `/stocks` 보드(시안 design/screens/stocks.html, DS §7-15). 표시 전용 — 관심 종목 추가·삭제 없음.
	 * PC ≥1024 표(행 전체 클릭 + 이름 링크) / 640~1023 카드 2열 / <640 카드 1열(카드 전체 링크).
	 * 검색·구분·정렬은 화면 안에서 거르고 주소만 바꾼다(load 다시 안 함).
	 */
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Delta from '$lib/components/ui/Delta.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import MetricTile from '$lib/components/ui/MetricTile.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import StockTrigger from '$lib/components/stocks/StockTrigger.svelte';
	import { returnPct, shortDate } from '$lib/dashboard/home';
	import { triggerState } from '$lib/dashboard/trigger';
	import { formatKstShort } from '$lib/format/datetime';
	import type { BoardRow } from '$lib/server/web/stocksBoard';
	import {
		isStale,
		latestAsOf,
		marketLabel,
		matchesQuery,
		quoteBasis,
		reportKindLabel,
		sortBoard,
		stocksSearch,
		unitPrice,
		type StockFilter,
		type StockSort
	} from '$lib/stocks/view';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let q = $state(data.query.q);
	// svelte-ignore state_referenced_locally
	let f = $state<StockFilter>(data.query.f);
	// svelte-ignore state_referenced_locally
	let sort = $state<StockSort>(data.query.sort);

	// 주소는 사용자가 바꿀 때만 맞춘다(첫 실행은 건너뜀 — 하이드레이션 중엔 라우터가 아직 준비 전)
	let first = true;
	$effect(() => {
		const search = stocksSearch({ q, f, sort });
		if (first) {
			first = false;
			return;
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve 결과 + 검색어
		if (search !== page.url.search) replaceState(resolve('/(app)/stocks') + search, page.state);
	});

	type Row = BoardRow & { t: ReturnType<typeof triggerState>; distance: number | null };
	let rows = $derived(
		data.rows.map((r): Row => {
			const t = triggerState({
				price: r.price,
				trigger: r.trigger_price,
				direction: r.trigger_direction,
				watchOnly: r.watch_only
			});
			return { ...r, t, distance: 'distance' in t ? t.distance : null };
		})
	);
	let held = $derived(rows.filter((r) => r.kind === 'hold'));
	let watch = $derived(rows.filter((r) => r.kind === 'watch'));
	let shownHeld = $derived(
		sortBoard(
			held.filter((r) => matchesQuery(r, q)),
			sort
		)
	);
	let shownWatch = $derived(
		sortBoard(
			watch.filter((r) => matchesQuery(r, q)),
			sort
		)
	);
	let total = $derived(held.reduce((a, r) => a + (r.value_krw ?? 0), 0));
	let unpriced = $derived(held.filter((r) => r.value_krw == null).length);
	let up = $derived(rows.filter((r) => (r.change_pct ?? 0) > 0).length);
	let down = $derived(rows.filter((r) => (r.change_pct ?? 0) < 0).length);
	let near = $derived(rows.filter((r) => r.t.state === 'warn' || r.t.state === 'hit'));
	let asOf = $derived(latestAsOf(rows));
	let stale = $derived(isStale(asOf.last));

	const go = (r: BoardRow) => goto(resolve('/(app)/stocks/[ticker]', { ticker: r.ticker }));
	function rowClick(e: MouseEvent, r: BoardRow) {
		if (!(e.target as Element).closest('a')) go(r);
	}
</script>

<svelte:head><title>종목 · MO_WA</title></svelte:head>

<div class="top">
	<p class="lead">
		보유 종목과 관심 종목을 한곳에서 봐요. 종목을 누르면 시세·수급·목표가와 관련 리포트·매매일지를
		함께 볼 수 있어요.
	</p>
	{#if !data.error && rows.length}
		<span class="asof" data-testid="stocks-asof"
			>{#if asOf.kr || asOf.us}{[
					asOf.kr && quoteBasis(asOf.kr, 'KRX'),
					asOf.us && quoteBasis(asOf.us, 'NASDAQ')
				]
					.filter(Boolean)
					.join(' · ')}{:else}기준 시각 없음{/if}</span
		>
	{/if}
</div>

{#snippet report(r: Row)}
	{#if r.report}
		<Badge tone={r.report.subtype === 'buy_plan' ? 'info' : 'default'}
			>{reportKindLabel(r.report)}</Badge
		>
		<span class="num hint">{shortDate(r.report.report_date)}</span>
	{:else}<span class="hint">리포트 없음</span>{/if}
{/snippet}

<!-- 표 하나: ≥1024 표(행 클릭 + 이름 링크) / <1024 같은 표가 카드(2열·1열)로 바뀌고 이름 링크가 카드 전체를 덮는다 -->
{#snippet board(list: Row[], hold: boolean)}
	{#if list.length === 0}
		<div class="pad">
			<EmptyState title="검색 결과가 없어요" desc="다른 이름이나 코드로 찾아보세요." />
		</div>
	{:else}
		<div class="tw">
			<table class="tbl">
				<thead>
					<tr>
						<th scope="col">종목</th>
						<th scope="col" class="r">현재가 · 전일 대비</th>
						{#if hold}
							<th scope="col" class="r">평균 단가</th>
							<th scope="col" class="r">수익률</th>
							<th scope="col" class="r">평가금액</th>
						{:else}
							<th scope="col" class="r">감시 가격</th>
						{/if}
						<th scope="col">감시 가격까지</th>
						<th scope="col">최근 리포트</th>
					</tr>
				</thead>
				<tbody>
					{#each list as r (r.ticker)}
						{@const ret = returnPct(r)}
						<tr onclick={(e) => rowClick(e, r)}>
							<td class="nm-c">
								<a class="nm" href={resolve('/(app)/stocks/[ticker]', { ticker: r.ticker })}
									>{r.name}</a
								>
								<span class="mk">{marketLabel(r.market)}</span>
								<span class="hint"
									>{r.ticker} · {hold ? `보유${r.qty != null ? ` ${r.qty}주` : ''}` : '관심'}{r.memo
										? ` · ${r.memo}`
										: ''}</span
								>
							</td>
							<td class="r num px">
								<b>{unitPrice(r.price, r.currency)}</b>
								{#if r.change_pct != null}<Delta value={r.change_pct} />{:else}<span
										class="hint"
										aria-label="등락 없음">—</span
									>{/if}
							</td>
							{#if hold}
								<td class="r num" data-label="평균 단가">{unitPrice(r.avg_price, r.currency)}</td>
								<td class="r" data-label="수익률"
									>{#if ret != null}<Delta value={ret} digits={1} />{:else}—{/if}</td
								>
								<td class="r num" data-label="평가금액"
									>{#if r.value_krw != null}<Money value={r.value_krw} />{:else}—{/if}</td
								>
							{:else}
								<!-- '관심만'은 watch_only에만, 감시 가격이 없으면 — (DS §7-15 v1.7.5) -->
								<td class="r num" data-label="감시 가격"
									>{#if r.watch_only}<Badge>관심만</Badge>{:else if r.trigger_price == null}<span
											aria-label="감시 가격 없음">—</span
										>{:else}{unitPrice(r.trigger_price, r.currency)}
										<span class="hint"
											>{r.trigger_direction === 'above'
												? '▲ 이상으로 오르면'
												: '▼ 이하로 내려가면'}</span
										>{/if}</td
								>
							{/if}
							<td class="tg" class:none={r.t.state === 'watch'}
								>{#if r.t.state === 'watch'}<span class="hint">—</span>{:else}<StockTrigger
										t={r.t}
									/>{/if}</td
							>
							<td class="rp">{@render report(r)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/snippet}

{#if data.error}
	<Card>
		<ErrorState
			title="종목 목록을 불러오지 못했어요"
			desc="네트워크 상태를 확인한 뒤 다시 시도해 주세요. 마지막으로 불러온 시각: {formatKstShort(
				data.loadedAt
			)}"
			onretry={() => location.reload()}
		/>
	</Card>
{:else if rows.length === 0}
	<Card>
		<EmptyState
			icon="📈"
			title="아직 모아 볼 종목이 없어요"
			desc="보유 종목은 포트폴리오에 기록되면, 관심 종목은 봇이 매매일지·매수 계획서에 기록하면 여기에 모여요."
		>
			{#snippet action()}
				<a class="btn-primary-m btn preset-filled-brand" href={resolve('/portfolio')}
					>포트폴리오로 가기</a
				>
				<a class="btn-primary-m btn preset-outlined-surface-500" href={resolve('/journal')}
					>매매일지 보기</a
				>
			{/snippet}
		</EmptyState>
	</Card>
{:else}
	{#if stale}
		<div class="gap" data-testid="stocks-stale">
			<Banner>
				<b>최신 시세가 아니에요.</b> 마지막으로 받은 시세는
				<b class="num">{quoteBasis(asOf.last, asOf.last === asOf.kr ? 'KRX' : 'NASDAQ')}</b>예요.
				등락·수익률·감시 가격 거리는 이 시각 기준이에요.
				<button
					type="button"
					class="rl btn preset-outlined-surface-500"
					onclick={() => location.reload()}>다시 불러오기</button
				>
			</Banner>
		</div>
	{/if}
	<div class="tiles">
		<MetricTile
			label="보유 종목 평가금액"
			foot="보유 {held.length}종목 · 원화 환산{unpriced
				? ` · 평가금액 없는 ${unpriced}종목 제외`
				: ''}"
		>
			{#snippet value()}{#if total > 0}<Money value={total} />{:else}—{/if}{/snippet}
		</MetricTile>
		<MetricTile
			label="오늘 등락"
			value="▲{up} ▼{down}"
			foot="전체 {rows.length}종목 · 등락 없음 {rows.length - up - down}"
		/>
		<MetricTile
			label="감시 가격 3% 이내"
			value="{near.length}종목"
			foot={near.map((r) => r.name).join(', ') || '없음'}
		/>
		<MetricTile
			label="확정 전 매수 계획서"
			value="{data.drafts.length}건"
			foot="{data.drafts.length ? `${data.drafts.join(', ')} · ` : ''}게시는 내가 해요"
		/>
	</div>

	<div class="tools">
		<SearchBox bind:value={q} label="종목 검색" placeholder="종목명·코드 검색" />
		<SegmentedControl
			ariaLabel="구분"
			options={[
				{ value: 'all', label: `전체 ${rows.length}` },
				{ value: 'hold', label: `보유 ${held.length}` },
				{ value: 'watch', label: `관심 ${watch.length}` }
			]}
			value={f}
			onchange={(v) => (f = v)}
		/>
		<select class="select" aria-label="정렬" bind:value={sort}>
			<option value="default">기본 순서</option>
			<option value="chg">등락률 낮은 순</option>
			<option value="trig">감시 가격 가까운 순</option>
		</select>
	</div>
	{#if data.reportsError}<p class="gap hint">리포트 정보를 불러오지 못했어요.</p>{/if}

	{#if f !== 'watch'}
		<div class="gap">
			<Card flush title="보유 종목 {shownHeld.length}종목">
				{#snippet aside()}<a class="text-sm" href={resolve('/portfolio')}>포트폴리오에서 보기 →</a
					>{/snippet}
				{@render board(shownHeld, true)}
			</Card>
		</div>
	{/if}
	{#if f !== 'hold'}
		<Card flush title="관심 종목 {shownWatch.length}종목" sub="감시 가격은 봇이 기록한 값">
			{@render board(shownWatch, false)}
			<p class="pad hint">
				관심 종목은 투자 관리 봇이 매매일지·매수 계획서에 기록하면 여기에 추가돼요. ‘관심만’은 감시
				가격 없이 지켜보는 종목이에요.
			</p>
		</Card>
	{/if}
{/if}

<style>
	.top,
	.tools {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.tools {
		flex-wrap: nowrap;
		justify-content: flex-start;
	}
	.tools > :global(:first-child) {
		flex: 1 1 220px;
		max-width: 360px;
	}
	.tools .select {
		flex: none;
		width: auto;
		min-width: 160px;
	}
	.mk {
		margin-left: 4px;
		padding: 0 6px;
		border-radius: 4px;
		background: var(--color-surface-2);
		color: var(--color-muted);
		font-size: var(--text-xs);
	}
	.rl {
		min-height: 40px;
		margin-left: 8px;
	}
	.lead,
	.asof,
	.hint {
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
	.hint {
		display: block;
		color: var(--color-subtle);
		font-size: var(--text-xs);
	}
	.gap,
	.tiles {
		margin-bottom: 16px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	.pad {
		padding: 12px 16px;
	}
	.tw {
		overflow-x: auto;
	}
	.tbl {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 10px 12px;
		border-bottom: 1px solid var(--color-line);
		text-align: left;
		vertical-align: top;
	}
	th {
		color: var(--color-muted);
		font-weight: 600;
		font-size: var(--text-xs);
	}
	.r {
		text-align: right !important;
		white-space: nowrap;
	}
	.px b {
		display: block;
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover {
		background: var(--color-surface-2);
	}
	.nm {
		color: var(--color-text);
		font-weight: 600;
	}
	.nm:hover {
		color: var(--color-accent);
	}
	@media (max-width: 1023px) {
		.tiles,
		tbody {
			grid-template-columns: 1fr 1fr;
		}
		thead {
			display: none;
		}
		tbody {
			display: grid;
		}
		tr {
			position: relative;
			display: grid;
			grid-template-columns: 1fr auto;
			align-content: start;
			gap: 6px 12px;
			padding: 14px 16px;
			border-bottom: 1px solid var(--color-line);
		}
		tbody tr:nth-child(odd) {
			border-right: 1px solid var(--color-line);
		}
		td {
			grid-column: 1 / -1;
			display: flex;
			justify-content: space-between;
			gap: 8px;
			padding: 0;
			border: 0;
		}
		td[data-label]::before {
			content: attr(data-label);
			color: var(--color-subtle);
		}
		.nm-c,
		.px {
			grid-column: auto;
			display: block;
		}
		.nm::after {
			content: '';
			position: absolute;
			inset: 0;
		}
		.tg {
			display: block;
		}
		.none {
			display: none;
		}
	}
	@media (max-width: 639px) {
		.tiles {
			gap: 8px;
		}
		.tools {
			flex-direction: column;
			align-items: stretch;
		}
		.tools > :global(:first-child) {
			flex: none;
			max-width: none;
		}
		.gap {
			margin-bottom: 12px;
		}
		.rl {
			display: flex;
			min-height: 44px;
			margin: 8px 0 0;
		}
		tbody {
			grid-template-columns: 1fr;
		}
		tbody tr:nth-child(odd) {
			border-right: 0;
		}
	}
</style>
