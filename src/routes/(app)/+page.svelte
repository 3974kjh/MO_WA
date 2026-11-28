<script lang="ts">
	/**
	 * 홈(`/`) — FE-03(I-8) 대시보드. 시안 `design/screens/dashboard.html`.
	 * - 모바일 DOM 순서: 확인 대기 → 오늘 요약(탭 순서 = 읽는 순서, handoff §13-3). ≥640에서는 요약을 먼저 보인다.
	 * - 태블릿(640~1023) 2열: c-3~c-8·t-6 반폭, t-12 전폭.
	 * - 값이 없거나 못 읽으면 빈/오류 상태만 보인다. 시안 샘플 수치·샘플 안내 문구는 쓰지 않는다.
	 * - 감시 가격·방향은 바꿀 수 없다(표시만). 변경 요청 반영은 포트폴리오에서(FE-07).
	 */
	import { uniqueValues } from '$lib/format/unique';
	import StockNameLink from '$lib/components/stocks/StockNameLink.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Delta from '$lib/components/ui/Delta.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import MetricTile from '$lib/components/ui/MetricTile.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Tag from '$lib/components/ui/Tag.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import TriggerGauge from '$lib/components/dashboard/TriggerGauge.svelte';
	import {
		CHANGE_FIELD_LABEL,
		changeTypeLabel,
		holdingSummary,
		HOME_TICKERS,
		positionLabel,
		principleLabel,
		returnPct,
		shortDate,
		weightItems,
		type HomeQueueChange
	} from '$lib/dashboard/home';
	import {
		compareTrigger,
		DIRECTION_BADGE,
		distanceLabel,
		triggerState
	} from '$lib/dashboard/trigger';
	import { formatAsOf } from '$lib/format/datetime';
	import { formatMoney } from '$lib/format/money';
	import { formatQty } from '$lib/format/number';
	import {
		DAILY_BRIEF_KIND,
		briefingDetailPath,
		dateParts,
		formatBriefingDate,
		headlineText
	} from '$lib/routing/briefings';

	let { data }: { data: PageData } = $props();

	let summary = $derived(holdingSummary(data.positions, data.valuation?.usdkrw ?? null));
	let held = $derived(
		data.positions
			.filter((p) => p.status === 'holding' && p.qty != null && p.qty > 0)
			.toSorted((a, b) => (b.value_krw ?? -1) - (a.value_krw ?? -1))
	);
	let weights = $derived(weightItems(data.positions));
	let triggers = $derived(
		data.positions
			.filter((p) => p.trigger_price != null || p.watch_only)
			.map((p) => ({
				p,
				t: triggerState({
					price: p.price,
					trigger: p.trigger_price,
					direction: p.trigger_direction,
					watchOnly: p.watch_only
				})
			}))
			.toSorted((a, b) => compareTrigger(a.t, b.t))
	);
	// 오늘 요약 lead는 daily_brief만(주간 리포트가 더 최신이어도 쓰지 않는다)
	let lead = $derived.by(() => {
		const dailies = data.recentBriefings.filter((b) => b.kind === DAILY_BRIEF_KIND);
		return dailies.find((b) => briefingDetailPath(b) != null) ?? dailies[0];
	});
	let leadPath = $derived(lead ? briefingDetailPath(lead) : null);
	let leadHeadline = $derived(lead ? headlineText(lead.headline) : null);
	let series = $derived(data.kospiSeries);
	let seriesRange = $derived(
		series.length >= 2 ? `${shortDate(series[0].as_of)}~${shortDate(series.at(-1)!.as_of)}` : ''
	);
	let hasTicker = $derived(HOME_TICKERS.some((t) => data.tickers[t.key] != null));

	// 지표·키워드: ≥640에서는 펼쳐 두고, 모바일은 접어 둔다(시안과 같음).
	let moreOpen = $state(false);
	onMount(() => {
		if (window.matchMedia('(min-width: 640px)').matches) moreOpen = true;
	});

	const unitPrice = (v: number, ccy: 'KRW' | 'USD' | null) =>
		ccy
			? formatMoney(v, ccy, 'unit').exact
			: v.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
	function changeText(c: HomeQueueChange, ccy: 'KRW' | 'USD' | null): string {
		const f = (v: number) => (c.field === 'qty' ? `${formatQty(v)}주` : unitPrice(v, ccy));
		return `${CHANGE_FIELD_LABEL[c.field]} ${c.from != null ? `${f(c.from)} → ` : ''}${f(c.to)}`;
	}
	function tickerValue(key: string, v: number): string {
		if (key === 'usdkrw')
			return `${v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`;
		if (key === 'ust10y') return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}%`;
		return v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
	const pct1 = (v: number) => `${v.toFixed(1)}%`;
	/** R-VAL-P17: 환율은 기준 시각(usdkrw as_of, KST)과 함께. 기준 시각이 없으면 지어내지 않고 —. */
	function fxFoot(rate: number | null | undefined, asOf: string | null | undefined): string {
		if (rate == null) return '환율 기록 없음';
		// 날짜만 있는 값(date 컬럼)에는 기록에 없는 시각을 붙이지 않는다(formatAsOf).
		const shown = formatAsOf(asOf);
		const when = shown ? `${shown} 기준` : '기준 시각 —';
		return `환율 ${tickerValue('usdkrw', rate)} · ${when}`;
	}
</script>

<svelte:head>
	<title>홈 · MO_WA</title>
	<meta name="description" content="MO_WA — Money and Wallet." />
</svelte:head>

<div class="dash-top">
	<p class="asof">
		{#if data.kospi}{formatBriefingDate(data.kospi.as_of)} 종가 기준{:else}아직 시장 지표가 없어요{/if}
	</p>
	<a class="btn preset-outlined-surface-500 btn-sm" href={resolve('/briefings')}>전체 브리핑 보기</a
	>
</div>

<div class="dash" data-testid="home-dashboard">
	<!-- 모바일 1순위: 확인 대기 (DOM 순서 먼저) -->
	<Card class="c-4 queue" title="확인 대기">
		{#snippet aside()}
			{#if data.queue.pendingCount}<Pill count={data.queue.pendingCount} />{/if}
		{/snippet}
		<p class="hint">봇이 보낸 변경 요청은 <b>내가 반영해야</b> 보유 기록에 적용돼요.</p>
		{#if data.queueError}
			<ErrorState desc="잠시 후 다시 시도해 주세요." />
		{:else if data.queue.items.length === 0 && !data.queueNote}
			<EmptyState icon="✓" title="확인할 요청이 없어요" />
		{:else}
			{#if data.queueNote}
				<p class="queue-note" role="status" data-testid="home-queue-note">{data.queueNote}</p>
			{/if}
			{#if data.queue.items.length}
				<ul class="list" data-testid="home-queue">
					{#each data.queue.items as q (`${q.kind}:${q.id}`)}
						<li data-kind={q.kind}>
							<a class="q-item" href="{resolve('/portfolio')}#queue">
								<span class="grow">
									<b>{q.kind === 'principle' ? principleLabel(q) : positionLabel(q)}</b>
									<span class="mw-sub">{changeTypeLabel(q.change_type)}</span>
									{#if q.changes.length}
										<span class="mw-sub num"
											>{q.changes.map((c) => changeText(c, q.currency)).join(' · ')}</span
										>
									{/if}
								</span>
								<StatusBadge status={q.status} />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			{#if data.queue.total > data.queue.items.length}
				<p class="more-note">외 {data.queue.total - data.queue.items.length}건</p>
			{/if}
		{/if}
		<a class="btn-primary-m go btn preset-filled-brand" href="{resolve('/portfolio')}#queue"
			>확인하러 가기</a
		>
	</Card>

	<!-- 오늘 요약(최근 일간 브리핑 + 지수·환율) -->
	<Card class="c-8 t-12 summary" title="오늘 요약">
		{#if data.briefingsError}
			<ErrorState desc="잠시 후 다시 시도해 주세요." />
		{:else if !lead || !leadHeadline}
			<EmptyState title="아직 브리핑이 없어요" />
		{:else}
			<p class="headline" class:missing={leadHeadline.missing} data-testid="home-headline">
				{leadHeadline.text}
			</p>
		{/if}
		<details class="more" bind:open={moreOpen}>
			<summary>지표·키워드 보기</summary>
			{#if data.tickersError && !hasTicker}
				<p class="muted-note">지표를 불러오지 못했어요.</p>
			{:else if !hasTicker}
				<p class="muted-note">아직 기록된 지표가 없어요.</p>
			{:else}
				<div class="metrics" data-testid="home-tickers">
					{#each HOME_TICKERS as t (t.key)}
						{@const v = data.tickers[t.key]}
						<div>
							<span class="m-label">{t.label}</span>
							{#if v}
								<b class="num">{tickerValue(t.key, v.value)}</b>
								{#if v.change_pct != null && t.key !== 'ust10y'}<Delta value={v.change_pct} />{/if}
							{:else}
								<b class="num none">—</b>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if lead?.tags.length}
				<div class="tags">
					{#each uniqueValues(lead.tags) as tag (tag)}<Tag>{tag}</Tag>{/each}
				</div>
			{/if}
		</details>
		{#if lead}
			<div class="sum-link">
				{#if leadPath}
					<a href={resolve(leadPath)}>{formatBriefingDate(lead.report_date)} 브리핑 전체 읽기 →</a>
				{:else}
					<a href={resolve('/briefings')}>브리핑 목록 보기 →</a>
				{/if}
			</div>
		{/if}
	</Card>

	<!-- 보유 요약 타일 -->
	<div class="c-12 t-6 tiles-wrap">
		{#if data.valuationError}
			<Card><ErrorState desc="잠시 후 다시 시도해 주세요." /></Card>
		{:else if held.length === 0}
			<Card><EmptyState icon="💼" title="아직 보유 종목이 없어요" /></Card>
		{:else}
			<div class="tiles" data-testid="home-tiles">
				<MetricTile
					label="총 평가금액"
					foot={summary.unpriced > 0
						? `평가금액 없는 ${summary.unpriced}종목 제외`
						: '평가금액 기준'}
					href={resolve('/portfolio')}
				>
					{#snippet value()}
						{#if summary.totalKrw != null}<Money value={summary.totalKrw} />{:else}—{/if}
					{/snippet}
				</MetricTile>
				<MetricTile
					label="평가손익"
					delta={summary.pnlPct ?? undefined}
					deltaDigits={1}
					foot={summary.pnlCount < held.length
						? `평균 단가·가격 있는 ${summary.pnlCount}종목 기준`
						: '수익률'}
				>
					{#snippet value()}
						{#if summary.pnlKrw != null}<Money
								value={summary.pnlKrw}
								plus
								tone="sign"
							/>{:else}—{/if}
					{/snippet}
				</MetricTile>
				<MetricTile
					label="달러 자산 비중"
					value={summary.usdSharePct != null ? pct1(summary.usdSharePct) : '—'}
					foot={fxFoot(data.valuation?.usdkrw, data.valuation?.usdkrwAsOf)}
				/>
				<MetricTile
					label="보유 종목"
					value="{held.length}종목"
					foot={summary.unpriced > 0 ? `가격 없음 ${summary.unpriced}` : '가격 모두 있음'}
				/>
			</div>
		{/if}
	</div>

	<Card class="c-5" title="자산 비중" sub="평가금액 기준">
		{#if data.valuationError}
			<ErrorState desc="잠시 후 다시 시도해 주세요." />
		{:else if weights.length === 0}
			<EmptyState icon="◔" title="비중을 낼 평가금액이 없어요" />
		{:else}
			<DonutChart
				items={weights}
				ariaLabel="보유 종목 비중"
				total={summary.totalKrw ?? undefined}
				sub="총 평가금액"
				valueKind="KRW"
			/>
		{/if}
	</Card>

	<Card
		class="c-7"
		title="코스피 추이"
		sub={seriesRange ? `${seriesRange} · 기록된 날만` : undefined}
	>
		{#if data.kospiSeriesError}
			<ErrorState desc="잠시 후 다시 시도해 주세요." />
		{:else if series.length < 2}
			<EmptyState icon="📈" title="추이를 그릴 기록이 아직 부족해요" />
		{:else}
			<LineChart
				labels={series.map((s) => shortDate(s.as_of) ?? s.as_of)}
				series={[
					{ name: '코스피', values: series.map((s) => s.value), color: 'var(--color-chart-1)' }
				]}
				ariaLabel="코스피 종가 추이"
				area
				digits={2}
			/>
		{/if}
	</Card>

	<Card class="c-7 t-12" flush title="관심 종목 감시 가격" sub="감시 가격까지 남은 폭 · 0~20%">
		{#if data.positionsError}
			<div class="pad"><ErrorState desc="잠시 후 다시 시도해 주세요." /></div>
		{:else if triggers.length === 0}
			<div class="pad"><EmptyState icon="🎯" title="감시 중인 종목이 없어요" /></div>
		{:else}
			<ul class="list" data-testid="home-triggers">
				{#each triggers as { p, t } (p.id)}
					<li class="trig" class:watch={t.state === 'watch' || t.state === 'unpriced'}>
						<span
							class="dot"
							class:warn={t.state === 'warn'}
							class:ok={t.state === 'hit'}
							aria-hidden="true"
						></span>
						<div class="grow">
							<b
								><StockNameLink
									name={positionLabel(p)}
									ticker={p.ticker}
									assetType={p.asset_type ?? null}
									srText="종목 화면"
								/></b
							>
							{#if t.state !== 'watch'}
								{@const d = DIRECTION_BADGE[t.direction]}
								<Badge
									tone={t.direction === 'above' ? 'info' : 'default'}
									icon={d.icon}
									title={d.title}>{d.label}</Badge
								>
							{/if}
							<span class="mw-sub">
								{#if t.state === 'watch'}감시 가격 없음{:else}감시 가격 <span class="num"
										>{unitPrice(p.trigger_price!, p.currency)}</span
									>{/if}
								· 현재
								{#if p.price != null}<span class="num">{unitPrice(p.price, p.currency)}</span
									>{:else}가격 없음{/if}
							</span>
						</div>
						{#if 'distance' in t}<TriggerGauge distance={t.distance} />{/if}
						<div class="trig-r">
							{#if 'distance' in t}<span class="num dist">{distanceLabel(t.distance)}</span>{/if}
							{#if t.state === 'warn'}<Badge tone="warn" icon="⚠">3% 이내</Badge>
							{:else if t.state === 'hit'}<Badge tone="accent" icon="✓">도달</Badge>
							{:else if t.state === 'watch'}<Badge>관심만</Badge>
							{:else if t.state === 'unpriced'}<Badge>현재가 없음</Badge>{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="foot-note">
			감시 가격과 방향은 투자 관리 봇이 정해요. 여기서는 바꿀 수 없어요. 방향: ▼ 이하로
			내려가면(기본) / ▲ 이상으로 오르면(다시 넘으면).
		</p>
	</Card>

	<Card class="c-5 t-12" flush title="최근 브리핑">
		{#snippet aside()}<a class="text-link" href={resolve('/briefings')}>더 보기</a>{/snippet}
		{#if data.briefingsError}
			<div class="pad"><ErrorState desc="잠시 후 다시 시도해 주세요." /></div>
		{:else if data.recentBriefings.length === 0}
			<div class="pad"><EmptyState title="아직 브리핑이 없어요" /></div>
		{:else}
			<ul class="list" data-testid="home-recent">
				{#each data.recentBriefings as b (b.id)}
					{@const path = briefingDetailPath(b)}
					{@const d = dateParts(b.report_date)}
					{@const hl = headlineText(b.headline)}
					{#snippet row()}
						<span class="date-col num">
							{#if d}<b>{d.day}</b><span>{d.month}월 {d.weekday}</span>{:else}{b.report_date}{/if}
						</span>
						<span class="grow">
							<span class="r-head" class:missing={hl.missing}>{hl.text}</span>
							{#if b.tags.length}
								<span class="tags"
									>{#each uniqueValues(b.tags) as tag (tag)}<Tag>{tag}</Tag>{/each}</span
								>
							{/if}
						</span>
						{#if b.kospi_change_pct != null}<Delta value={b.kospi_change_pct} />{/if}
					{/snippet}
					<li>
						{#if path}
							<a class="r-item" href={resolve(path)}>{@render row()}</a>
						{:else}
							<div class="r-item">{@render row()}</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<Card class="c-12" flush title="보유 종목">
		{#snippet aside()}<a class="text-link" href={resolve('/portfolio')}>포트폴리오 전체</a
			>{/snippet}
		{#if data.positionsError}
			<div class="pad"><ErrorState desc="잠시 후 다시 시도해 주세요." /></div>
		{:else if held.length === 0}
			<div class="pad"><EmptyState icon="💼" title="아직 보유 종목이 없어요" /></div>
		{:else}
			<div class="tbl-wrap">
				<table class="tbl" data-testid="home-holdings">
					<thead>
						<tr>
							<th scope="col">종목</th>
							<th scope="col" class="r">현재가</th>
							<th scope="col" class="r">수익률</th>
							<th scope="col" class="r">비중</th>
						</tr>
					</thead>
					<tbody>
						{#each held as p (p.id)}
							{@const r = returnPct(p)}
							<tr>
								<td data-label="종목">
									<div class="t-name">
										<StockNameLink
											name={positionLabel(p)}
											ticker={p.ticker}
											assetType={p.asset_type ?? null}
											srText="종목 화면"
										/>
									</div>
									<div class="t-sub">
										{#if p.ticker}{p.ticker} ·
										{/if}<span class="num">{formatQty(p.qty ?? 0)}주</span>
									</div>
								</td>
								<td class="r num" data-label="현재가"
									>{p.price != null ? unitPrice(p.price, p.currency) : '—'}</td
								>
								<td class="r" data-label="수익률"
									>{#if r != null}<Delta value={r} digits={1} />{:else}—{/if}</td
								>
								<td class="r num" data-label="비중"
									>{p.value_krw != null && summary.totalKrw
										? pct1((p.value_krw / summary.totalKrw) * 100)
										: '—'}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</div>

<style>
	.dash-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 16px;
	}
	.asof {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	/* 12열(≥1024) · 태블릿 2열(640~1023) · 모바일 1열 — 시안 c-N · t-N 규칙 */
	.dash {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 16px;
	}
	.dash > :global(*) {
		grid-column: span 12;
		min-width: 0;
	}
	@media (min-width: 640px) {
		.dash > :global(.summary) {
			order: -1;
		}
		.dash > :global(:is(.c-4, .c-5, .c-7, .c-8, .t-6)) {
			grid-column: span 6;
		}
		.dash > :global(.t-12) {
			grid-column: span 12;
		}
	}
	@media (min-width: 1024px) {
		.dash > :global(.c-4) {
			grid-column: span 4;
		}
		.dash > :global(.c-5) {
			grid-column: span 5;
		}
		.dash > :global(.c-7) {
			grid-column: span 7;
		}
		.dash > :global(.c-8) {
			grid-column: span 8;
		}
		.dash > :global(.c-12) {
			grid-column: span 12;
		}
	}
	.hint {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	@media (max-width: 639px) {
		.hint {
			display: none;
		}
	}
	.list {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
	}
	.q-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-height: var(--size-touch);
		padding: 10px 8px;
		margin: 0 -8px;
		border-radius: var(--radius-sm);
		color: inherit;
		text-decoration: none;
	}
	.q-item:hover,
	.r-item:is(a):hover {
		background: var(--color-surface-2);
	}
	.grow {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.grow b {
		font-weight: 700;
	}
	.mw-sub {
		font-size: var(--text-sm);
		color: var(--color-muted);
		overflow-wrap: anywhere;
	}
	.queue-note {
		margin-top: 8px;
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.more-note {
		margin-top: 6px;
		font-size: var(--text-sm);
		color: var(--color-subtle);
	}
	.go {
		width: 100%;
		margin-top: 12px;
	}
	.headline {
		font-size: var(--text-xl);
		line-height: 1.85rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}
	.headline.missing {
		color: var(--color-muted);
		font-weight: 400;
		font-size: var(--text-base);
	}
	@media (max-width: 639px) {
		.headline {
			font-size: var(--text-base);
			line-height: 1.5rem;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 1;
			line-clamp: 1;
			overflow: hidden;
		}
		:global(.summary):has(.more[open]) .headline {
			display: block;
		}
	}
	.more {
		margin-top: 10px;
	}
	.more summary {
		cursor: pointer;
		min-height: var(--size-touch);
		display: flex;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-top: 6px;
	}
	.metrics > div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 1px solid var(--color-line);
		padding-top: 10px;
		font-size: var(--text-sm);
	}
	.metrics b {
		font-size: var(--text-lg);
	}
	.metrics .none {
		color: var(--color-subtle);
	}
	.m-label {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	@media (max-width: 639px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.muted-note {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 12px;
	}
	.sum-link {
		margin-top: 12px;
		font-size: var(--text-sm);
	}
	.sum-link a {
		font-weight: 600;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 1023px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 640px) and (max-width: 1023px) {
		.tiles {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 639px) {
		.tiles {
			gap: 8px;
		}
	}
	.pad {
		padding: 0 16px 16px;
	}
	.trig {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 150px 96px;
		gap: 12px;
		align-items: center;
		padding: 12px 16px;
	}
	.trig.watch {
		grid-template-columns: auto minmax(0, 1fr) 96px;
	}
	.trig + .trig {
		border-top: 1px solid var(--color-line);
	}
	.trig .grow {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
	}
	.trig .grow .mw-sub {
		flex-basis: 100%;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.trig-r {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		text-align: right;
	}
	.dist {
		font-size: var(--text-sm);
		font-weight: 700;
	}
	@media (max-width: 639px) {
		.trig,
		.trig.watch {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.trig > :global(.gauge) {
			grid-column: 2 / 4;
			grid-row: 2;
		}
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-subtle);
	}
	.dot.warn {
		background: var(--color-warn-fill);
	}
	.dot.ok {
		background: var(--color-ok);
	}
	.foot-note {
		padding: 6px 16px 12px;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.text-link {
		font-size: var(--text-sm);
	}
	.r-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 56px;
		padding: 12px 16px;
		color: inherit;
		text-decoration: none;
		font-size: var(--text-sm);
	}
	.date-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: none;
		width: 48px;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.date-col b {
		font-size: var(--text-lg);
		line-height: 1.4rem;
		color: var(--color-text);
	}
	.r-head {
		font-weight: 600;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}
	.r-head.missing {
		color: var(--color-muted);
		font-weight: 400;
	}
	.r-item .tags {
		margin-top: 4px;
		gap: 4px;
	}
	.tbl-wrap {
		overflow-x: auto;
		margin-top: 8px;
	}
	.tbl {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.tbl th,
	.tbl td {
		padding: 10px 16px;
		text-align: left;
		border-top: 1px solid var(--color-line);
	}
	.tbl th {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-subtle);
	}
	.tbl .r {
		text-align: right;
		font-weight: 500;
	}
	.t-name {
		font-weight: 600;
	}
	.t-sub {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
</style>
