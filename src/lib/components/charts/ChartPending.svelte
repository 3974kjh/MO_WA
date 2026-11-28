<script lang="ts">
	/**
	 * 선·막대 차트 청크가 오기 전 자리. 높이만 잡아 밀림을 막고, 연한 면으로 ‘자리’임을 드러낸다.
	 * 스피너·문구·애니메이션 없음. 차트와 같이 <480에서 190.
	 * 도넛은 DonutPending(범례는 즉시)을 쓴다.
	 */
	let { height }: { height: 180 | 200 | 260 } = $props();
</script>

<div class="chart-pending" data-h={height} aria-busy="true"></div>

<style>
	.chart-pending {
		background: var(--color-surface-2);
		border-radius: var(--radius-md);
	}
	.chart-pending[data-h='180'] {
		min-height: 180px;
	}
	.chart-pending[data-h='200'] {
		min-height: 200px;
	}
	.chart-pending[data-h='260'] {
		min-height: 260px;
	}
	/* Line/Bar 로드 높이와 맞춤(<480은 항상 190) — 인라인 min-height는 쓰지 않음 */
	@media (max-width: 479.98px) {
		.chart-pending[data-h='200'],
		.chart-pending[data-h='260'] {
			min-height: 190px;
		}
	}
	:global(:root[data-theme='dark']) .chart-pending {
		background: var(--color-surface-3);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light']):not([data-theme='dark'])) .chart-pending {
			background: var(--color-surface-3);
		}
	}
</style>
