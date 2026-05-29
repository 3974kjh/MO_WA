<script lang="ts">
	type SelectOption = {
		label: string;
		value: string;
	};

	let {
		id,
		label,
		value = $bindable(''),
		options = [],
		disabled = false
	}: {
		id: string;
		label: string;
		value?: string;
		options?: SelectOption[];
		disabled?: boolean;
	} = $props();
</script>

<label class="grid gap-xxs" for={id}>
	<span class="font-text text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] text-ink">
		{label}
	</span>
	<div class="relative">
		<select
			class="field-control--select min-h-11 w-full appearance-none rounded-pill border border-hairline bg-canvas py-sm font-text text-[17px] leading-[1.47] tracking-[-0.374px] text-ink disabled:bg-canvas-parchment"
			{id}
			name={id}
			bind:value
			{disabled}
		>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<span class="field-trailing-icon" aria-hidden="true">
			<svg width="10" height="5" viewBox="0 0 10 5" fill="none">
				<path d="M1 4 5 1l4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
			<svg width="10" height="5" viewBox="0 0 10 5" fill="none">
				<path d="m1 1 4 3 4-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</span>
	</div>
</label>
