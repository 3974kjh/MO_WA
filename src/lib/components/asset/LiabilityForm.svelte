<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { AssetGridRow } from '$lib/components/datagrid/types';
	import type { LiabilityGridRow } from '$lib/types/liability';
	import { presetSubcategories } from '$lib/types/asset';

	let {
		liability = null,
		assets = [] as AssetGridRow[]
	}: {
		liability?: LiabilityGridRow | null;
		assets?: AssetGridRow[];
	} = $props();

	const assetOptions = $derived([
		{ label: '연결 자산 없음', value: '' },
		...assets
			.filter((row) => row.category !== 'liability')
			.map((row) => ({ label: row.name, value: row.id }))
	]);
</script>

{#if liability}
	<input type="hidden" name="id" value={liability.id} />
{/if}

<div class="grid gap-md md:grid-cols-2">
	<Input id="name" label="부채명" value={liability?.name ?? ''} required />
	<Select
		id="liabilityType"
		label="부채 유형"
		options={presetSubcategories.liability.map((name) => ({ label: name, value: name }))}
		value={liability?.liabilityType ?? presetSubcategories.liability[0]}
	/>
	<Select id="assetId" label="연결 자산" options={assetOptions} value={liability?.assetId ?? ''} />
	<Input
		id="principalAmount"
		label="원금"
		type="number"
		value={String(liability?.principalAmount ?? 0)}
		required
	/>
	<Input
		id="remainingAmount"
		label="잔액"
		type="number"
		value={String(liability?.remainingAmount ?? 0)}
		required
	/>
	<Input
		id="interestRate"
		label="금리(%)"
		type="number"
		value={String(liability?.interestRate ?? '')}
	/>
	<Input id="startedAt" label="시작일" type="date" value={liability?.startedAt ?? ''} />
	<Input id="dueAt" label="만기일" type="date" value={liability?.dueAt ?? ''} required />
	<Input id="memo" label="메모" value={liability?.memo ?? ''} />
</div>
