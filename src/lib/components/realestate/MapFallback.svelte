<script lang="ts" module>
	export type FallbackReason =
		| 'nokey'
		| 'auth-failed'
		| 'load-failed'
		| 'timeout'
		| 'offline'
		| 'error';

	/** 화면 문구(코드·키 이름 없음). 시안 v1.7.8 realestate-map 문구를 따른다. 재시도는 키 없음만 빼고 모두(인증 실패는 페이지를 한 번 다시 불러와 SDK를 새로 받는다). */
	export const FALLBACK_COPY: Record<
		FallbackReason,
		{ title: string; desc: string; retry: boolean; why?: string }
	> = {
		nokey: {
			title: '지도가 아직 연결되지 않았어요',
			desc: '지도 연결 설정이 끝나면 이 자리에 지도가 나타나요. 지금은 단지 목록과 ‘네이버 지도에서 보기’ 링크로 위치를 볼 수 있어요.',
			retry: false
		},
		'auth-failed': {
			title: '지도를 불러오지 못했어요',
			desc: '지도 사용 허용 설정에 문제가 있는 것 같아요. 설정을 확인한 뒤 다시 시도해 주세요. 단지 목록과 위치 링크는 그대로 쓸 수 있어요.',
			retry: true,
			why: '이 사이트 주소가 지도 서비스의 허용 목록에 없거나, 지도 연결 정보가 맞지 않을 때 생겨요. 등록 방법은 설정 안내 문서에 있어요.'
		},
		'load-failed': {
			title: '지도를 불러오지 못했어요',
			desc: '인터넷 연결이나 지도 서비스 상태 때문에 열리지 않았어요. 잠시 뒤 다시 시도해 주세요. 목록은 그대로 볼 수 있어요.',
			retry: true
		},
		timeout: {
			title: '지도를 불러오지 못했어요',
			desc: '인터넷 연결이나 지도 서비스 상태 때문에 8초 안에 열리지 않았어요. 잠시 뒤 다시 시도해 주세요. 목록은 그대로 볼 수 있어요.',
			retry: true
		},
		offline: {
			title: '인터넷에 연결되어 있지 않아요',
			desc: '연결되면 다시 시도해 주세요. 목록은 그대로 볼 수 있어요.',
			retry: true
		},
		error: {
			title: '지도를 불러오지 못했어요',
			desc: '지도를 그리는 중에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요. 목록은 그대로 볼 수 있어요.',
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

	let {
		reason,
		onretry,
		inline = false
	}: { reason: FallbackReason; onretry?: () => void; inline?: boolean } = $props();
	let copy = $derived(FALLBACK_COPY[reason]);
</script>

<div
	class="fb"
	class:inline
	data-testid="map-fallback"
	data-reason={reason}
	role={reason === 'auth-failed' ? 'alert' : 'status'}
>
	<div class="ico" aria-hidden="true"><Icon icon={MapPinOff} size={24} /></div>
	<p class="t">{copy.title}</p>
	<p class="d">{copy.desc}</p>
	{#if copy.retry && onretry}
		<button type="button" class="btn preset-filled-brand" onclick={onretry}
			><Icon icon={RefreshCw} />다시 시도하기</button
		>
	{/if}
	{#if copy.why}
		<details>
			<summary>왜 이런 일이 생기나요?</summary>
			<p>{copy.why}</p>
		</details>
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
	.fb.inline {
		position: static;
		background: transparent;
		padding: 24px 20px;
	}
	details {
		max-width: 26rem;
		text-align: left;
		font-size: var(--text-sm);
	}
	summary {
		cursor: pointer;
		color: var(--color-accent);
		font-weight: 600;
		min-height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	details p {
		line-height: 1.3rem;
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
