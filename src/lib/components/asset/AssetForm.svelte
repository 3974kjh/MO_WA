<script lang="ts">
	import AssetCategorySelector from '$lib/components/asset/AssetCategorySelector.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { AssetCategory, AssetGridRow } from '$lib/components/datagrid/types';
	import { assetCurrencyOptions } from '$lib/types/asset';

	let {
		asset = null,
		customCategories = [] as string[]
	}: {
		asset?: AssetGridRow | null;
		customCategories?: string[];
	} = $props();

	let category = $state<AssetCategory>('real_estate');
	let subcategory = $state('');

	$effect(() => {
		category = asset?.category ?? 'real_estate';
		subcategory = asset?.subcategory ?? '';
	});
</script>

{#if asset}
	<input type="hidden" name="id" value={asset.id} />
{/if}

<input type="hidden" name="category" value={category} />
<input type="hidden" name="subcategory" value={subcategory} />

<div class="grid gap-md">
	<AssetCategorySelector bind:category bind:subcategory {customCategories} />

	<div class="grid gap-md md:grid-cols-2">
		<Input id="name" label="자산명" value={asset?.name ?? ''} required />
		<Input id="institution" label="기관" value={asset?.institution ?? ''} />
		<Input
			id="principalAmount"
			label="원금"
			type="number"
			value={String(asset?.principalAmount ?? 0)}
			required
		/>
		<Input
			id="currentValue"
			label="현재가치"
			type="number"
			value={String(asset?.currentValue ?? 0)}
			required
		/>
		<Select
			id="currency"
			label="통화"
			options={assetCurrencyOptions}
			value={asset?.currency ?? 'KRW'}
		/>
		<Input
			id="valuationDate"
			label="평가일"
			type="date"
			value={asset?.valuationDate ?? new Date().toISOString().slice(0, 10)}
			required
		/>
		<Input
			id="annualRate"
			label="수익률(%)"
			type="number"
			value={String(asset?.annualRate ?? '')}
		/>
		<Input id="maturityDate" label="만기일" type="date" value={asset?.maturityDate ?? ''} />
		<Input
			id="monthlyContribution"
			label="월 납입액"
			type="number"
			value={String(asset?.monthlyContribution ?? '')}
		/>
		<Input
			id="contributionEndDate"
			label="납입 종료일"
			type="date"
			value={asset?.contributionEndDate ?? ''}
		/>
		<Input id="tags" label="태그 (쉼표 구분)" value={(asset?.tags ?? []).join(', ')} />
		<Input id="memo" label="메모" value={asset?.memo ?? ''} />
	</div>
</div>
