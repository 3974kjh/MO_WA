<script lang="ts">
	import type { DashboardPeriod } from '$lib/utils/assetCalculations';

	const periods: DashboardPeriod[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

	const periodLabels: Record<DashboardPeriod, string> = {
		'1M': '1개월',
		'3M': '3개월',
		'6M': '6개월',
		YTD: '올해',
		'1Y': '1년',
		ALL: '전체'
	};

	let {
		value = $bindable<DashboardPeriod>('ALL')
	}: {
		value?: DashboardPeriod;
	} = $props();

	const index = $derived(Math.max(0, periods.indexOf(value)));
	const fillPercent = $derived((index / (periods.length - 1)) * 100);

	function selectPeriod(next: DashboardPeriod) {
		value = next;
	}

	function handleInput(event: Event) {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		value = periods[next] ?? 'ALL';
	}
</script>

<div class="flex min-w-0 flex-1 flex-col gap-xxs">
	<div class="flex items-end justify-between gap-sm">
		<span class="text-[11px] leading-none tracking-[-0.11px] text-ink-muted-48">기간</span>
		<span
			class="font-display text-[15px] leading-none font-semibold tracking-[-0.15px] text-primary transition-all duration-500 ease-out"
			aria-live="polite"
		>
			{periodLabels[value]}
		</span>
	</div>

	<div class="relative pt-1 pb-0.5" role="group" aria-label="대시보드 기간 필터">
		<div class="relative h-1.5 w-full" aria-hidden="true">
			<div class="absolute inset-0 rounded-pill bg-hairline/50"></div>
			<div
				class="period-fill absolute inset-y-0 left-0 rounded-pill transition-[width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
				style={`width: ${fillPercent}%`}
			></div>
			<div
				class="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-primary-focus shadow-[0_1px_4px_rgb(0_0_0/0.18)] transition-[left] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
				style={`left: ${fillPercent}%`}
			></div>
			<div class="pointer-events-none absolute inset-0 flex justify-between px-px">
				{#each periods as _, tickIndex (tickIndex)}
					<span
						class="mt-[2px] h-1 w-px rounded-full transition-colors duration-500 {tickIndex <= index
							? 'bg-primary/50'
							: 'bg-hairline'}"
					></span>
				{/each}
			</div>
		</div>

		<input
			type="range"
			class="period-range absolute inset-x-0 top-0 h-4 w-full cursor-pointer appearance-none bg-transparent"
			min="0"
			max={periods.length - 1}
			step="1"
			value={index}
			aria-valuemin={0}
			aria-valuemax={periods.length - 1}
			aria-valuenow={index}
			aria-valuetext={periodLabels[value]}
			oninput={handleInput}
		/>
	</div>

	<div class="flex justify-between text-[10px] leading-none tracking-[-0.1px] text-ink-muted-48">
		{#each periods as item (item)}
			<button
				type="button"
				class="bg-transparent p-0 transition-colors duration-300 {value === item
					? 'font-semibold text-primary'
					: 'text-ink-muted-48 hover:text-ink-muted-80'}"
				aria-label={`${periodLabels[item]} 기간 선택`}
				aria-current={value === item ? 'true' : undefined}
				onclick={() => selectPeriod(item)}
			>
				{item}
			</button>
		{/each}
	</div>
</div>

<style>
	.period-fill {
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--color-primary) 88%, var(--color-canvas)),
			var(--color-primary-focus)
		);
	}

	.period-range::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 9999px;
		background: transparent;
		cursor: pointer;
	}

	.period-range::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 9999px;
		border: none;
		background: transparent;
		cursor: pointer;
	}
</style>
