<script lang="ts">
	/**
	 * /dev/components — FE-02 컴포넌트 쇼케이스(로컬 개발 전용, 운영 빌드 404).
	 * design/components.html 과 같은 절 순서로 실제 Svelte 컴포넌트를 렌더한다. 차트(FE-14)·리포트 본문(FE-15)·승인 큐(FE-07)는 해당 티켓에서 추가.
	 */
	import { resolve } from '$app/paths';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import Sparkline from '$lib/components/charts/Sparkline.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Delta from '$lib/components/ui/Delta.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import MetricTile from '$lib/components/ui/MetricTile.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import MonthGroupList from '$lib/components/ui/MonthGroupList.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import LoadingShimmer from '$lib/components/ui/LoadingShimmer.svelte';
	import Tag from '$lib/components/ui/Tag.svelte';
	import { toast } from '$lib/components/ui/toast.svelte';
	import type { Col, SheetVariant } from '$lib/components/ui/types';
	import { contrastRatio } from '$lib/dev/contrast';
	import {
		kospiDaily,
		kospiSeries,
		pnlNegativeOnly,
		sparkDown,
		sparkUp,
		weights
	} from '$lib/fixtures/charts';
	import { formatQty } from '$lib/format/number';
	import { formatKstShort } from '$lib/format/datetime';
	import {
		briefingGroups,
		holdings,
		moneyRows,
		themeRows,
		type HoldingRow,
		type ThemeRow
	} from '$lib/fixtures/showcase';
	import { themeState } from '$lib/theme/themeState.svelte';
	import type { ThemeMode } from '$lib/theme/theme';

	$effect(() => themeState.sync());

	const SWATCHES = [
		'canvas',
		'surface',
		'surface-2',
		'surface-3',
		'line',
		'line-strong',
		'text',
		'muted',
		'subtle',
		'accent',
		'accent-soft',
		'up',
		'up-soft',
		'down',
		'down-soft',
		'warn',
		'warn-soft',
		'info',
		'info-soft',
		'ok',
		'ok-soft'
	];
	const PAIRS: [string, string][] = [
		['text', 'canvas'],
		['text', 'surface'],
		['muted', 'surface'],
		['subtle', 'surface'],
		['subtle', 'canvas'],
		['subtle', 'surface-2'],
		['accent', 'surface'],
		['on-accent', 'accent'],
		['up', 'surface'],
		['down', 'surface'],
		['up', 'up-soft'],
		['down', 'down-soft'],
		['warn', 'warn-soft'],
		['info', 'info-soft'],
		['ok', 'ok-soft'],
		['accent', 'accent-soft'],
		['warn', 'surface'],
		['ok', 'surface'],
		['info', 'surface']
	];

	// 현재 테마의 실제 토큰 값(테마 전환·OS 변경 시 다시 읽음)
	let tokenValues = $state<Record<string, string>>({});
	function readTokens() {
		const cs = getComputedStyle(document.documentElement);
		const names = new Set([...SWATCHES, ...PAIRS.flat()]);
		tokenValues = Object.fromEntries(
			[...names].map((n) => [n, cs.getPropertyValue(`--color-${n}`).trim()])
		);
	}
	$effect(() => {
		void themeState.mode;
		readTokens();
		const mq = matchMedia('(prefers-color-scheme: dark)');
		mq.addEventListener('change', readTokens);
		return () => mq.removeEventListener('change', readTokens);
	});

	const themeOptions: { value: ThemeMode; label: string }[] = [
		{ value: 'system', label: '기기 설정 따름' },
		{ value: 'light', label: '라이트' },
		{ value: 'dark', label: '다크' }
	];

	let seg = $state<'summary' | 'detail'>('summary');
	let chips = $state({ a: false, b: true });
	let query = $state('');
	let debounced = $state('');
	let sheetVariant = $state<SheetVariant | null>(null);

	const holdingCols: Col<HoldingRow>[] = [
		{ key: 'name', label: '종목', title: true, render: nameCell },
		{ key: 'qty', label: '수량', align: 'right', render: qtyCell },
		{ key: 'avg', label: '평균 단가', align: 'right', render: avgCell },
		{ key: 'price', label: '현재가', align: 'right', render: priceCell },
		{ key: 'pnlPct', label: '평균 단가 대비', align: 'right', render: pnlCell },
		{ key: 'weight', label: '비중', align: 'right', render: weightCell }
	];
	const themeCols: Col<ThemeRow>[] = [
		{ key: 'kind', label: '구분', render: kindCell },
		{ key: 'theme', label: '테마', render: themeCell },
		{ key: 'basis', label: '근거' },
		{ key: 'meaning', label: '의미' }
	];
	type MoneyRow = (typeof moneyRows)[number] & Record<string, unknown>;
	const moneyCols: Col<MoneyRow>[] = [
		{ key: 'value', label: '저장 값(원본·D-4: USD 4자리 유지)', render: rawCell },
		{ key: 'shown', label: '표기', render: shownCell },
		{ key: 'note', label: '규칙' }
	];
	const lastSuccess = formatKstShort('2026-11-19T17:36:00+09:00');
</script>

{#snippet nameCell(r: HoldingRow)}
	<div class="tbl-name">{r.name}</div>
	<div class="tbl-sub num">{r.code}</div>
{/snippet}
{#snippet qtyCell(r: HoldingRow)}{formatQty(r.qty)}주{/snippet}
{#snippet avgCell(r: HoldingRow)}<Money value={r.avg} kind="unit" />{/snippet}
{#snippet priceCell(r: HoldingRow)}<Money value={r.price} kind="unit" />{/snippet}
{#snippet pnlCell(r: HoldingRow)}<Delta value={r.pnlPct} digits={1} />{/snippet}
{#snippet weightCell(r: HoldingRow)}{r.weight.toFixed(1)}%{/snippet}
{#snippet kindCell(r: ThemeRow)}<Badge tone={r.kind === '반복' ? 'default' : 'info'}>{r.kind}</Badge
	>{/snippet}
{#snippet themeCell(r: ThemeRow)}<b>{r.theme}</b>{/snippet}
{#snippet rawCell(r: MoneyRow)}<span class="num">{r.value}</span>{/snippet}
{#snippet shownCell(r: MoneyRow)}<b><Money value={r.value} currency={r.currency} kind={r.kind} /></b
	>{/snippet}

<svelte:head><title>MO_WA 컴포넌트 쇼케이스 (dev)</title></svelte:head>

<header class="cs-head">
	<div class="in">
		<b class="cs-title">MO_WA 컴포넌트 쇼케이스</b>
		<nav class="cs-nav" aria-label="섹션">
			<a href="#color">색</a><a href="#type">타이포</a><a href="#space">간격·반경</a><a href="#btn"
				>버튼·입력·배지</a
			><a href="#card">카드·지표</a><a href="#table">표</a><a href="#money">금액</a><a href="#chart"
				>차트</a
			><a href="#state">상태</a><a href="#sheet">시트</a><a href="#list">목록</a><a href="#nav"
				>내비게이션</a
			>
		</nav>
		<SegmentedControl
			ariaLabel="화면 모드"
			options={themeOptions}
			value={themeState.mode}
			onchange={(v) => themeState.set(v)}
		/>
	</div>
</header>

<main class="wrap">
	<section class="sec" id="color">
		<h2>색 (시맨틱 토큰)</h2>
		<p class="lead">
			상승=빨강 / 하락=파랑. 색만으로 구분하지 않고 ▲▼와 부호를 항상 병기합니다. 토큰 이름은
			Tailwind 유틸리티와 1:1 (bg-surface, text-up …).
		</p>
		<div class="sw">
			{#each SWATCHES as n (n)}
				<div>
					<i style:background="var(--color-{n})"></i>
					<span><b>{n}</b><br /><code>{tokenValues[n]?.toUpperCase() ?? ''}</code></span>
				</div>
			{/each}
		</div>
		<h3 class="h3">대비비 (WCAG AA 일반 텍스트 4.5:1, 현재 테마로 자동 계산)</h3>
		<div class="tbl-plain">
			<table>
				<thead>
					<tr><th>전경</th><th>배경</th><th class="r">대비</th><th>판정</th></tr>
				</thead>
				<tbody>
					{#each PAIRS as [fg, bg] (fg + bg)}
						{@const r = contrastRatio(tokenValues[fg] ?? '', tokenValues[bg] ?? '')}
						<tr>
							<td>{fg}</td><td>{bg}</td><td class="r num">{r ? r.toFixed(2) : '—'}</td>
							<td>{r == null ? '—' : r >= 4.5 ? 'AA ✓' : '✕ 미달'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="sec" id="type">
		<h2>타이포그래피</h2>
		<p class="lead">
			본문은 Pretendard Variable(self-host, 없으면 시스템 한글 폰트로 폴백). 숫자는 tabular-nums.
			리포트 본문은 16px / 행간 1.7, 한글은 word-break: keep-all.
		</p>
		<Card>
			<div class="type-row">
				<code>text-3xl 36/42</code><span class="num t3"
					>2,414<small class="u" style:font-size="var(--text-lg)">만 원</small></span
				>
			</div>
			<div class="type-row">
				<code>text-2xl 28/35</code><span class="t2">페이지 제목 · 지표 값</span>
			</div>
			<div class="type-row">
				<code>text-xl 22/30</code><span class="t1">섹션 제목 · 리포트 H2</span>
			</div>
			<div class="type-row">
				<code>text-lg 18/26</code><span class="tl">카드 제목 · 리포트 H3</span>
			</div>
			<div class="type-row">
				<code>text-md 16/27</code><span class="tm"
					>리포트 본문. 코스피는 4,869.96(−5.21%)으로 급락해 ‘검은 금요일’이 됐습니다.</span
				>
			</div>
			<div class="type-row">
				<code>text-base 15/24</code><span>UI 기본. 보유 종목, 확인 대기, 최근 브리핑</span>
			</div>
			<div class="type-row">
				<code>text-sm 13/20</code><span class="ts">표 본문·보조 설명. 평균 단가 대비 −23.0%</span>
			</div>
			<div class="type-row">
				<code>text-xs 12/16</code><span class="tx"
					>캡션·배지·출처. {formatKstShort('2026-11-20T08:36:00Z')}</span
				>
			</div>
			<div class="type-row">
				<code>tabular-nums</code><span class="num">1,111,111<br />8,888,888<br />−0.72%</span>
			</div>
		</Card>
	</section>

	<section class="sec" id="space">
		<h2>간격 · 반경 · 그림자</h2>
		<p class="lead">
			4px 단위. 카드 패딩 16(모바일 12~16), 카드 간격 16(모바일 12). 페이지 좌우 여백 28/20/16
			(PC/태블릿/모바일).
		</p>
		<Card>
			<div class="stack">
				<div class="sp">
					{#each [1, 2, 3, 4, 6, 8, 12] as s (s)}<i
							style:width="calc(var(--spacing) * {s})"
							style:height="calc(var(--spacing) * {s})"
						></i>{/each}
					<span class="tx subtle">&nbsp;4 8 12 16 24 32 48</span>
				</div>
				<div class="rd">
					<div style:border-radius="var(--radius-xs)">xs 4</div>
					<div style:border-radius="var(--radius-sm)">sm 6</div>
					<div style:border-radius="var(--radius-md)">md 10</div>
					<div style:border-radius="var(--radius-lg)">lg 14</div>
					<div style:border-radius="var(--radius-full)">full</div>
				</div>
				<div class="demo">
					<div class="shadow-box" style:box-shadow="var(--shadow-card)">shadow-card</div>
					<div class="shadow-box" style:box-shadow="var(--shadow-pop)">shadow-pop</div>
				</div>
			</div>
		</Card>
	</section>

	<section class="sec" id="btn">
		<h2>버튼 · 입력 · 배지 · 태그</h2>
		<p class="lead">터치 영역 최소 40px(모바일 주요 액션 44px). 포커스 링 2px.</p>
		<Card>
			<div class="stack">
				<div class="demo">
					<button type="button" class="mw-btn primary">반영</button>
					<button type="button" class="mw-btn">보류</button>
					<button type="button" class="mw-btn danger">거절</button>
					<button type="button" class="mw-btn ghost">더 보기</button>
					<button type="button" class="mw-btn" disabled>비활성</button>
					<button type="button" class="mw-btn sm">작은 버튼</button>
				</div>
				<div class="demo">
					<label class="field">텍스트<input class="mw-input" placeholder="검색어" /></label>
					<label class="field"
						>오류 상태<input
							class="mw-input"
							value="abc"
							aria-invalid="true"
							aria-describedby="err-demo"
						/><span id="err-demo" class="tx err-msg">⚠ 숫자만 입력하세요</span></label
					>
					<label class="field"
						>선택<select class="mw-select"><option>모든 종목</option></select></label
					>
					<div class="field">
						검색(디바운스 200ms)
						<SearchBox
							bind:value={query}
							placeholder="종목·태그 검색"
							oninput={(v) => (debounced = v)}
						/>
						<span class="tx subtle" aria-live="polite">반영된 값: “{debounced}”</span>
					</div>
				</div>
				<div class="demo">
					<Badge tone="up" icon="▲">매수</Badge>
					<Badge tone="down" icon="▼">매도</Badge>
					<Badge tone="warn" icon="⚠">3% 이내</Badge>
					<Badge tone="info">계획</Badge>
					<Badge tone="ok" icon="✓">반영됨</Badge>
					<Badge tone="accent">신규</Badge>
					<Badge>보류</Badge>
					<Pill count={2} />
				</div>
				<div class="demo">
					<Tag>사이드카</Tag>
					<Tag on>선택됨</Tag>
					<FilterChip pressed={chips.a} onclick={() => (chips.a = !chips.a)}>필터</FilterChip>
					<FilterChip pressed={chips.b} onclick={() => (chips.b = !chips.b)} count={12}
						>필터 on</FilterChip
					>
				</div>
				<div class="demo">
					<SegmentedControl
						ariaLabel="요약/상세"
						options={[
							{ value: 'summary', label: '요약' },
							{ value: 'detail', label: '상세' }
						]}
						value={seg}
						onchange={(v) => (seg = v)}
					/>
					<Delta value={1.39} />
					<Delta value={-5.21} />
					<Delta value={0} />
					<span class="ts subtle"
						>수량: stock {formatQty(27, 'stock')}주 · cash {formatQty(1234.567, 'cash')}</span
					>
				</div>
			</div>
		</Card>
	</section>

	<section class="sec" id="card">
		<h2>카드 · 지표 타일</h2>
		<p class="lead">타일: 라벨(13) / 값(28, 모바일 22) / 증감 / 보조. 증감은 색 + ▲▼ + 부호.</p>
		<div class="tiles">
			<MetricTile label="총 평가액">
				{#snippet value()}<Money value={24_141_484} />{/snippet}
				{#snippet delta()}<span class="down-text"
						><span aria-hidden="true">▼ </span>하루 약 <Money value={360_000} /> 감소</span
					>{/snippet}
			</MetricTile>
			<MetricTile label="평가 손익" tone="auto" delta={-8.6} deltaDigits={1}>
				{#snippet value()}<Money value={-2_271_309} />{/snippet}
			</MetricTile>
			<MetricTile label="코스피" value="4,869.96" delta={-5.21} foot="10/16~11/20" />
			<MetricTile label="달러/원" value="1,335.08" delta={5} deltaSuffix="" />
		</div>
		<div class="cards3">
			<Card title="기본 카드" headingLevel={3}>
				{#snippet aside()}<Badge>라벨</Badge>{/snippet}
				<p class="ts muted">
					제목·보조·본문 순. 패딩 16, 반경 12, 라이트는 그림자만·다크는 연한 1px 선.
				</p>
			</Card>
			<Card title="상태 배지 카드" headingLevel={3}>
				{#snippet aside()}<StatusBadge status="pending" />{/snippet}
				<p class="ts muted">상태·강조는 헤더 우측 StatusBadge(아이콘+글자)로. 왼쪽 색선 없음.</p>
			</Card>
			<Card title="확인 필요 카드" headingLevel={3}>
				{#snippet aside()}<StatusBadge status="conflict" />{/snippet}
				<p class="ts muted">충돌·만료는 warn 채움 배지로 눈에 띄게.</p>
			</Card>
		</div>
	</section>

	<section class="sec" id="table">
		<h2>표</h2>
		<p class="lead">
			PC: 헤더 고정·숫자 우측 정렬·행 호버. 모바일(&lt;640): 열 ≥5 &amp; 행 ≤10이면 <b
				>카드형 변환</b
			>(data-label 자동), 그 밖에는 <b>가로 스크롤 + 첫 열 고정 + 우측 스크롤 힌트</b>. 행은
			Enter로도 엽니다.
		</p>
		<Card flush>
			<DataTable
				columns={holdingCols}
				rows={holdings}
				stickyFirst
				caption="보유 종목"
				rowKey={(r) => r.code}
				rowLabel={(r) => `${r.name} 상세`}
				onrowclick={(r) => toast.show(`${r.name} 행 선택`)}
			/>
		</Card>
		<h3 class="h3">가로 스크롤 + 첫 열 고정 (모바일에서도 표 유지)</h3>
		<DataTable columns={themeCols} rows={themeRows} caption="테마 표" />
		<h3 class="h3">빈 표 · 로딩</h3>
		<div class="cards2">
			<DataTable columns={themeCols} rows={[]} caption="빈 표" />
			<DataTable columns={themeCols} rows={[]} loading caption="로딩 표" />
		</div>
	</section>

	<section class="sec" id="money">
		<h2>금액 표기 (만 원 축약)</h2>
		<p class="lead">
			금액(평가액·손익·총액)만 축약하고, 단가(주가·평균 단가·손익분기 가격)는 항상 전체 값. 축약
			값은 마우스 오버/포커스 시 정확한 값(title·aria-label)을 제공하고, 터치 환경에서는 탭하면 하단
			시트로 보여줍니다.
		</p>
		<DataTable
			columns={moneyCols}
			rows={moneyRows as MoneyRow[]}
			mobile="scroll"
			caption="금액 표기"
		/>
		<p class="ts muted unit-note">
			단가는 그대로: <Money value={161_600} kind="unit" /> · <Money value={210_000} kind="unit" /> ·
			<Money value={272.66} currency="USD" kind="unit" /> — 손익 색: <Money
				value={360_000}
				plus
				tone="sign"
			/> / <Money value={-2_271_309} tone="sign" />
		</p>
	</section>

	<section class="sec" id="chart">
		<h2>차트</h2>
		<p class="lead">
			카테고리 색은 chart-1~8, 등락은 빨강/파랑. 모바일(&lt;480): 높이 190, X축 눈금 4개 이내,
			탭하면 아래 값 카드. 도넛은 범례 표가 주 읽기 면이고 6% 미만·8조각 초과는 ‘기타’.
		</p>
		<div class="charts">
			<Card title="선 + 영역" headingLevel={3}>
				<LineChart
					ariaLabel="코스피 추이"
					labels={kospiSeries.map((s) => s[0])}
					series={[{ name: '코스피', values: kospiSeries.map((s) => s[1]) }]}
					area
					refLine={{ v: 5000, label: '5,000' }}
					digits={0}
				/>
			</Card>
			<Card title="막대 (일별 등락률)" headingLevel={3}>
				<BarChart ariaLabel="코스피 일별 등락률" items={kospiDaily} digits={2} />
			</Card>
			<Card title="막대 (음수만)" headingLevel={3}>
				<BarChart ariaLabel="평균 단가 대비 손익" items={pnlNegativeOnly} />
			</Card>
			<Card title="도넛 (비중)" headingLevel={3}>
				<DonutChart ariaLabel="자산 비중" items={weights} total={24_141_484} sub="평가금액 기준" />
			</Card>
			<Card title="스파크라인" headingLevel={3}>
				<p class="spark-demo">
					<span>상승 <Sparkline values={sparkUp} w={100} label="상승 예" /></span>
					<span>하락 <Sparkline values={sparkDown} w={100} label="하락 예" /></span>
					<span
						>코스피 8일 <Sparkline
							values={kospiSeries.slice(-8).map((s) => s[1])}
							label="코스피 8일 추이"
						/></span
					>
				</p>
			</Card>
		</div>
	</section>

	<section class="sec" id="state">
		<h2>빈 상태 · 로딩 · 오류</h2>
		<div class="states">
			<Card>
				<EmptyState
					title="조건에 맞는 브리핑이 없어요"
					desc="검색어를 줄이거나 필터를 해제해 보세요."
				>
					{#snippet action()}<button type="button" class="mw-btn">필터 초기화</button>{/snippet}
				</EmptyState>
			</Card>
			<Card>
				<div class="stack">
					<LoadingShimmer lines={1} />
					<LoadingShimmer lines={3} />
					<LoadingShimmer height="72px" />
					<p class="tx subtle">
						로딩: 실제 레이아웃과 같은 모양의 스켈레톤(reduced-motion에서는 정지)
					</p>
				</div>
			</Card>
			<Card>
				<ErrorState
					desc="네트워크를 확인하고 다시 시도해 주세요."
					onretry={() => toast.show('다시 시도했습니다', { tone: 'ok' })}
				/>
			</Card>
			<div class="stack">
				<Banner tone="info">정보: 11/20 확정 수급은 아직 집계되지 않았습니다.</Banner>
				<Banner tone="warn">주의: 가격이 15분 이상 지연됐습니다.</Banner>
				<Banner tone="err">오류: 종가 갱신 실패 — 마지막 성공 {lastSuccess}</Banner>
				<div class="demo">
					<button
						type="button"
						class="mw-btn sm"
						onclick={() => toast.show('반영했습니다', { tone: 'ok' })}>토스트(성공)</button
					>
					<button
						type="button"
						class="mw-btn sm"
						onclick={() =>
							toast.show('반영했습니다', {
								duration: 5000,
								action: { label: '되돌리기', onclick: () => toast.show('취소했습니다') }
							})}>토스트(되돌리기)</button
					>
				</div>
			</div>
		</div>
	</section>

	<section class="sec" id="sheet">
		<h2>시트 · 모달</h2>
		<p class="lead">
			&lt;640: 바텀시트(최대 86dvh, 그랩 핸들)·전체 화면 / ≥640: 중앙 모달 520px. 포커스 트랩, Esc,
			스크림 클릭, 닫힐 때 트리거로 포커스 복귀.
		</p>
		<div class="demo">
			<button type="button" class="mw-btn" onclick={() => (sheetVariant = 'bottom')}
				>bottom 시트</button
			>
			<button type="button" class="mw-btn" onclick={() => (sheetVariant = 'full')}>full 시트</button
			>
			<button type="button" class="mw-btn" onclick={() => (sheetVariant = 'center')}
				>center 모달</button
			>
		</div>
	</section>

	<section class="sec" id="list">
		<h2>월 그룹 목록</h2>
		<p class="lead">월 헤더는 상단바 아래에 붙습니다(sticky, PC 60 / 모바일 52).</p>
		<MonthGroupList groups={briefingGroups} itemKey={(it) => it.date}>
			{#snippet item(it)}
				<div class="list-item">
					<b class="num">{it.date}</b><span>{it.title}</span>
				</div>
			{/snippet}
		</MonthGroupList>
	</section>

	<section class="sec" id="nav">
		<h2>내비게이션</h2>
		<p class="lead">
			PC(≥1024): 좌측 사이드바 240px. 태블릿(640~1023): 72px 아이콘 레일. 모바일(&lt;640): 하단 탭
			4개 + 더보기 시트. 실제 동작은 <a href={resolve('/dev/shell')}>/dev/shell</a>에서
			확인하세요(대기 pill = pending만, 보류 제외).
		</p>
	</section>
</main>

<Sheet
	open={sheetVariant !== null}
	onclose={() => (sheetVariant = null)}
	variant={sheetVariant ?? 'bottom'}
	title={sheetVariant === 'full' ? '일지 상세' : '확인'}
>
	<p class="muted">
		{sheetVariant} 시트입니다. Tab 키로 포커스가 시트 밖으로 나가지 않는지, Esc로 닫히는지 확인하세요.
	</p>
	<div class="demo" style:margin-top="16px">
		<label class="field">메모<input class="mw-input" placeholder="입력" /></label>
	</div>
	{#snippet footer()}
		<button type="button" class="mw-btn" onclick={() => (sheetVariant = null)}>취소</button>
		<button type="button" class="mw-btn primary" onclick={() => (sheetVariant = null)}>확인</button>
	{/snippet}
</Sheet>

<style>
	.cs-head {
		position: sticky;
		top: 0;
		z-index: 30;
		background: color-mix(in srgb, var(--color-canvas) 90%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--color-line);
	}
	.in {
		max-width: var(--size-content);
		margin: 0 auto;
		padding: 10px 20px;
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}
	.cs-title {
		font-size: var(--text-lg);
	}
	.cs-nav {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
		flex: 1;
		min-width: 0;
	}
	.cs-nav a {
		white-space: nowrap;
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		color: var(--color-muted);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.cs-nav a:hover {
		background: var(--color-surface-2);
		text-decoration: none;
	}
	.wrap {
		max-width: var(--size-content);
		margin: 0 auto;
		padding: 24px 20px 60px;
	}
	.sec {
		margin-bottom: 44px;
		scroll-margin-top: 70px;
	}
	.sec > h2 {
		font-size: var(--text-xl);
		line-height: var(--text-xl--line-height);
		margin-bottom: 6px;
	}
	.lead {
		color: var(--color-muted);
		margin-bottom: 16px;
		font-size: var(--text-sm);
	}
	.h3 {
		margin: 24px 0 8px;
		font-size: var(--text-lg);
	}
	.sw {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
	}
	.sw div {
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-surface);
		font-size: var(--text-xs);
	}
	.sw i {
		display: block;
		height: 48px;
		border-bottom: 1px solid var(--color-line);
	}
	.sw span {
		display: block;
		padding: 6px 8px;
	}
	.sw code,
	.type-row code {
		font-family: var(--font-mono);
		color: var(--color-subtle);
	}
	.tbl-plain {
		overflow-x: auto;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.tbl-plain table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.tbl-plain th {
		background: var(--color-surface-2);
		color: var(--color-muted);
		text-align: left;
		padding: 10px 12px;
		font-weight: 600;
	}
	.tbl-plain td {
		padding: 9px 12px;
		border-top: 1px solid var(--color-line);
	}
	.r {
		text-align: right;
	}
	.type-row {
		display: flex;
		gap: 16px;
		align-items: baseline;
		border-bottom: 1px solid var(--color-line);
		padding: 8px 0;
	}
	.type-row code {
		width: 150px;
		flex: none;
		font-size: var(--text-xs);
	}
	.t3 {
		font-size: var(--text-3xl);
		line-height: var(--text-3xl--line-height);
		font-weight: 700;
	}
	.t2 {
		font-size: var(--text-2xl);
		line-height: var(--text-2xl--line-height);
		font-weight: 700;
	}
	.t1 {
		font-size: var(--text-xl);
		font-weight: 700;
	}
	.tl {
		font-size: var(--text-lg);
		font-weight: 700;
	}
	.tm {
		font-size: var(--text-md);
		line-height: var(--text-md--line-height);
	}
	.ts {
		font-size: var(--text-sm);
	}
	.tx {
		font-size: var(--text-xs);
	}
	.muted {
		color: var(--color-muted);
	}
	.subtle {
		color: var(--color-subtle);
	}
	.err-msg {
		color: var(--color-up);
	}
	.down-text {
		color: var(--color-down);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.demo {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: center;
	}
	.sp {
		display: flex;
		gap: 6px;
		align-items: flex-end;
	}
	.sp i {
		background: var(--color-accent);
		display: block;
		border-radius: 2px;
	}
	.rd {
		display: flex;
		gap: 14px;
		flex-wrap: wrap;
	}
	.rd div {
		width: 84px;
		height: 56px;
		background: var(--color-surface-2);
		border: 1px solid var(--color-line-strong);
		display: grid;
		place-items: center;
		font-size: var(--text-xs);
	}
	.shadow-box {
		background: var(--color-surface);
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		padding: 16px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 16px;
	}
	.cards3 {
		display: grid;
		gap: 16px;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
	}
	.charts {
		display: grid;
		gap: 16px;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
	}
	.spark-demo {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 24px;
		align-items: center;
	}
	.cards2 {
		display: grid;
		gap: 16px;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
	}
	.states {
		display: grid;
		gap: 16px;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		align-items: start;
	}
	.unit-note {
		margin-top: 10px;
	}
	:global(.tbl-name) {
		font-weight: 600;
	}
	:global(.tbl-sub) {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.list-item {
		display: flex;
		gap: 12px;
		padding: 12px 16px;
		min-height: 56px;
		align-items: center;
	}
	@media (max-width: 1279px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 639px) {
		.tiles {
			gap: 8px;
		}
		.wrap {
			padding: 16px 16px 48px;
		}
		.type-row code {
			width: 110px;
		}
	}
</style>
