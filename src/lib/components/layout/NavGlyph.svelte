<script lang="ts">
	/** lucide 아이콘 한 세트(선 1.8) — H §7 "아이콘 통일" */
	import Archive from '@lucide/svelte/icons/archive';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import FileText from '@lucide/svelte/icons/file-text';
	import House from '@lucide/svelte/icons/house';
	import Notebook from '@lucide/svelte/icons/notebook';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import type { NavIcon } from './nav';

	let { icon, size = 20 }: { icon: NavIcon; size?: number } = $props();

	const MAP = {
		house: House,
		'file-text': FileText,
		'chart-pie': ChartPie,
		notebook: Notebook,
		'chart-line': ChartLine,
		search: Search,
		building: Building2,
		shield: ShieldCheck,
		archive: Archive,
		settings: Settings
	} as const;
	let Cmp = $derived(MAP[icon]);
</script>

<Cmp {size} strokeWidth={1.8} aria-hidden="true" />
