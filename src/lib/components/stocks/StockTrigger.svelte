<script lang="ts">
	/** 감시 가격까지(G-8): 게이지 + 거리 + 3% 이내/도달 배지. 감시 가격이 없으면 fallback 문구. */
	import Badge from '$lib/components/ui/Badge.svelte';
	import TriggerGauge from '$lib/components/dashboard/TriggerGauge.svelte';
	import { distanceLabel, type TriggerState } from '$lib/dashboard/trigger';

	let { t, none = '감시 가격 없음' }: { t: TriggerState; none?: string } = $props();
</script>

{#if 'distance' in t}
	<span class="trg">
		<TriggerGauge distance={t.distance} />
		<b class="num">{distanceLabel(t.distance)}</b>
	</span>
	{#if t.state === 'warn'}<Badge tone="warn" icon="⚠">3% 이내</Badge>
	{:else if t.state === 'hit'}<Badge tone="accent" icon="✓">도달</Badge>{/if}
{:else if t.state === 'unpriced'}<Badge>현재가 없음</Badge>
{:else}<span class="subtle">{none}</span>{/if}

<style>
	.trg {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 130px;
		margin-bottom: 4px;
	}
	.trg > :global(.gauge) {
		flex: 1;
	}
	.subtle {
		color: var(--color-subtle);
		font-size: var(--text-xs);
	}
</style>
