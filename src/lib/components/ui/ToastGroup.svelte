<script lang="ts">
	/**
	 * Skeleton 토스트 묶음 (DS §7-0: `createToaster()` + 루트 `<Toast.Group>` 하나). ToastHost가 지연 로드한다.
	 * toast.svelte.ts의 `toast.items`를 그대로 비춘다: 새 항목은 create, 빠진 항목은 dismiss. Zag 자체 타이머는 끈다(duration ∞).
	 * 위치: app.css `--mw-toast-bottom` (기본 24px · 모바일 하단 탭 위 · 모바일 바닥 시트가 열려 있으면 시트 최대 높이 위, Nit-1).
	 */
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { toast, type ToastTone } from './toast.svelte';

	const TYPE: Record<ToastTone, 'info' | 'success' | 'error'> = {
		default: 'info',
		ok: 'success',
		err: 'error'
	};

	const toaster = createToaster({
		placement: 'bottom',
		gap: 8,
		max: 5,
		offsets: { top: '16px', left: '16px', right: '16px', bottom: 'var(--mw-toast-bottom, 24px)' }
	});

	/** 이미 Zag에 넘긴 id (반응형일 필요 없는 장부) */
	const shown: Record<string, true> = {};
	$effect(() => {
		const live = toast.items.map((item) => String(item.id));
		for (const item of toast.items) {
			const id = String(item.id);
			if (shown[id]) continue;
			shown[id] = true;
			toaster.create({ id, description: item.message, type: TYPE[item.tone], duration: Infinity });
		}
		for (const id of Object.keys(shown)) {
			if (live.includes(id)) continue;
			delete shown[id];
			toaster.dismiss(id);
		}
	});

	const itemOf = (id: string | undefined) => toast.items.find((t) => String(t.id) === id);
</script>

<Toast.Group {toaster} class="mw-toasts">
	{#snippet children(t)}
		{@const item = itemOf(t.id)}
		<Toast toast={t} class="mw-toast">
			{#if t.type === 'success'}<CircleCheck size={18} strokeWidth={1.8} aria-hidden="true" />
			{:else if t.type === 'error'}<CircleAlert
					size={18}
					strokeWidth={1.8}
					aria-hidden="true"
				/>{/if}
			<Toast.Message>
				<Toast.Description>{t.description}</Toast.Description>
			</Toast.Message>
			{#if item?.action}
				<button
					type="button"
					class="act"
					onclick={() => {
						item.action?.onclick();
						toast.dismiss(item.id);
					}}>{item.action.label}</button
				>
			{/if}
		</Toast>
	{/snippet}
</Toast.Group>

<style>
	/* Zag가 left·right 16px를 인라인으로 준다 → 너비 고정 + margin auto로 가운데 */
	:global(.mw-toasts[data-part='group']) {
		width: min(420px, calc(100vw - 32px));
		margin-inline: auto;
	}
	:global(.mw-toast[data-part='root']) {
		width: 100%;
		max-width: none;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border: 0;
		border-radius: var(--radius-md);
		background: var(--color-text);
		color: var(--color-canvas);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
		line-height: var(--text-sm--line-height);
		font-weight: 600;
	}
	:global(.mw-toast[data-part='root'] > svg) {
		flex: none;
	}
	:global(.mw-toast [data-part='message']) {
		flex: 1;
		min-width: 0;
	}
	:global(.mw-toast [data-part='description']) {
		font-size: inherit;
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
