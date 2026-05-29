<script lang="ts">
	let {
		id,
		label,
		value = $bindable(''),
		type = 'text',
		placeholder,
		disabled = false,
		required = false
	}: {
		id: string;
		label: string;
		value?: string;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
	} = $props();
</script>

<label class="grid gap-xxs" for={id}>
	<span class="font-text text-[14px] leading-[1.29] font-semibold tracking-[-0.224px] text-ink">
		{label}
	</span>
	<input
		class="field-control--plain min-h-11 w-full rounded-pill border border-hairline bg-canvas py-sm font-text text-[17px] leading-[1.47] tracking-[-0.374px] text-ink placeholder:text-ink-muted-48 disabled:bg-canvas-parchment"
		{id}
		name={id}
		bind:value
		{type}
		{placeholder}
		{disabled}
		{required}
	/>
</label>
