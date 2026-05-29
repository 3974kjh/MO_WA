<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { AssetCategory } from '$lib/components/datagrid/types';
	import { presetSubcategories } from '$lib/types/asset';

	let {
		category = $bindable('real_estate' as AssetCategory),
		subcategory = $bindable(''),
		customCategories = [] as string[]
	}: {
		category?: AssetCategory;
		subcategory?: string;
		customCategories?: string[];
	} = $props();

	const presetOptions = $derived(
		[...new Set([...(presetSubcategories[category] ?? []), ...customCategories])].map((name) => ({
			label: name,
			value: name
		}))
	);

	let useCustom = $state(false);

	$effect(() => {
		if (!subcategory && presetOptions.length > 0 && !useCustom) {
			subcategory = presetOptions[0].value;
		}
	});
</script>

<div class="grid gap-md md:grid-cols-2">
	<Select
		id="category"
		label="자산 유형"
		options={[
			{ label: '부동산', value: 'real_estate' },
			{ label: '투자', value: 'investment' },
			{ label: '현금성', value: 'cash' },
			{ label: '부채', value: 'liability' }
		]}
		bind:value={category}
	/>

	{#if useCustom}
		<Input id="subcategory" label="하위 카테고리" bind:value={subcategory} required />
	{:else}
		<Select
			id="subcategory"
			label="하위 카테고리"
			options={presetOptions}
			bind:value={subcategory}
		/>
	{/if}
</div>

<button
	type="button"
	class="text-[14px] leading-[1.43] tracking-[-0.224px] text-primary"
	onclick={() => (useCustom = !useCustom)}
>
	{useCustom ? '프리셋에서 선택' : '직접 입력'}
</button>
