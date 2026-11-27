<script lang="ts" generics="T extends Record<string, unknown>">
	/**
	 * 표 (FE-02, DS §7-3, H §3)
	 * - PC: 헤더 고정, 숫자 우측 정렬 + tabular-nums, 행 호버
	 * - 모바일(<640): mobile='auto'면 열 ≥5 & 행 ≤10 → 카드형(data-label 자동), 아니면 가로 스크롤 + 첫 열 고정 + 우측 스크롤 힌트
	 * - 행 클릭: tabindex=0 + Enter
	 */
	import type { Snippet } from 'svelte';
	import type { Col } from './types';
	import { resolveMobileMode, type MobileMode } from './dataTableMode';
	import LoadingShimmer from './LoadingShimmer.svelte';

	let {
		columns,
		rows,
		mobile = 'auto',
		stickyFirst = false,
		caption,
		rowKey,
		rowLabel,
		onrowclick,
		empty,
		loading = false
	}: {
		columns: Col<T>[];
		rows: T[];
		mobile?: MobileMode | 'auto';
		/** PC에서도 첫 열 고정(가로 스크롤 표). 모바일 스크롤형은 항상 고정 */
		stickyFirst?: boolean;
		/** 스크린리더용 표 제목 */
		caption?: string;
		rowKey?: (row: T, i: number) => string | number;
		/** 클릭 가능한 행의 접근성 이름 */
		rowLabel?: (row: T) => string;
		onrowclick?: (row: T) => void;
		empty?: Snippet;
		loading?: boolean;
	} = $props();

	let mode = $derived(resolveMobileMode(mobile, columns.length, rows.length));
	let wrap = $state<HTMLDivElement>();
	let canScrollRight = $state(false);

	function updateHint() {
		if (!wrap) return;
		canScrollRight = wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1;
	}

	$effect(() => {
		if (!wrap) return;
		void rows.length;
		updateHint();
		const ro = new ResizeObserver(updateHint);
		ro.observe(wrap);
		return () => ro.disconnect();
	});

	function alignClass(c: Col<T>) {
		return c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : '';
	}
	function cellText(row: T, c: Col<T>) {
		const v = row[c.key];
		return v == null ? '—' : String(v);
	}
</script>

<div class="tbl-outer" class:hint={canScrollRight && mode === 'scroll'} data-mode={mode}>
	<div class="tbl-wrap table-wrap" bind:this={wrap} onscroll={updateHint}>
		<table
			class="tbl table {mode}"
			class:sticky-first={stickyFirst}
			class:sticky-m={mode === 'scroll'}
		>
			{#if caption}<caption class="sr-only">{caption}</caption>{/if}
			<thead>
				<tr>
					{#each columns as c (c.key)}
						<th scope="col" class={alignClass(c)}>{c.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr class="state-row"><td colspan={columns.length}><LoadingShimmer lines={3} /></td></tr>
				{:else if rows.length === 0}
					<tr class="state-row"
						><td colspan={columns.length}
							>{#if empty}{@render empty()}{:else}<p class="empty">데이터가 없습니다.</p>{/if}</td
						></tr
					>
				{:else}
					{#each rows as row, i (rowKey ? rowKey(row, i) : i)}
						<tr
							class:clickable={!!onrowclick}
							tabindex={onrowclick ? 0 : undefined}
							aria-label={onrowclick && rowLabel ? rowLabel(row) : undefined}
							onclick={onrowclick ? () => onrowclick(row) : undefined}
							onkeydown={onrowclick
								? (e) => {
										if (e.key === 'Enter') onrowclick(row);
									}
								: undefined}
						>
							{#each columns as c (c.key)}
								<td
									class="{alignClass(c)} {c.title ? 'title-cell' : ''}"
									class:num={c.num || c.align === 'right'}
									class:hide-m={c.hideOnMobile}
									data-label={c.label}
									>{#if c.render}{@render c.render(row)}{:else}{cellText(row, c)}{/if}</td
								>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	.tbl-outer {
		position: relative;
		min-width: 0;
	}
	/* 우측 스크롤 힌트(그라데이션 그림자, H §7) */
	.tbl-outer::after {
		content: '';
		position: absolute;
		top: 1px;
		right: 1px;
		bottom: 1px;
		width: 28px;
		pointer-events: none;
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		background: linear-gradient(to left, var(--color-surface), transparent);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.tbl-outer.hint::after {
		opacity: 1;
	}
	.tbl-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		-webkit-overflow-scrolling: touch;
	}
	:global(.card.flush) .tbl-wrap {
		border: 0;
		border-radius: 0;
	}
	table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		font-size: var(--text-sm);
		line-height: var(--text-sm--line-height);
	}
	th {
		position: sticky;
		top: 0;
		background: var(--color-surface-2);
		color: var(--color-muted);
		font-weight: 600;
		text-align: left;
		padding: 10px 12px;
		border-bottom: 1px solid var(--color-line);
		white-space: nowrap;
	}
	td {
		padding: 11px 12px;
		border-bottom: 1px solid var(--color-line);
		vertical-align: middle;
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	tbody tr:not(.state-row):hover td {
		background: var(--color-surface-2);
	}
	.r {
		text-align: right;
	}
	.c {
		text-align: center;
	}
	td.num,
	th.r {
		font-family: var(--font-num);
		font-variant-numeric: tabular-nums;
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	.empty {
		text-align: center;
		color: var(--color-subtle);
		padding: 16px 0;
	}
	.sticky-first th:first-child,
	.sticky-first td:first-child {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--color-surface);
		box-shadow: 1px 0 0 var(--color-line);
	}
	.sticky-first th:first-child {
		background: var(--color-surface-2);
		z-index: 2;
	}
	.sticky-first tbody tr:hover td:first-child {
		background: var(--color-surface-2);
	}

	@media (max-width: 639px) {
		/* 스크롤형: 첫 열 고정 */
		.sticky-m th:first-child,
		.sticky-m td:first-child {
			position: sticky;
			left: 0;
			z-index: 1;
			background: var(--color-surface);
			box-shadow: 1px 0 0 var(--color-line);
		}
		.sticky-m th:first-child {
			background: var(--color-surface-2);
			z-index: 2;
		}
		.scroll th,
		.scroll td {
			white-space: nowrap;
		}
		/* 카드형: 행 → 카드, 셀 라벨은 data-label */
		.cards,
		.cards tbody,
		.cards tr,
		.cards td {
			display: block;
			width: 100%;
		}
		.cards thead {
			display: none;
		}
		.cards tr {
			padding: 12px 14px;
			border-bottom: 1px solid var(--color-line);
		}
		.cards tr:last-child {
			border-bottom: 0;
		}
		.cards tbody tr:hover td {
			background: transparent;
		}
		.cards td {
			border: 0;
			padding: 3px 0;
			display: flex;
			justify-content: space-between;
			gap: 12px;
			text-align: right;
		}
		.cards td::before {
			content: attr(data-label);
			color: var(--color-subtle);
			font-size: var(--text-xs);
			text-align: left;
			flex: none;
			padding-top: 2px;
		}
		.cards td.title-cell {
			font-size: var(--text-md);
			padding-bottom: 6px;
			text-align: left;
		}
		.cards td.title-cell::before {
			display: none;
		}
		.cards tr.state-row td::before {
			display: none;
		}
		.cards td.hide-m {
			display: none;
		}
	}
</style>
