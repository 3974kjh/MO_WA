<script lang="ts">
	/**
	 * 차트 값 읽기 (FE-14, DS §7-4): <480은 탭하면 차트 아래 값 카드, ≥480은 마우스를 올리면 작은 툴팁.
	 * 같은 내용은 숨김 데이터 표(sr-only)에도 있으므로 화면 낭독기는 이 요소를 읽지 않아도 된다.
	 */
	export interface ReadoutRow {
		name: string;
		value: string;
		color?: string;
	}

	let {
		title,
		rows,
		mode,
		left = 0,
		onclose
	}: {
		title: string;
		rows: ReadoutRow[];
		mode: 'card' | 'tooltip';
		/** tooltip일 때 기준 X(px, 차트 왼쪽부터) */
		left?: number;
		onclose?: () => void;
	} = $props();
</script>

{#if mode === 'card'}
	<div class="readout card" role="status" aria-live="polite">
		<div class="head">
			<b>{title}</b>
			{#if onclose}
				<button type="button" class="close" aria-label="값 카드 닫기" onclick={onclose}>✕</button>
			{/if}
		</div>
		{#each rows as r, ri (ri)}
			<div class="row">
				<span class="name"
					>{#if r.color}<i style:background={r.color} aria-hidden="true"></i>{/if}{r.name}</span
				>
				<span class="num val">{r.value}</span>
			</div>
		{/each}
	</div>
{:else}
	<div class="readout tooltip" style:left="{left}px" aria-hidden="true">
		<b>{title}</b>
		{#each rows as r, ri (ri)}
			<div class="row">
				<span class="name"
					>{#if r.color}<i style:background={r.color}></i>{/if}{r.name}</span
				>
				<span class="num val">{r.value}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.readout {
		font-size: var(--text-sm);
		color: var(--color-text);
	}
	.card {
		margin-top: 8px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--color-surface-2);
	}
	.tooltip {
		position: absolute;
		top: 4px;
		transform: translateX(-50%);
		pointer-events: none;
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		box-shadow: var(--shadow-pop);
		border: 1px solid var(--color-line);
		white-space: nowrap;
		z-index: 2;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.close {
		min-width: var(--size-touch);
		min-height: var(--size-touch);
		color: var(--color-muted);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding-top: 2px;
	}
	.name i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 6px;
	}
	.val {
		font-weight: 600;
	}
</style>
