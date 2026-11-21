<script lang="ts">
	/** FE-15 리포트 본문 확인 화면(로컬 개발 전용). 픽스처 브리핑을 서버에서 렌더해 보여 준다. */
	import ReportView from '$lib/components/report/ReportView.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import type { ReportMode } from '$lib/markdown/types';

	let { data } = $props();
	let mode = $state<ReportMode>('summary');
	let toc = $derived(data.report.toc.filter((t) => mode === 'detail' || t.part === 'A'));
</script>

<svelte:head><title>MO_WA 리포트 본문 (dev)</title></svelte:head>

<main class="wrap">
	<header class="head">
		<h1>리포트 본문</h1>
		<p class="meta num">
			{data.bytes.toLocaleString('ko-KR')} B · 서버 렌더 {data.ms.toFixed(1)}ms
		</p>
		{#if data.report.hasSplit}
			<SegmentedControl
				ariaLabel="본문 보기"
				options={[
					{ value: 'summary', label: '요약' },
					{ value: 'detail', label: '상세' }
				]}
				value={mode}
				onchange={(v) => (mode = v)}
			/>
		{/if}
	</header>
	<div class="cols">
		<ReportView report={data.report} {mode} />
		<nav class="toc" aria-label="목차">
			<ol>
				{#each toc as t (t.id)}
					<li class="l{t.level}"><a href="#{t.id}">{t.text}</a></li>
				{/each}
			</ol>
		</nav>
	</div>
</main>

<style>
	.wrap {
		max-width: 1040px;
		margin: 0 auto;
		padding: 24px 16px 80px;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		margin-bottom: 20px;
	}
	h1 {
		font-size: var(--text-xl);
		font-weight: 700;
	}
	.meta {
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 224px;
		gap: 32px;
	}
	.toc {
		position: sticky;
		top: 24px;
		align-self: start;
		font-size: var(--text-sm);
	}
	.toc li {
		padding: 4px 0;
	}
	.toc .l3 {
		padding-left: 12px;
	}
	@media (max-width: 1023px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.toc {
			display: none;
		}
	}
</style>
