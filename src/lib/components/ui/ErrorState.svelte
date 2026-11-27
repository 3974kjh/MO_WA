<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Icon from './Icon.svelte';

	let {
		title = '데이터를 불러오지 못했어요',
		desc,
		onretry,
		retryLabel = '다시 시도하기'
	}: { title?: string; desc?: string; onretry?: () => void; retryLabel?: string } = $props();
</script>

<div class="state" role="alert">
	<div class="ico" aria-hidden="true"><Icon icon={CircleAlert} size={24} /></div>
	<h4>{title}</h4>
	{#if desc}<p class="desc">{desc}</p>{/if}
	{#if onretry}<button type="button" class="btn-primary-m btn preset-filled-brand" onclick={onretry}
			><Icon icon={RefreshCw} />{retryLabel}</button
		>{/if}
</div>

<style>
	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		padding: 36px 20px;
		color: var(--color-muted);
	}
	.ico {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--color-up-soft);
		color: var(--color-up);
		display: grid;
		place-items: center;
		font-size: 20px;
		font-weight: 700;
	}
	h4 {
		color: var(--color-text);
		font-size: var(--text-lg);
	}
	.desc {
		font-size: var(--text-sm);
	}
	.btn {
		margin-top: 4px;
	}
</style>
