<script lang="ts">
	/**
	 * FE-11 `/stocks/[ticker]` 상세(시안 design/screens/stock-detail.html, DS §7-15). 표시 전용 — 이 화면에서
	 * 보유 기록·감시 가격을 고치지 않는다(원칙 5). 카드별 오류는 그 카드에만 보인다.
	 * PC 2열 / 태블릿 1:1 / 모바일 1열(시세 → 내 보유 → 관련 기록 → 목표가 → 수급 → 지표 → 종목 메모).
	 */
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Delta from '$lib/components/ui/Delta.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import StockTrigger from '$lib/components/stocks/StockTrigger.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import NotebookText from '@lucide/svelte/icons/notebook-text';
	import Target from '@lucide/svelte/icons/target';
	import { returnPct, shortDate } from '$lib/dashboard/home';
	import { DIRECTION_BADGE, triggerState } from '$lib/dashboard/trigger';
	import { formatAsOf } from '$lib/format/datetime';
	import { formatQty } from '$lib/format/number';
	import { briefingDetailPath, dateParts } from '$lib/routing/briefings';
	import { JOURNAL_TYPE_LABEL, type JournalType } from '$lib/routing/listQuery';
	import {
		ALIGNMENT_LABEL,
		analysisHref,
		isStale,
		latestBySlug,
		LENS_LABEL,
		marketLabel,
		NO_BASIS,
		quoteBasis,
		rangePosition,
		reportKindLabel,
		unitPrice
	} from '$lib/stocks/view';

	let { data }: { data: PageData } = $props();
	type Full = Extract<PageData, { portfolioOnly: false }>;
	// 아래 본문은 portfolioOnly가 아닐 때만 렌더된다.
	let full = $derived(data as Full);
	const OPINION = { buy: '매수', hold: '중립', sell: '매도' } as const;
	const reload = () => location.reload();
	let range = $state<'m' | 'all'>('all');
	let who = $state<'f' | 'i'>('f');
	let journalHref = $derived(
		`${resolve('/journal')}?ticker=${encodeURIComponent(data.instrument.ticker)}`
	);
	type RelItem = {
		id: string;
		href: string;
		date: string;
		tag?: string;
		info?: boolean;
		title: string;
	};
	// 관련 기록 세 묶음(분석 리포트 · 매매일지 · 브리핑 언급)을 같은 목록 모양으로
	let relGroups = $derived.by(() => {
		if (data.portfolioOnly) return [];
		const t = data.instrument.ticker;
		const reps = latestBySlug(full.reports);
		return [
			{
				h: `분석 리포트 ${reps.length}`,
				empty: '아직 분석 리포트가 없어요.',
				items: reps.map(
					(r): RelItem => ({
						id: r.id,
						href: analysisHref(r.slug, t),
						date: r.report_date,
						tag: reportKindLabel(r),
						info: r.subtype === 'buy_plan',
						title: r.title
					})
				)
			},
			{
				h: `매매일지 ${full.journal.total}`,
				more: full.journal.total > 3,
				empty: '이 종목의 매매일지가 없어요.',
				items: full.journal.items.map(
					(j): RelItem => ({
						id: j.id,
						href: resolve('/(app)/journal/[id]', { id: j.id }),
						date: j.entry_date,
						tag: JOURNAL_TYPE_LABEL[j.kind as JournalType] ?? j.kind,
						title: j.title
					})
				)
			},
			{
				h: `브리핑 언급 ${full.mentions.length}`,
				empty: '최근 브리핑에서 언급되지 않았어요.',
				items: full.mentions.map((b): RelItem => {
					const path = briefingDetailPath(b);
					return {
						id: b.id,
						href: path ? resolve(path) : resolve('/briefings'),
						date: b.report_date,
						title: b.title
					};
				})
			}
		];
	});
</script>

<svelte:head><title>{data.instrument.name} · MO_WA</title></svelte:head>

{#if data.portfolioOnly}
	<Card>
		<EmptyState
			icon="💼"
			title="포트폴리오에서 봐 주세요"
			desc="채권·현금은 종목 화면에서 다루지 않아요. 보유 기록과 평가금액은 포트폴리오에서 볼 수 있어요."
		>
			{#snippet action()}
				<a class="btn-primary-m btn preset-filled-brand" href={resolve('/portfolio')}
					>포트폴리오로 가기</a
				>
			{/snippet}
		</EmptyState>
	</Card>
{:else}
	{@const i = data.instrument}
	{@const hold = full.positions.find((p) => p.status === 'holding')}
	{@const plan = full.positions.find((p) => p.status === 'planned')}
	{@const pos = hold ?? plan}
	{@const ccy = pos?.currency ?? (i.market === 'KRX' ? 'KRW' : 'USD')}
	{@const last = full.series.at(-1)}
	{@const price = last?.close ?? null}
	{@const chg = last?.change_pct ?? null}
	{@const diff = price != null && chg != null ? price - price / (1 + chg / 100) : null}
	{@const t = triggerState({
		price,
		trigger: pos?.trigger_price,
		direction: pos?.trigger_direction,
		watchOnly: pos?.watch_only
	})}
	{@const latest = full.reports[0]}
	{@const stale = isStale(last?.as_of)}

	{#if stale}
		<div class="mb" data-testid="stock-stale">
			<Banner>
				<!-- 문장과 버튼이 한 줄에 안 들어가면 버튼이 문장 아래 줄로(문장 기본 폭 = 내용 폭) -->
				<div class="bn">
					<span class="st"
						><b>최신 시세가 아니에요.</b> 마지막으로 받은 시세는
						<b class="num">{quoteBasis(last?.as_of, i.market)}</b>예요. 아래 등락·수익률·감시 가격
						거리는 이 시각 기준이에요.</span
					>
					<button type="button" class="rl btn preset-outlined-surface-500" onclick={reload}
						>다시 불러오기</button
					>
				</div>
			</Banner>
		</div>
	{/if}

	<header class="qhead">
		<div>
			<span class="chips">
				<Badge>{marketLabel(i.market)}</Badge>
				{#if hold}<Badge tone="accent">보유 {formatQty(hold.qty ?? 0)}주</Badge>
				{:else if pos?.watch_only}<Badge>관심만</Badge>
				{:else if plan}<Badge>관심 · 매수 계획</Badge>
				{:else if i.is_watchlist}<Badge>관심</Badge>{/if}
			</span>
			<h2>{i.name} <span class="code">{i.ticker}</span></h2>
		</div>
		<div class="px">
			<b class="num big"
				>{unitPrice(price, ccy)}{#if price == null}<span class="sr-only">현재가 없음</span>{/if}</b
			>
			<span>
				<span class="muted">전일 대비</span>
				{#if diff != null && chg != null}
					<span class="num">{unitPrice(Math.abs(diff), ccy)}</span> <Delta value={chg} />
				{:else}<span class="muted">—</span>{/if}
			</span>
			<span class="muted text-xs" data-testid="stock-basis"
				>{quoteBasis(last?.as_of, i.market)}{stale ? ' · 갱신 멈춤' : ''}</span
			>
		</div>
	</header>
	<div class="acts">
		{#if latest}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- analysisHref: 앱 고정 경로(/analyses/[slug]) -->
			<a class="btn-primary-m btn preset-filled-brand" href={analysisHref(latest.slug, i.ticker)}
				>최신 리포트 읽기</a
			>
		{:else}
			<button
				type="button"
				class="btn-primary-m btn preset-filled-brand"
				aria-disabled="true"
				aria-describedby="no-rep">최신 리포트 읽기</button
			>
			<span class="muted text-sm" id="no-rep">이 종목의 분석 리포트가 아직 없어요</span>
		{/if}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- journalHref = resolve(/journal) + ?ticker -->
		<a class="btn-primary-m btn preset-outlined-surface-500" href={journalHref}>매매일지에서 보기</a
		>
	</div>
	<nav class="jump" aria-label="이 화면 안에서 이동">
		<a href="#c-price">시세</a><a href="#c-hold">{hold ? '내 보유' : '감시 가격'}</a><a
			href="#c-rel">관련 기록</a
		><a href="#c-target">목표가</a><a href="#c-flow">수급</a><a href="#c-metric">지표</a>
	</nav>

	<div class="grid">
		<div class="col">
			<div id="c-price" class="o1">
				<Card title="시세">
					{#if full.seriesError}
						{@render fail()}
					{:else if full.series.length === 0}
						<EmptyState
							icon="📈"
							title="시세 기록이 아직 없어요"
							desc="가격이 기록되면 여기에 추이를 그려요."
						/>
					{:else if full.series.length < 5}
						<EmptyState
							icon="📈"
							title="시세 기록이 아직 짧아요"
							desc="종가가 5일 이상 쌓이면 추이를 그려요. 현재가는 위에 표시돼요."
						/>
					{:else}
						<!-- 기준선 하나: 보유 = 평균 단가, 미보유 = 감시 가격(DS §7-15 v1.7.5) -->
						{@const ref = hold
							? hold.avg_price != null
								? { v: hold.avg_price, label: `평균 단가 ${unitPrice(hold.avg_price, ccy)}` }
								: undefined
							: t.state !== 'watch'
								? {
										v: pos!.trigger_price!,
										label: `감시 가격 ${unitPrice(pos!.trigger_price, ccy)}`
									}
								: undefined}
						{@render priceCard(full.series, ref, ccy, price!)}
					{/if}
				</Card>
			</div>
			<div id="c-flow" class="o5">
				<Card title="수급" sub="외국인·기관 순매수">
					{#if full.seriesError}
						{@render fail('수급 자료를 불러오지 못했어요')}
					{:else if i.market !== 'KRX'}
						{@render none(
							ChartColumn,
							'미국 종목은 수급 자료가 없어요',
							'외국인·기관 순매수는 국내 종목만 제공돼요.'
						)}
					{:else}
						{@render flowCard()}
					{/if}
				</Card>
			</div>
			<div id="c-metric" class="o6">
				<Card title="지표">
					{@render none(ChartLine, '지표가 아직 없어요', '지표 자료가 연결되면 여기에 보여 줘요.')}
				</Card>
			</div>
		</div>
		<div class="col">
			<div id="c-hold" class="o2">
				<Card title={hold ? '내 보유' : '감시 가격'}>
					{#snippet aside()}<a class="text-sm" href={resolve('/portfolio')}>포트폴리오 →</a
						>{/snippet}
					{#if full.positionsError}
						{@render fail()}
					{:else}
						{#if hold}
							{@const ret = returnPct({ price, avg_price: hold.avg_price })}
							<dl class="kv">
								<div>
									<dt>수량</dt>
									<dd>{formatQty(hold.qty ?? 0)}주</dd>
								</div>
								<div>
									<dt>비중</dt>
									<dd>
										{full.holdingValue != null && full.totalKrw
											? `${((full.holdingValue / full.totalKrw) * 100).toFixed(1)}%`
											: '—'}
									</dd>
								</div>
								<div>
									<dt>평균 단가</dt>
									<dd>{unitPrice(hold.avg_price, ccy)}</dd>
								</div>
								<div>
									<dt>손익분기 가격</dt>
									<dd>{unitPrice(hold.breakeven, ccy)}</dd>
								</div>
								<div>
									<dt>수익률</dt>
									<dd>
										{#if ret != null}<Delta value={ret} digits={1} />{:else}—{/if}
									</dd>
								</div>
								<div>
									<dt>평가금액</dt>
									<dd>
										{#if full.holdingValue != null}<Money value={full.holdingValue} />{:else}—{/if}
									</dd>
								</div>
							</dl>
						{:else}
							<p class="muted text-sm">보유하지 않은 관심 종목이에요.</p>
						{/if}
						<div class="trig">
							{#if t.state === 'watch'}
								<p class="text-sm">
									{#if pos?.watch_only}<Badge>관심만</Badge> 감시 가격 없이 지켜보는 중이에요.
									{:else}감시 가격이 아직 없어요.{/if}
								</p>
							{:else}
								{@const d = DIRECTION_BADGE[t.direction]}
								<p class="text-sm">
									<b>감시 가격 {unitPrice(pos?.trigger_price, ccy)}</b>
									<Badge
										tone={t.direction === 'above' ? 'info' : 'default'}
										icon={d.icon}
										title={d.title}>{d.label}</Badge
									>
								</p>
								<StockTrigger {t} />
							{/if}
							{#if pos?.memo}<p class="hint">{pos.memo}</p>{/if}
							<!-- 기준 시각 = 시세 시각, 보유 기록 시각은 이름을 달리해 따로(DS §7-15 v1.7.5) -->
							<p class="hint" data-testid="hold-basis">
								{last
									? `기준 시각 ${quoteBasis(last.as_of, i.market)}`
									: NO_BASIS}{#if formatAsOf(pos?.base_at)}{` · 보유 기록 ${formatAsOf(pos?.base_at)}`}{/if}
							</p>
						</div>
						<p class="hint">
							이 화면에서는 보유 기록을 고칠 수 없어요. 수량·평균 단가는 포트폴리오의 ‘기록
							수정’이나 봇의 변경 요청으로만 바뀌어요.
						</p>
					{/if}
				</Card>
			</div>
			<div id="c-rel" class="o3">
				<Card title="관련 기록" sub="이 종목이 나온 리포트·일지·브리핑">
					{@render related()}
				</Card>
			</div>
			<div id="c-target" class="o4">
				<Card title="목표가 이력" sub="최근 순">
					{#if full.targetsError}
						{@render fail()}
					{:else if full.targets.length === 0}
						{@render none(
							Target,
							'목표가 기록이 없어요',
							'기업분석 리포트에서 목표가를 제시하면 여기에 쌓여요.'
						)}
					{:else}
						{@render targetCard(price)}
					{/if}
				</Card>
			</div>
			<div class="o7">
				<Card title="종목 메모" sub="최근 분석 기준">
					{#if full.memo}
						{@const m = full.memo}
						<dl class="ctx">
							{#if m.reason}
								<div>
									<dt>이유</dt>
									<dd>
										{m.reason}{#if m.reasonSource}<span class="hint">({m.reasonSource})</span>{/if}
									</dd>
								</div>
							{/if}
							{#if m.alignment}
								{@const a = ALIGNMENT_LABEL[m.alignment]}
								<div>
									<dt>시장관</dt>
									<dd><Badge tone={a.tone}>{a.label}</Badge> {m.alignReason ?? ''}</dd>
								</div>
							{/if}
							{#each m.lenses as l (l.key)}
								<div>
									<dt>{LENS_LABEL[l.key]}</dt>
									<dd>
										{l.text}{#if l.source}<span class="hint">({l.source})</span>{/if}
									</dd>
								</div>
							{/each}
						</dl>
					{:else}
						{@render none(
							NotebookText,
							'메모가 아직 없어요',
							'기업분석 리포트가 생기면 선택 이유와 시장관 일치 여부를 여기 요약해요.'
						)}
					{/if}
				</Card>
			</div>
		</div>
	</div>
{/if}

<!-- 보조 카드의 작은 빈 상태(DS §7-15 v1.7.5): 아이콘 + 한 줄 제목 + 한 줄 설명 -->
{#snippet none(icon: typeof ChartLine, title: string, desc: string)}
	<div class="mini">
		<Icon {icon} size={20} />
		<p><b>{title}</b><span class="hint">{desc}</span></p>
	</div>
{/snippet}
{#snippet fail(title?: string)}
	<ErrorState {title} desc="다른 정보는 그대로 볼 수 있어요." onretry={reload} />
{/snippet}

{#snippet dcol(d: string)}
	{@const p = dateParts(d)}
	<span class="dcol num"
		>{#if p}<b>{p.day}</b>{p.month}월{:else}{d}{/if}</span
	>
{/snippet}

{#snippet priceCard(
	series: Full['series'],
	ref: { v: number; label: string } | undefined,
	ccy: 'KRW' | 'USD',
	price: number
)}
	{@const pts = range === 'm' ? series.slice(-22) : series}
	{@const yearAgo = series.at(-1)!.as_of.replace(/^\d{4}/, (y) => String(+y - 1))}
	{@const full = series[0].as_of <= yearAgo}
	{@const win = full ? series.filter((s) => s.as_of >= yearAgo) : series}
	{@const lo = Math.min(...win.map((s) => s.close))}
	{@const hi = Math.max(...win.map((s) => s.close))}
	{@const posPct = rangePosition(lo, hi, price)}
	<div class="seg">
		<SegmentedControl
			ariaLabel="기간"
			options={[
				{ value: 'm', label: '1개월' },
				{ value: 'all', label: '기록 전체' }
			]}
			value={range}
			onchange={(v) => (range = v)}
		/>
	</div>
	<LineChart
		labels={pts.map((s) => shortDate(s.as_of) ?? s.as_of)}
		series={[{ name: '종가', values: pts.map((s) => s.close), color: 'var(--color-chart-1)' }]}
		ariaLabel="{data.instrument.name} 종가 추이"
		area
		digits={ccy === 'USD' ? 2 : 0}
		mobileGrid={3}
		refLine={ref}
	/>
	<p class="hint">
		기록된 날의 종가만 표시({shortDate(pts[0].as_of)}~{shortDate(pts.at(-1)!.as_of)}). 단위: {ccy ===
		'USD'
			? '달러'
			: '원'}
	</p>
	{#if posPct != null}
		{@const label = full ? '52주' : '기록 기간'}
		<div class="range">
			<p class="row text-sm">
				<span class="muted">{label} 범위에서 현재 위치</span><b class="num">{Math.round(posPct)}%</b
				>
			</p>
			<div
				class="track"
				role="img"
				aria-label="{label} 최저 {unitPrice(lo, ccy)}, 최고 {unitPrice(hi, ccy)}, 현재 {unitPrice(
					price,
					ccy
				)}"
			>
				<i style:left="{posPct}%"></i>
			</div>
			<p class="row hint">
				<span>최저 {unitPrice(lo, ccy)} · 최고 {unitPrice(hi, ccy)}</span>
			</p>
		</div>
	{/if}
{/snippet}

{#snippet flowCard()}
	{@const pts = full.series
		.filter((s) => s.foreign_net_buy != null || s.inst_net_buy != null)
		.slice(-10)}
	{#if pts.length === 0}
		{@render none(
			ChartColumn,
			'수급 기록이 아직 없어요',
			'브리핑에서 수급이 기록되면 여기에 쌓여요.'
		)}
	{:else}
		{@const key = who === 'f' ? 'foreign_net_buy' : 'inst_net_buy'}
		{@const sum = (k: typeof key) => pts.reduce((a, s) => a + (s[k] ?? 0), 0)}
		{@const both = pts.findLast((s) => (s.foreign_net_buy ?? 0) > 0 && (s.inst_net_buy ?? 0) > 0)}
		<div class="seg">
			<SegmentedControl
				ariaLabel="투자자"
				options={[
					{ value: 'f', label: '외국인' },
					{ value: 'i', label: '기관' }
				]}
				value={who}
				onchange={(v) => (who = v)}
			/>
		</div>
		<BarChart
			items={pts.map((s) => ({ label: shortDate(s.as_of) ?? s.as_of, value: s[key] ?? 0 }))}
			ariaLabel="{who === 'f' ? '외국인' : '기관'} 일별 순매수"
			digits={0}
			unit=""
		/>
		<p class="hint">
			최근 {pts.length}거래일 · 순매수(+) 빨강 ▲ / 순매도(−) 파랑 ▼ · 단위는 기록된 값 그대로 ·
			{shortDate(pts.at(-1)!.as_of)}까지 기록
		</p>
		<dl class="kv">
			<div>
				<dt>외국인 합계</dt>
				<dd><Delta value={sum('foreign_net_buy')} digits={0} suffix="" /></dd>
			</div>
			<div>
				<dt>기관 합계</dt>
				<dd><Delta value={sum('inst_net_buy')} digits={0} suffix="" /></dd>
			</div>
			<div>
				<dt>마지막 동반 순매수일</dt>
				<dd>{both ? shortDate(both.as_of) : '—'}</dd>
			</div>
		</dl>
	{/if}
{/snippet}

{#snippet related()}
	{#if full.reportsError || full.relatedError}
		<p class="hint" role="alert">일부 기록을 불러오지 못했어요.</p>
	{/if}
	{#each relGroups as g (g.h)}
		<h3 class="rel-h">
			{g.h}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- journalHref = resolve(/journal) + ?ticker -->
			{#if g.more}<a class="text-sm" href={journalHref}>전체 보기</a>{/if}
		</h3>
		{#if g.items.length}
			<ul class="rel">
				{#each g.items as x (x.id)}
					<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- relGroups가 resolve·analysisHref로 만든 경로 -->
						<a href={x.href}>
							{@render dcol(x.date)}
							<span>
								{#if x.tag}<Badge tone={x.info ? 'info' : 'default'}>{x.tag}</Badge>{/if}
								<b class="block text-sm">{x.title}</b>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}<p class="muted text-sm">{g.empty}</p>{/if}
	{/each}
{/snippet}

{#snippet targetCard(price: number | null)}
	{@const official = full.targets.find((x) => x.source === 'internal' && x.target_price != null)}
	{@const slugOf = new Map(full.reports.map((r) => [r.id, r.slug]))}
	{#if official}
		<p class="row tp-now text-sm">
			<span
				>최근 목표가 <b class="num">{unitPrice(official.target_price, official.currency)}</b></span
			>
			{#if price}<span
					>현재가 대비 <Delta
						value={((official.target_price! - price) / price) * 100}
						digits={1}
					/></span
				>{/if}
			<Badge>투자의견 {OPINION[official.opinion]}</Badge>
		</p>
	{/if}
	<ul class="rel">
		{#each full.targets as x, k (k)}
			{@const prev = full.targets
				.slice(k + 1)
				.find((y) => y.source === x.source && y.source_name === x.source_name)}
			{@const slug = slugOf.get(x.report_id)}
			<!-- 1줄 날짜·출처 … 목표가 / 2줄 이전·상향·의견 … 리포트 보기(DS §7-15 v1.7.5) -->
			<li class="tp">
				<p class="row">
					<span>
						<b class="num text-sm">{x.as_of.slice(2).replaceAll('-', '.')}</b>
						<Badge tone={x.source === 'internal' ? 'accent' : 'default'}
							>{x.source === 'internal' ? '공식' : '증권사'}{x.source_name
								? ` · ${x.source_name}`
								: ''}</Badge
						>
					</span>
					<b class="num">{unitPrice(x.target_price, x.currency)}</b>
				</p>
				<p class="row">
					<span class="hint num">
						{#if prev?.target_price != null && x.target_price != null && prev.target_price !== x.target_price}
							이전 {unitPrice(prev.target_price, x.currency)}
							{x.target_price < prev.target_price ? '▼ 하향' : '▲ 상향'} ·
						{/if}의견 {OPINION[x.opinion]}{#if x.note}
							· {x.note}{/if}
					</span>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- analysisHref: 앱 고정 경로(/analyses/[slug]) -->
					{#if slug}<a class="go" href={analysisHref(slug, data.instrument.ticker)}
							>리포트 보기<Icon icon={ChevronRight} size={14} /></a
						>{/if}
				</p>
			</li>
		{/each}
	</ul>
	<p class="hint">
		‘공식’은 투자 분석 봇이 남긴 목표가 기록이에요. 의견 기준: 목표가까지 +20% 이상 매수 · −10%~+20%
		중립 · −10% 미만 매도.
	</p>
{/snippet}

<style>
	.mb,
	.acts,
	.qhead {
		margin-bottom: 14px;
	}
	.qhead,
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 8px 16px;
	}
	.chips,
	.acts,
	.jump {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
	}
	h2 {
		margin-top: 6px;
		font-size: var(--text-xl);
		font-weight: 700;
	}
	.code,
	.muted {
		color: var(--color-muted);
	}
	.code {
		font-size: var(--text-lg);
		font-weight: 600;
	}
	.px {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.big {
		font-size: 28px;
		line-height: 1.2;
	}
	.jump {
		flex-wrap: nowrap;
		overflow-x: auto;
		margin-bottom: 16px;
	}
	.jump a {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 14px;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-muted);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 380px;
		gap: 16px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.seg {
		margin-bottom: 8px;
	}
	.hint {
		display: block;
		margin-top: 6px;
		color: var(--color-subtle);
		font-size: var(--text-xs);
	}
	.kv {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 16px;
		margin-top: 10px;
	}
	.kv dt,
	.ctx dt {
		color: var(--color-subtle);
		font-size: var(--text-xs);
	}
	.kv dd {
		font-weight: 600;
	}
	.trig,
	.range {
		margin-top: 14px;
	}
	.track {
		position: relative;
		height: 8px;
		margin: 8px 0 4px;
		border-radius: 4px;
		background: var(--color-surface-3);
	}
	.track i {
		position: absolute;
		top: -3px;
		width: 4px;
		height: 14px;
		margin-left: -2px;
		border-radius: 2px;
		background: var(--color-chart-1);
	}
	.rel-h {
		display: flex;
		justify-content: space-between;
		margin: 14px 0 2px;
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-muted);
	}
	.rel-h:first-of-type {
		margin-top: 0;
	}
	.rel li {
		border-top: 1px solid var(--color-line);
	}
	.rel a {
		display: flex;
		gap: 12px;
		padding: 10px 0;
		min-height: 48px;
		color: inherit;
	}
	.rel a:hover b {
		color: var(--color-accent);
	}
	.dcol {
		flex: none;
		width: 36px;
		text-align: center;
		color: var(--color-muted);
		font-size: var(--text-xs);
	}
	.dcol b {
		display: block;
		font-size: var(--text-lg);
		color: var(--color-text);
	}
	.tp {
		padding: 8px 0 0;
	}
	.tp .row {
		align-items: center;
	}
	.rel .go {
		padding: 0;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: 40px;
		color: var(--color-accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.mini {
		display: flex;
		gap: 10px;
		padding: 16px 0;
		color: var(--color-muted);
	}
	.mini b {
		display: block;
		color: var(--color-text);
		font-size: var(--text-sm);
	}
	.bn {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.st {
		flex: 1 1 auto;
		min-width: 0;
	}
	.rl {
		min-height: 40px;
	}
	.tp-now {
		justify-content: flex-start;
		margin-bottom: 12px;
	}
	.ctx div {
		padding: 8px 0;
		border-top: 1px solid var(--color-line);
	}
	.ctx div:first-child {
		border-top: 0;
	}
	@media (max-width: 1279px) {
		.grid {
			grid-template-columns: minmax(0, 1fr) 340px;
		}
	}
	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 639px) {
		.grid {
			display: flex;
			flex-direction: column;
			align-items: stretch;
		}
		.jump a,
		.rel .go,
		.rl {
			min-height: 44px;
		}
		.col {
			display: contents;
		}
		.o1 {
			order: 1;
		}
		.o2 {
			order: 2;
		}
		.o3 {
			order: 3;
		}
		.o4 {
			order: 4;
		}
		.o5 {
			order: 5;
		}
		.o6 {
			order: 6;
		}
		.o7 {
			order: 7;
		}
		.qhead {
			align-items: flex-start;
		}
		.px {
			align-items: flex-start;
		}
	}
</style>
