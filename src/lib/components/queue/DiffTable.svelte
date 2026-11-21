<script lang="ts">
	/** 2열 diff(항목 / 지금 / 바뀔 값) — DS §7-6. 값은 전체 값(축약 없음). */
	import type { DiffRow } from '$lib/queue/proposals';

	let { rows, label = '변경 내용' }: { rows: DiffRow[]; label?: string } = $props();
</script>

<div class="diff" role="table" aria-label={label}>
	<div role="row" class="r">
		<span role="columnheader" class="h">항목</span>
		<span role="columnheader" class="h">지금</span>
		<span role="columnheader" class="h">바뀔 값</span>
	</div>
	{#each rows as r (r.key)}
		<div role="row" class="r">
			<span role="rowheader" class="k">{r.label}</span>
			<span role="cell" class="before num"><span class="sr-only">지금 </span>{r.from}</span>
			<span role="cell" class="after num"><span class="sr-only">바뀔 값 </span>{r.to}</span>
		</div>
	{/each}
</div>

<style>
	.diff {
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		overflow: hidden;
		font-size: var(--text-sm);
	}
	.r {
		display: grid;
		grid-template-columns: minmax(64px, auto) minmax(0, 1fr) minmax(0, 1fr);
		border-top: 1px solid var(--color-line);
	}
	.r:first-child {
		border-top: 0;
	}
	.r > span {
		padding: 8px 10px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.h {
		background: var(--color-surface-2);
		color: var(--color-muted);
		font-weight: 600;
		font-size: var(--text-xs);
	}
	.k {
		font-weight: 600;
		background: var(--color-surface-2);
	}
	.before {
		color: var(--color-muted);
	}
	.after {
		font-weight: 700;
	}
</style>
