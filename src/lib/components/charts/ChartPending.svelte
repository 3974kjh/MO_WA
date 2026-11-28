<script lang="ts">
	/**
	 * 선·막대 차트 청크가 오기 전 자리. 높이만 잡아 밀림을 막고, 연한 면으로 ‘자리’임을 드러낸다.
	 * 스피너·문구·애니메이션 없음. 차트와 같이 <480에서 190.
	 * 도넛은 DonutPending(범례는 즉시)을 쓴다.
	 */
	import ChartFailBody from './ChartFailBody.svelte';

	/** failed: 청크 로드 실패. 같은 자리 안에서 안내와 새로고침 버튼을 보인다(aria-busy 해제). */
	let {
		height,
		failed = false,
		onretry
	}: { height: 180 | 200 | 260; failed?: boolean; onretry?: () => void } = $props();
</script>

<!-- 차트(.line-chart 등)와 같은 컨테이너 폭 규칙: 뷰포트가 아니라 이 칸의 폭으로 <480에서 190 -->
<div class="chart-slot">
	<div
		class="chart-pending"
		data-h={height}
		data-failed={failed ? '' : undefined}
		aria-busy={failed ? undefined : 'true'}
	>
		{#if failed}<ChartFailBody {onretry} />{/if}
	</div>
</div>

<style>
	.chart-slot {
		container-type: inline-size;
		width: 100%;
	}
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
	/* Line/Bar 로드 높이와 맞춤(칸 폭 <480은 항상 190) — 인라인 min-height는 쓰지 않음 */
	@container (max-width: 479.98px) {
		.chart-pending[data-h='200'],
		.chart-pending[data-h='260'] {
			min-height: 190px;
		}
	}
	.chart-pending[data-failed] {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
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
