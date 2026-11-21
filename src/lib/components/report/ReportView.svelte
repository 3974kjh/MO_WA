<script lang="ts">
	/**
	 * 리포트 본문 (FE-15, DS §7-5, H §3·§4).
	 * `{@html}`은 앱 전체에서 **이 파일에만** 있고, 서버 renderReport()가 sanitize한 결과만 받는다(테스트로 검사).
	 * - mode=summary: A(요약)만, detail: A + B(상세 근거). hasSplit=false면 토글 없이 전체(a)를 보인다.
	 * - 용어 풀이(.gloss): PC는 title 툴팁, 탭·Enter·Space면 하단 시트로 설명을 연다.
	 */
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import type { ReportMode, SanitizedHtml } from '$lib/markdown/types';

	let {
		report,
		mode = 'detail',
		class: className = ''
	}: {
		/** 서버 renderReport() 결과(sanitize 완료). a·b는 SanitizedHtml 브랜드 타입이라 일반 string을 넣을 수 없다 */
		report: { a: SanitizedHtml; b: SanitizedHtml; hasSplit: boolean };
		mode?: ReportMode;
		class?: string;
	} = $props();

	let showB = $derived(report.hasSplit && mode === 'detail' && report.b.length > 0);
	let gloss = $state<{ term: string; text: string } | null>(null);

	function glossFrom(e: Event): HTMLElement | null {
		const t = e.target;
		return t instanceof Element ? (t.closest('.gloss') as HTMLElement | null) : null;
	}
	function open(el: HTMLElement) {
		gloss = { term: el.dataset.gloss ?? el.textContent ?? '', text: el.title };
	}
	function onclick(e: MouseEvent) {
		const el = glossFrom(e);
		if (el) open(el);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		const el = glossFrom(e);
		if (!el) return;
		e.preventDefault();
		open(el);
	}
</script>

<!-- 본문 안 .gloss(tabindex=0)의 클릭·키 입력을 위임으로 받는다. 본문 자체는 상호작용 요소가 아니다. -->
<article class="report-body {className}">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="body" {onclick} {onkeydown}>
		<div class="part part-a">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitize된 renderReport() 결과만(FE-15) -->
			{@html report.a}
		</div>
		{#if showB}
			<div class="part part-b">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitize된 renderReport() 결과만(FE-15) -->
				{@html report.b}
			</div>
		{/if}
	</div>
</article>

<Sheet open={gloss !== null} onclose={() => (gloss = null)} title={gloss?.term ?? '용어 풀이'}>
	<p class="gloss-text">{gloss?.text}</p>
</Sheet>

<style>
	.report-body {
		font-size: var(--text-md);
		line-height: 1.7rem;
		max-width: var(--size-prose);
		color: var(--color-text);
		word-break: keep-all;
		overflow-wrap: break-word;
	}
	.part :global(h2) {
		font-size: var(--text-xl);
		line-height: 1.85rem;
		font-weight: 700;
		margin: 40px 0 12px;
		padding-top: 8px;
		scroll-margin-top: 84px;
	}
	.part :global(h3) {
		font-size: var(--text-lg);
		font-weight: 700;
		margin: 28px 0 8px;
		scroll-margin-top: 84px;
	}
	.part :global(h4) {
		font-size: var(--text-base);
		font-weight: 700;
		margin: 20px 0 6px;
	}
	.part :global(p) {
		margin: 0 0 14px;
	}
	.part :global(ul),
	.part :global(ol) {
		padding-left: 22px;
		margin: 0 0 14px;
	}
	.part :global(ul) {
		list-style: disc;
	}
	.part :global(ol) {
		list-style: decimal;
	}
	.part :global(li) {
		margin: 4px 0;
	}
	.part :global(strong),
	.part :global(b) {
		font-weight: 700;
	}
	.part :global(a) {
		color: var(--color-accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.part :global(blockquote) {
		margin: 0 0 16px;
		padding: 10px 16px;
		background: var(--color-surface-2);
		color: var(--color-muted);
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
	}
	.part :global(blockquote p:last-child) {
		margin-bottom: 0;
	}
	.part :global(.gloss) {
		border-bottom: 1px dotted var(--color-subtle);
		cursor: help;
	}
	.part :global(.callout) {
		display: flex;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius-md);
		margin: 0 0 16px;
		font-size: var(--text-base);
		line-height: 1.5rem;
		background: var(--color-surface-2);
		color: var(--color-text);
		border: 1px solid var(--color-line);
	}
	.part :global(.callout.warn) {
		background: var(--color-warn-soft);
	}
	.part :global(.callout.err) {
		background: var(--color-up-soft);
	}
	.part :global(.callout .ic) {
		flex: none;
	}
	.part :global(.callout-body > :last-child) {
		margin-bottom: 0;
	}
	.part :global(.details) {
		margin: 0 0 16px;
		padding: 8px 14px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
	}
	.part :global(.details > summary) {
		cursor: pointer;
		font-weight: 600;
		min-height: var(--size-touch);
		display: flex;
		align-items: center;
	}
	.part :global(.tbl-wrap) {
		overflow-x: auto;
		margin: 0 0 18px;
		max-width: 100%;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.part :global(.tbl) {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-table);
		font-variant-numeric: tabular-nums;
	}
	.part :global(.tbl th),
	.part :global(.tbl td) {
		padding: 8px 12px;
		border-bottom: 1px solid var(--color-line);
		text-align: left;
		white-space: nowrap;
	}
	.part :global(.tbl th) {
		background: var(--color-surface-2);
		font-weight: 600;
	}
	.part :global(.tbl [align='right']) {
		text-align: right;
	}
	.part :global(.tbl [align='center']) {
		text-align: center;
	}
	.part :global(.tbl tr:last-child td) {
		border-bottom: 0;
	}
	.part :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: var(--color-surface-2);
		padding: 1px 5px;
		border-radius: var(--radius-xs);
	}
	.part :global(pre) {
		overflow-x: auto;
		margin: 0 0 16px;
		padding: 12px 14px;
		background: var(--color-surface-2);
		border-radius: var(--radius-md);
	}
	.part :global(pre code) {
		padding: 0;
		background: none;
	}
	.part :global(hr) {
		border: 0;
		border-top: 1px solid var(--color-line);
		margin: 28px 0;
	}
	.part :global(img) {
		max-width: 100%;
		height: auto;
	}
	.part :global(figure) {
		margin: 0 0 18px;
	}
	.part :global(figcaption) {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		margin-top: 6px;
	}
	.gloss-text {
		font-size: var(--text-md);
		line-height: 1.6rem;
	}
	@media (max-width: 639px) {
		.part :global(h2) {
			font-size: var(--text-lg);
			scroll-margin-top: 120px;
		}
		.part :global(h3) {
			scroll-margin-top: 120px;
		}
	}
</style>
