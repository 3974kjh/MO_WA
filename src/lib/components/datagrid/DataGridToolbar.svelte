<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	let {
		query = $bindable(''),
		onAdd,
		total = 0
	}: {
		query?: string;
		onAdd?: () => void;
		total?: number;
	} = $props();
</script>

<div
	class="flex flex-col gap-sm border-b border-hairline p-lg md:flex-row md:items-center md:justify-between"
>
	<div class="grid gap-xxs">
		<p class="text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] text-ink">
			Asset DataGrid
		</p>
		<p class="text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48">{total}개 항목</p>
	</div>
	<div class="flex flex-col gap-sm sm:flex-row sm:items-center">
		<label class="sr-only" for="asset-search">자산 검색</label>
		<input
			id="asset-search"
			class="min-h-11 rounded-pill border border-hairline bg-canvas px-[20px] py-sm text-[17px] leading-[1.47] tracking-[-0.374px] text-ink placeholder:text-ink-muted-48"
			bind:value={query}
			placeholder="자산, 기관, 카테고리 검색"
		/>
		<Button label="자산 추가" onclick={onAdd} />
	</div>
</div>
