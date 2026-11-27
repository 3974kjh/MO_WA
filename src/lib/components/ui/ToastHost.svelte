<script lang="ts">
	/**
	 * 토스트 자리 (앱에 하나). Skeleton 토스트(ToastGroup.svelte, Zag 포함 ~17KiB gzip)는 첫 페인트·로그인 경로에 싣지 않고
	 * 브라우저가 한가할 때 미리 불러 둔다. 그 전에 토스트가 생기면 곧바로 불러 같은 항목을 그린다(항목은 toast.svelte.ts에 남아 있음).
	 * 청크 로드가 실패하면(오프라인·배포 직후 해시 불일치) 한 번 다시 시도하고, 그래도 안 되면 간단한 대체 토스트를 그린다
	 * — '되돌리기' 같은 동작 버튼이 있는 토스트가 아예 안 뜨는 일은 없어야 한다.
	 */
	import { onMount, type Component } from 'svelte';
	import { toast } from './toast.svelte';

	let {
		loader = () => import('./ToastGroup.svelte'),
		retryDelayMs = 800
	}: {
		/** 테스트용: 토스트 묶음 로더 */
		loader?: () => Promise<{ default: Component }>;
		retryDelayMs?: number;
	} = $props();

	let Group = $state<Component | null>(null);
	let failed = $state(false);
	let loading = false;
	let tried = false;

	function load() {
		if (loading || Group) return;
		loading = true;
		tried = true;
		attempt(1);
	}

	function attempt(left: number) {
		loader().then(
			(m) => {
				Group = m.default;
				failed = false;
			},
			() => {
				if (left > 0) setTimeout(() => attempt(left - 1), retryDelayMs);
				else {
					// 대체 토스트로 버티고, 다음 토스트가 생기면 다시 시도한다
					failed = true;
					loading = false;
				}
			}
		);
	}

	onMount(() => {
		const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
		// 한가할 때 미리 불러오기는 한 번만. 실패한 뒤의 재시도는 토스트가 생길 때(아래 $effect)만 한다
		idle(() => {
			if (!tried) load();
		});
	});

	$effect(() => {
		if (toast.items.length > 0) load();
	});
</script>

{#if Group}<Group />{:else if failed && toast.items.length > 0}
	<div class="fallback" role="status" aria-live="polite" data-testid="toast-fallback">
		{#each toast.items as item (item.id)}
			<div class="item" data-tone={item.tone}>
				<span class="msg">{item.message}</span>
				{#if item.action}
					<button
						type="button"
						class="act"
						onclick={() => {
							item.action?.onclick();
							toast.dismiss(item.id);
						}}>{item.action.label}</button
					>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	/* 대체 토스트: ToastGroup 의 모양(어두운 알약·12px 안쪽 여백)만 따라 한다. 위치는 같은 --mw-toast-bottom */
	.fallback {
		position: fixed;
		left: 0;
		right: 0;
		bottom: var(--mw-toast-bottom, 24px);
		z-index: 80;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		pointer-events: none;
	}
	.item {
		pointer-events: auto;
		width: min(420px, calc(100vw - 32px));
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-radius: var(--radius-md);
		background: var(--color-text);
		color: var(--color-canvas);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
		line-height: var(--text-sm--line-height);
		font-weight: 600;
	}
	.msg {
		flex: 1;
		min-width: 0;
	}
	.act {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: var(--size-touch);
		margin-block: -8px;
		padding: 0 4px;
		border: 0;
		background: transparent;
		color: inherit;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
