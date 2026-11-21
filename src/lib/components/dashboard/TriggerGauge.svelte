<script lang="ts">
	/**
	 * 감시 가격 거리 게이지 (G-8, handoff §5 TriggerGauge). 선형 0~20% 트랙 — 원형 게이지는 쓰지 않는다.
	 * 트랙 왼쪽 끝 = 감시 가격, 0~3% 경고 구간, 도달이면 트랙 전체 강조 + 마커 없음.
	 * watch/unpriced는 호출부에서 렌더하지 않는다.
	 */
	import {
		distanceLabel,
		gaugePosition,
		TRIGGER_SCALE_PCT,
		TRIGGER_WARN_PCT
	} from '$lib/dashboard/trigger';

	let { distance }: { distance: number } = $props();

	let hit = $derived(distance <= 0);
	let label = $derived(distanceLabel(distance));
	let pos = $derived(gaugePosition(distance) * 100);
</script>

<div class="gauge" role="img" aria-label="감시 가격까지 {label}{hit ? ' (도달)' : ''}">
	<div class="track" class:hit>
		<i class="warn" style:width="{(TRIGGER_WARN_PCT / TRIGGER_SCALE_PCT) * 100}%"></i>
		{#if !hit}<b class="mark" style:left="{pos}%"></b>{/if}
	</div>
	<div class="scale" aria-hidden="true">
		<span>감시 가격</span><span>{TRIGGER_WARN_PCT}%</span><span>{TRIGGER_SCALE_PCT}%</span>
	</div>
</div>

<style>
	.gauge {
		min-width: 0;
	}
	.track {
		position: relative;
		height: 8px;
		border-radius: 4px;
		background: var(--color-surface-3);
	}
	.warn {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 4px 0 0 4px;
		background: var(--color-warn-fill);
	}
	.track.hit {
		background: var(--color-accent);
	}
	.track.hit .warn {
		display: none;
	}
	.mark {
		position: absolute;
		top: -4px;
		width: 4px;
		height: 16px;
		border-radius: 2px;
		background: var(--color-text);
		transform: translateX(-2px);
		box-shadow: 0 0 0 2px var(--color-surface);
	}
	.scale {
		display: flex;
		justify-content: space-between;
		margin-top: 3px;
		font-size: 10px;
		color: var(--color-subtle);
	}
</style>
