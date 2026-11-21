<script lang="ts">
	/** 일지 행 배지 줄: 구분 · 종목 · 상태(점검 제외) · 봇 배지(봇이 쓴 행만, R-CLS-05). */
	import Badge from '$lib/components/ui/Badge.svelte';
	import {
		JOURNAL_KIND_ICON,
		JOURNAL_KIND_TONE,
		JOURNAL_STATE_LABEL,
		JOURNAL_STATE_TONE,
		itemTickers,
		kindLabel,
		type JournalItem
	} from '$lib/journal/view';

	let { item, state = true }: { item: JournalItem; state?: boolean } = $props();
</script>

<span class="badges">
	<Badge tone={JOURNAL_KIND_TONE[item.kind]} icon={JOURNAL_KIND_ICON[item.kind]}
		>{kindLabel(item.kind)}</Badge
	>
	{#each itemTickers(item) as t (t)}<span class="tk">{t}</span>{/each}
	{#if state && item.kind !== 'review'}
		<Badge tone={JOURNAL_STATE_TONE[item.state]}>{JOURNAL_STATE_LABEL[item.state]}</Badge>
	{/if}
	{#if item.bot}
		<span data-testid="bot-badge"
			><Badge tone="accent" icon="⚙" title="봇이 쓴 일지">{item.bot.name || '봇'}</Badge></span
		>
	{/if}
</span>

<style>
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.tk {
		display: inline-flex;
		align-items: center;
		height: 22px;
		padding: 0 8px;
		border: 1px solid var(--color-line-strong);
		border-radius: 999px;
		font-size: var(--text-xs, 12px);
		color: var(--color-muted);
	}
</style>
