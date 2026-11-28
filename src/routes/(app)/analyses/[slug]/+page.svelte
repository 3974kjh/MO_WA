<script lang="ts">
	// FE-11 분석 리포트(시안 analysis-detail.html 중 머리·요약/상세만). 상세 본문(ReportView)은 검사를 통과한 저장 렌더 캐시만.
	// 장 접기·한눈에·게시 바는 이후 단위(사전 검토 대상)라 넣지 않는다.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import ReportView from '$lib/components/report/ReportView.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { formatKstShort } from '$lib/format/datetime';
	import { formatBriefingDate } from '$lib/routing/briefings';
	import { withDetailMode, type DetailMode } from '$lib/routing/listQuery';

	let { data }: { data: PageData } = $props();
	let r = $derived(data.report);
	let lines = $derived(
		(r.summary ?? '')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
	);

	function setMode(mode: DetailMode) {
		const search = withDetailMode(page.url.searchParams, mode);
		if (search === page.url.search) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/(app)/analyses/[slug]', { slug: r.slug })}${search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

<svelte:head><title>{r.title} · MO_WA</title></svelte:head>

<article class="detail" data-testid="analysis-detail" data-mode={data.mode}>
	<header class="head">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- load가 만든 /stocks 경로 -->
		<a class="back" href={data.backHref} data-testid="analysis-back">{data.backLabel}</a>
		<h2>{r.title}</h2>
		<span class="badges">
			<Badge tone={r.subtype === 'buy_plan' ? 'info' : 'default'}
				>{r.subtype === 'buy_plan' ? '매수 계획서' : '기업분석'}</Badge
			>
			{#if r.status === 'draft'}<Badge tone="warn">초안 · 게시 전</Badge>
			{:else}<Badge tone="ok" icon="✓">게시됨</Badge>{/if}
		</span>
		<p class="muted num text-sm">
			{formatBriefingDate(r.report_date)}{#if r.generated_at}
				· 작성 {formatKstShort(r.generated_at)}{/if}
		</p>
		<SegmentedControl
			ariaLabel="본문 보기"
			options={[
				{ value: 'summary', label: '요약' },
				{ value: 'detail', label: '상세' }
			]}
			value={data.mode}
			onchange={setMode}
		/>
	</header>
	{#if lines.length}
		<ul class="summary" aria-label="요약">
			{#each lines as line, i (i)}<li>{line}</li>{/each}
		</ul>
	{:else}
		<p class="muted text-sm">요약이 아직 없어요.</p>
	{/if}
	{#if data.mode === 'detail'}
		{#if data.body}
			<ReportView report={data.body} mode="detail" />
		{:else}
			<p class="muted text-sm" data-testid="detail-pending">상세 본문은 준비 중이에요.</p>
		{/if}
	{/if}
	<footer class="muted num text-sm">v{r.version} · 투자 권유 아님</footer>
</article>

<style>
	.detail,
	.head {
		max-width: var(--size-prose);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.head {
		align-items: flex-start;
		gap: 8px;
	}
	h2 {
		font-size: var(--text-xl);
		font-weight: 700;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.muted {
		color: var(--color-muted);
	}
	/* 이동 링크 터치 40/44(DS §7-15 v1.7.5) */
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		color: var(--color-accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	@media (max-width: 639px) {
		.back {
			min-height: 44px;
		}
	}
	.summary {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-left: 18px;
		list-style: disc;
	}
	footer {
		border-top: 1px solid var(--color-line);
		padding-top: 12px;
	}
</style>
