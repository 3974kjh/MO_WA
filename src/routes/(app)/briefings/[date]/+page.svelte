<script lang="ts">
	// FE-04 브리핑 상세: 메타·요약/상세 모드(?mode=)·목록 링크. 본문(ReportView)은 렌더 캐시 연결 뒤 붙인다.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Tag from '$lib/components/ui/Tag.svelte';
	import { formatKstShort } from '$lib/format/datetime';
	import { formatBriefingDate, headlineText } from '$lib/routing/briefings';
	import { withDetailMode, type DetailMode } from '$lib/routing/listQuery';

	let { data }: { data: PageData } = $props();

	let b = $derived(data.briefing);
	let hl = $derived(headlineText(b.headline));
	let summaryLines = $derived(
		(b.summary ?? '')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
	);

	function setMode(mode: DetailMode) {
		const search = withDetailMode(page.url.searchParams, mode);
		if (search === page.url.search) return;
		// 경로는 resolve()로 만들고 쿼리만 붙인다.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/(app)/briefings/[date]', { date: b.report_date })}${search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

<svelte:head><title>{formatBriefingDate(b.report_date)} 브리핑 · MO_WA</title></svelte:head>

<article class="detail" data-testid="briefing-detail" data-mode={data.mode}>
	<header class="head">
		<a class="back text-sm" href={resolve('/briefings')}>← 브리핑 목록</a>
		<h2 class="title">{b.title}</h2>
		<p class="date num">{formatBriefingDate(b.report_date)}</p>
		<p class="headline" class:missing={hl.missing}>{hl.text}</p>
		{#if b.tags.length}
			<div class="tags">
				{#each b.tags as t (t)}
					<Tag>{t}</Tag>
				{/each}
			</div>
		{/if}
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

	{#if summaryLines.length}
		<section class="summary" aria-label="요약">
			<ul>
				{#each summaryLines as line, i (i)}
					<li>{line}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if !summaryLines.length}
		<p class="pending text-sm">요약이 아직 없어요.</p>
	{/if}
	{#if data.mode === 'detail'}
		<p class="pending text-sm" data-testid="detail-pending">상세 근거 본문은 준비 중이에요.</p>
	{/if}

	{#if b.sources.length}
		<ul class="sources" aria-label="출처">
			{#each b.sources as s, i (i)}
				<li>{s.label} · {s.publisher} · {formatKstShort(s.accessed_at)}</li>
			{/each}
		</ul>
	{/if}

	<footer class="foot text-sm">
		{#if b.generated_at}<span class="num">생성 {formatKstShort(b.generated_at)}</span> ·
		{/if}<span class="num">v{b.version}</span> · 투자 권유 아님
	</footer>
</article>

<style>
	.detail {
		max-width: var(--size-prose);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.back {
		color: var(--color-muted);
	}
	.title {
		font-size: var(--text-xl);
		font-weight: 700;
	}
	.date {
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
	.headline {
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.6rem;
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
	.summary ul {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-left: 18px;
		list-style: disc;
	}
	.pending {
		color: var(--color-muted);
	}
	.sources {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.foot {
		color: var(--color-subtle);
		border-top: 1px solid var(--color-line);
		padding-top: 12px;
	}
</style>
