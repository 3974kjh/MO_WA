<script lang="ts">
	/**
	 * FE-06 일지 상세 본문(PC 우측 패널 · 태블릿 모달 · 모바일 전체 시트가 함께 쓴다).
	 * 메모는 마크다운으로 렌더하지 않고 글자 그대로 보인다(렌더러·sanitize 경로를 쓰지 않음).
	 * 가격·손익분기 가격은 단가라 축약하지 않는다(Money kind=unit, 행 통화).
	 */
	import { resolve } from '$app/paths';
	import Money from '$lib/components/ui/Money.svelte';
	import { briefingDetailPath } from '$lib/routing/briefings';
	import JournalKindBadges from './JournalKindBadges.svelte';
	import {
		JOURNAL_STATE_LABEL,
		dotDate,
		qtyText,
		type JournalItem,
		type ReportOption
	} from '$lib/journal/view';

	let {
		item,
		report,
		position,
		prev,
		next,
		onprev,
		onnext,
		onedit,
		onarchive,
		headingId
	}: {
		item: JournalItem;
		report: ReportOption | null;
		/** '3 / 30' — 목록 안에 있을 때만 */
		position: string | null;
		prev: string | null;
		next: string | null;
		onprev: () => void;
		onnext: () => void;
		onedit: () => void;
		onarchive: () => void;
		headingId?: string;
	} = $props();

	let instrumentText = $derived(
		item.instrument_ticker
			? item.instrument_name
				? `${item.instrument_name} (${item.instrument_ticker})`
				: item.instrument_ticker
			: item.tickers.join(', ') || '—'
	);
	let reportPath = $derived(report ? briefingDetailPath(report) : null);
</script>

<article class="detail" data-testid="journal-detail" data-id={item.id}>
	<div class="nav">
		<button
			type="button"
			class="mw-btn ghost sm"
			disabled={!prev}
			aria-label="이전 일지"
			onclick={onprev}>‹ 이전</button
		>
		{#if position}<span class="pos num" data-testid="journal-position">{position}</span>{/if}
		<button
			type="button"
			class="mw-btn ghost sm"
			disabled={!next}
			aria-label="다음 일지"
			onclick={onnext}>다음 ›</button
		>
	</div>
	<JournalKindBadges {item} state={false} />
	<h2 class="dp-title" id={headingId}>{item.title}</h2>
	<dl class="kv">
		<dt>날짜</dt>
		<dd class="num">{dotDate(item.entry_date)}</dd>
		<dt>종목</dt>
		<dd>{instrumentText}</dd>
		<dt>가격</dt>
		<dd class="num" data-testid="journal-price">
			{#if item.price != null && item.currency}<Money
					value={item.price}
					currency={item.currency}
					kind="unit"
					label="가격"
				/>{:else}—{/if}
		</dd>
		<dt>수량</dt>
		<dd class="num">{item.qty == null ? '—' : qtyText(item.qty, item.instrument_asset_type)}</dd>
		<dt>손익분기 가격</dt>
		<dd class="num">
			{#if item.breakeven != null && item.currency}<Money
					value={item.breakeven}
					currency={item.currency}
					kind="unit"
					label="손익분기 가격"
				/>{:else}—{/if}
		</dd>
		<dt>상태</dt>
		<dd>{item.kind === 'review' ? '—' : JOURNAL_STATE_LABEL[item.state]}</dd>
	</dl>
	<h3 class="mw-sub">메모</h3>
	{#if item.memo_md && item.memo_md.trim()}
		<p class="memo">{item.memo_md}</p>
	{:else}
		<p class="memo muted">메모 없음</p>
	{/if}
	<h3 class="mw-sub">근거·출처</h3>
	<div class="links">
		{#if item.source_url}
			<!-- 외부 주소는 사용자가 입력한 http(s) 주소만(DB CHECK R-VAL-S04). -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a class="link" href={item.source_url} target="_blank" rel="noopener noreferrer nofollow"
				>↗ 출처 열기</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
		{#if report}
			{#if reportPath}
				<a class="link" href={resolve(reportPath)}>↗ 브리핑 {dotDate(report.report_date)}</a>
			{:else}
				<span class="link">리포트 · {report.title}</span>
			{/if}
		{:else if item.report_id}
			<span class="link muted">연결한 리포트</span>
		{/if}
		{#if !item.source_url && !item.report_id}<span class="muted">없음</span>{/if}
	</div>
	<div class="actions">
		<button type="button" class="mw-btn" onclick={onedit}>수정</button>
		<button type="button" class="mw-btn ghost" onclick={onarchive}>보관</button>
	</div>
</article>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.pos {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.dp-title {
		font-size: var(--text-xl);
		line-height: 1.85rem;
		margin: 4px 0 6px;
		overflow-wrap: anywhere;
	}
	.kv {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 16px;
		margin: 0 0 8px;
	}
	.kv dt {
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
	.kv dd {
		margin: 0;
		text-align: right;
		font-weight: 600;
	}
	.mw-sub {
		font-size: var(--text-sm);
		color: var(--color-muted);
		font-weight: 600;
		margin: 6px 0 0;
	}
	.memo {
		white-space: pre-wrap;
		line-height: 1.6rem;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.link {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 0 10px;
		border: 1px solid var(--color-line-strong);
		border-radius: 999px;
		font-size: var(--text-sm);
		color: var(--color-text);
		text-decoration: none;
	}
	.muted {
		color: var(--color-muted);
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
</style>
