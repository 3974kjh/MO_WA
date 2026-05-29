<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	let {
		title = '자산 데이터가 없습니다',
		description = '첫 자산을 추가하면 대시보드 요약과 차트가 채워집니다.',
		onAdd
	}: {
		title?: string;
		description?: string;
		onAdd?: () => void;
	} = $props();
</script>

<div
	class="grid min-h-[240px] place-items-center rounded-lg border border-dashed border-hairline bg-canvas p-xl text-center"
>
	<div class="grid max-w-[360px] gap-sm">
		<h3 class="font-display text-[24px] leading-[1.19] font-semibold tracking-[-0.231px] text-ink">
			{title}
		</h3>
		<p class="text-[17px] leading-[1.47] tracking-[-0.374px] text-ink-muted-48">{description}</p>
		{#if onAdd}
			<div class="mt-xs">
				<Button label="첫 자산 추가" onclick={onAdd} />
			</div>
		{/if}
	</div>
</div>
