<script lang="ts">
	/** 확인 대기 건수 pill (DS §8: aria-label="확인 대기 N건"). 0이면 렌더하지 않는다. */
	let {
		count,
		label = `확인 대기 ${count}건`,
		class: className = ''
	}: { count: number; label?: string; class?: string } = $props();
</script>

{#if count > 0}
	<span class="pill num {className}" role="status" aria-label={label}
		>{count > 99 ? '99+' : count}</span
	>
{/if}

<style>
	.pill {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--radius-full);
		background: var(--color-warn-fill);
		color: var(--color-on-warn);
		font-size: 11px;
		font-weight: 800;
		line-height: 1;
	}
</style>
