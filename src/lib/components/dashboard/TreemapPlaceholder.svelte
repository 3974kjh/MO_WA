<script lang="ts">
	type TreemapItem = {
		label: string;
		value: string;
		areaClass: string;
		tone: 'light' | 'dark';
	};

	let {
		items = [
			{ label: '부동산', value: '58%', areaClass: 'col-span-7 row-span-2', tone: 'dark' },
			{ label: '투자', value: '24%', areaClass: 'col-span-5', tone: 'light' },
			{ label: '현금성', value: '12%', areaClass: 'col-span-3', tone: 'light' },
			{ label: '부채', value: '6%', areaClass: 'col-span-2', tone: 'dark' }
		] satisfies TreemapItem[]
	}: {
		items?: TreemapItem[];
	} = $props();
</script>

<div class="grid min-h-[360px] grid-cols-12 grid-rows-2 gap-xs rounded-lg bg-canvas-parchment p-xs">
	{#each items as item (item.label)}
		<div
			class="grid place-items-start rounded-md p-lg {item.areaClass} {item.tone === 'dark'
				? 'bg-surface-tile-1 text-on-dark'
				: 'bg-canvas text-ink'}"
		>
			<div class="grid gap-xxs">
				<p class="font-display text-[28px] leading-[1.14] font-normal tracking-[0.196px]">
					{item.value}
				</p>
				<p class="text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] opacity-75">
					{item.label}
				</p>
			</div>
		</div>
	{/each}
</div>
