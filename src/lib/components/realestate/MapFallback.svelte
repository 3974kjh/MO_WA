<script lang="ts" module>
	export type FallbackReason =
		| 'nokey'
		| 'auth-failed'
		| 'load-failed'
		| 'timeout'
		| 'offline'
		| 'error';

	/** 화면 문구(코드·키 이름 없음, PLAN §3-5). 재시도는 인증·키 문제가 아닐 때만. */
	export const FALLBACK_COPY: Record<
		FallbackReason,
		{ title: string; desc: string; retry: boolean }
	> = {
		nokey: {
			title: '지도는 아직 준비 중이에요',
			desc: '지도 연결이 끝나면 여기에 단지 위치가 보여요. 지금은 목록에서 단지를 고르고 ‘네이버 지도에서 보기’로 위치를 확인할 수 있어요.',
			retry: false
		},
		'auth-failed': {
			title: '지도를 불러오지 못했어요',
			desc: '지도 사용 허용 설정을 확인해 주세요. 목록에서 단지를 고르면 ‘네이버 지도에서 보기’로 위치를 확인할 수 있어요.',
			retry: false
		},
		'load-failed': {
			title: '지도를 불러오지 못했어요',
			desc: '잠시 후 다시 시도해 주세요. 목록과 ‘네이버 지도에서 보기’는 그대로 쓸 수 있어요.',
			retry: true
		},
		timeout: {
			title: '지도가 늦게 열리고 있어요',
			desc: '연결이 느리거나 막혀 있을 수 있어요. 다시 시도하거나 목록에서 단지를 확인해 주세요.',
			retry: true
		},
		offline: {
			title: '인터넷에 연결되어 있지 않아요',
			desc: '연결되면 다시 시도해 주세요. 목록은 그대로 볼 수 있어요.',
			retry: true
		},
		error: {
			title: '지도를 그리지 못했어요',
			desc: '잠시 후 다시 시도해 주세요. 목록과 ‘네이버 지도에서 보기’는 그대로 쓸 수 있어요.',
			retry: true
		}
	};
</script>

<script lang="ts">
	/**
	 * 지도 대신 보이는 자리(키 없음·인증 실패·로드 실패·시간 초과·오프라인·렌더 오류).
	 * 라우트 동기 클로저에 두어 지도 청크가 안 와도 보인다. 빈 회색 지도 대신 이유와 다음 행동을 말한다.
	 */
	import MapPinOff from '@lucide/svelte/icons/map-pin-off';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { reason, onretry }: { reason: FallbackReason; onretry?: () => void } = $props();
	let copy = $derived(FALLBACK_COPY[reason]);
</script>

<div class="fb" data-testid="map-fallback" data-reason={reason} role="status">
	<div class="ico" aria-hidden="true"><Icon icon={MapPinOff} size={24} /></div>
	<p class="t">{copy.title}</p>
	<p class="d">{copy.desc}</p>
	{#if copy.retry && onretry}
		<button type="button" class="btn preset-filled-brand" onclick={onretry}
			><Icon icon={RefreshCw} />다시 시도하기</button
		>
	{/if}
</div>

<style>
	.fb {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px;
		text-align: center;
		background: var(--color-surface-2);
		color: var(--color-muted);
	}
	.ico {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--color-surface);
		color: var(--color-subtle);
	}
	.t {
		color: var(--color-text);
		font-weight: 600;
		font-size: var(--text-md);
	}
	.d {
		max-width: 36ch;
		font-size: var(--text-sm);
	}
	.btn {
		min-height: 44px;
		margin-top: 4px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
