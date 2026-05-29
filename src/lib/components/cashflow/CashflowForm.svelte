<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { CashflowGridItem } from '$lib/types/cashflow';

	let {
		cashflow = null
	}: {
		cashflow?: CashflowGridItem | null;
	} = $props();

	const directionOptions = [
		{ label: '고정 수입', value: 'income' },
		{ label: '고정 지출', value: 'expense' }
	];
	const cadenceOptions = [
		{ label: '월 단위', value: 'monthly' },
		{ label: '년 단위', value: 'yearly' }
	];
</script>

{#if cashflow}
	<input type="hidden" name="id" value={cashflow.id} />
{/if}

<div class="grid gap-md md:grid-cols-2">
	<Input id="name" label="항목명" value={cashflow?.name ?? ''} required />
	<Input id="amount" label="금액" type="number" value={String(cashflow?.amount ?? 0)} required />
	<Select
		id="direction"
		label="구분"
		options={directionOptions}
		value={cashflow?.direction ?? 'income'}
	/>
	<Select
		id="cadence"
		label="반복 주기"
		options={cadenceOptions}
		value={cashflow?.cadence ?? 'monthly'}
	/>
	<Input id="category" label="카테고리" value={cashflow?.category ?? ''} />
	<Input id="startDate" label="시작일" type="date" value={cashflow?.startDate ?? ''} />
	<Input id="endDate" label="종료일" type="date" value={cashflow?.endDate ?? ''} />
	<Input id="memo" label="메모" value={cashflow?.memo ?? ''} />
</div>
