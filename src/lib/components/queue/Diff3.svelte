<script lang="ts">
	/**
	 * 3열 diff(항목 / 지금 / 봇 요청 값 / 내가 고친 값) — DS §7-6b. 읽기 전용(최종 확인·지난 내역).
	 * 모바일(<640)은 항목별 블록으로 쌓고 열 이름을 앞에 붙인다.
	 */
	import type { Diff3Row } from '$lib/queue/proposals';

	let { rows }: { rows: Diff3Row[] } = $props();
</script>

<div class="d3" role="table" aria-label="지금 · 봇 요청 값 · 내가 고친 값">
	<div role="row" class="row head">
		<span role="columnheader">항목</span>
		<span role="columnheader">지금</span>
		<span role="columnheader">봇 요청 값</span>
		<span role="columnheader">내가 고친 값</span>
	</div>
	{#each rows as r (r.key)}
		<div role="row" class="row">
			<span role="rowheader" class="k">{r.label}</span>
			<span role="cell" class="cur num"><span class="lbl">지금</span>{r.now}</span>
			<span role="cell" class="bot num"><span class="lbl">봇 요청 값</span>{r.bot}</span>
			<span role="cell" class="mine num" class:changed={r.changed}
				><span class="lbl">내가 고친 값</span>{r.mine}{#if r.changed}<span class="chg">고침</span
					>{/if}</span
			>
		</div>
	{/each}
</div>

<style>
	.d3 {
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		overflow: hidden;
		font-size: var(--text-sm);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(64px, auto) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
		border-top: 1px solid var(--color-line);
	}
	.row:first-child {
		border-top: 0;
	}
	.row > span {
		padding: 8px 10px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.head > span {
		background: var(--color-surface-2);
		color: var(--color-muted);
		font-weight: 600;
		font-size: var(--text-xs);
	}
	.k {
		font-weight: 600;
		background: var(--color-surface-2);
	}
	.cur {
		color: var(--color-muted);
	}
	.mine.changed {
		background: var(--color-accent-soft);
		font-weight: 700;
	}
	.chg {
		font-size: var(--text-xs);
		color: var(--color-accent);
		font-weight: 600;
		margin-left: 6px;
	}
	.lbl {
		display: none;
	}
	@media (max-width: 639px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}
		.head {
			display: none;
		}
		.row > span {
			padding: 4px 12px;
		}
		.k {
			padding-top: 10px;
		}
		.lbl {
			display: inline-block;
			min-width: 72px;
			color: var(--color-subtle);
			font-size: var(--text-xs);
			font-weight: 600;
		}
	}
</style>
