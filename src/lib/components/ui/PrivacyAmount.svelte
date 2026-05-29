<script lang="ts">
	let {
		value,
		hidden = false,
		currency = 'KRW',
		compact = false
	}: {
		value: number;
		hidden?: boolean;
		currency?: string;
		compact?: boolean;
	} = $props();

	const formatter = $derived(
		new Intl.NumberFormat('ko-KR', {
			style: 'currency',
			currency,
			maximumFractionDigits: currency === 'KRW' ? 0 : 2,
			notation: compact ? 'compact' : 'standard'
		})
	);

	const displayValue = $derived(hidden ? '••••••' : formatter.format(value));
</script>

<span class="font-display tracking-[-0.28px] tabular-nums">{displayValue}</span>
