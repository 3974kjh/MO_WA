<script lang="ts">
	type IconName =
		| 'dashboard'
		| 'income'
		| 'expense'
		| 'projection'
		| 'asset'
		| 'liability'
		| 'target'
		| 'chart'
		| 'logout'
		| 'eye'
		| 'eye-off';

	let {
		name,
		size = 24
	}: {
		name: IconName;
		size?: number;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'dashboard'}
		<path d="M4 5h7v6H4z" />
		<path d="M13 5h7v14h-7z" />
		<path d="M4 13h7v6H4z" />
	{:else if name === 'income'}
		<path d="M12 4v14" />
		<path d="m7 9 5-5 5 5" />
		<path d="M5 20h14" />
	{:else if name === 'expense'}
		<path d="M12 20V6" />
		<path d="m7 15 5 5 5-5" />
		<path d="M5 4h14" />
	{:else if name === 'projection'}
		<path d="M4 18c4-8 8-8 16-12" />
		<path d="M15 6h5v5" />
		<path d="M4 20h16" />
	{:else if name === 'asset'}
		<path d="M4 10 12 4l8 6" />
		<path d="M6 10v9h12v-9" />
		<path d="M10 19v-5h4v5" />
	{:else if name === 'liability'}
		<path d="M5 7h14" />
		<path d="M7 7v12" />
		<path d="M17 7v12" />
		<path d="M4 19h16" />
		<path d="M9 11h6" />
	{:else if name === 'target'}
		<circle cx="12" cy="12" r="8" />
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v4" />
		<path d="M22 12h-4" />
	{:else if name === 'logout'}
		<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
		<path d="M16 17l5-5-5-5" />
		<path d="M21 12H9" />
	{:else if name === 'eye'}
		<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
		<circle cx="12" cy="12" r="3" />
	{:else if name === 'eye-off'}
		<path d="M3 3l18 18" />
		<path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42" />
		<path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a18.45 18.45 0 0 1-2.16 3.19" />
		<path d="M6.61 6.61A18.48 18.48 0 0 0 2 12s3.5 7 10 7a10.66 10.66 0 0 0 5.39-1.43" />
	{:else}
		<path d="M4 19V5" />
		<path d="M4 19h16" />
		<path d="m7 15 4-5 3 3 5-7" />
	{/if}
</svg>
