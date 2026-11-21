<script lang="ts">
	import { toast } from './toast.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
	{#each toast.items as t (t.id)}
		<div class="toast {t.tone}">
			{#if t.tone === 'ok'}<span aria-hidden="true">✓</span>{:else if t.tone === 'err'}<span
					aria-hidden="true">✕</span
				>{/if}
			<span class="msg">{t.message}</span>
			{#if t.action}
				<button
					type="button"
					class="act"
					onclick={() => {
						t.action?.onclick();
						toast.dismiss(t.id);
					}}>{t.action.label}</button
				>
			{/if}
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: 24px;
		z-index: 80;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(420px, calc(100vw - 32px));
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-radius: var(--radius-md);
		background: var(--color-text);
		color: var(--color-canvas);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.msg {
		flex: 1;
		min-width: 0;
	}
	.act {
		border: 0;
		background: transparent;
		color: inherit;
		font-weight: 700;
		text-decoration: underline;
		min-height: 32px;
	}
	@media (max-width: 639px) {
		/* 하단 탭(52px + safe-area) 위 */
		.toasts {
			bottom: calc(var(--size-tabbar) + var(--safe-bottom) + 20px);
		}
	}
</style>
