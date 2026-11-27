<script lang="ts">
	/** 로딩 스켈레톤 (DS §7-10): 1.4초 시머, reduced-motion이면 정지 */
	let {
		lines = 3,
		height,
		label = '불러오는 중'
	}: { lines?: number; height?: string; label?: string } = $props();
</script>

<div class="skel-group" role="status" aria-label={label}>
	{#if height}
		<div class="skel" style:height></div>
	{:else}
		{#each Array.from({ length: lines }, (_, i) => i) as i (i)}
			<div class="skel" style:width={i === lines - 1 && lines > 1 ? '60%' : '100%'}></div>
		{/each}
	{/if}
</div>

<style>
	.skel-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.skel {
		background: linear-gradient(
			90deg,
			var(--color-surface-2),
			var(--color-surface-3),
			var(--color-surface-2)
		);
		background-size: 200% 100%;
		animation: sh 1.4s infinite linear;
		border-radius: var(--radius-sm);
		height: 14px;
	}
	@keyframes sh {
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skel {
			animation: none;
		}
	}
</style>
