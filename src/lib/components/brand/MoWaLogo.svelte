<script lang="ts">
	import { resolve } from '$app/paths';

	type LogoVariant = 'ink' | 'on-dark' | 'primary';

	let {
		size = 36,
		label = 'MO_WA',
		variant = 'ink',
		showWordmark = true
	}: {
		size?: number;
		label?: string;
		variant?: LogoVariant;
		showWordmark?: boolean;
	} = $props();

	/*
	 * 마크는 인라인 SVG(fill=currentColor)라 글자색 토큰을 따른다. <img>로는 currentColor가 상속되지 않아
	 * 다크에서 검정으로 보였다(handoff §13-8 다크 대비). 기본 ink는 테마 토큰 text-text로 매핑
	 * (--color-ink는 다크 값이 없음). 경로는 $lib/assets/mo-wa-logo.svg와 같다.
	 */
	const variantClass = $derived(
		variant === 'primary' ? 'text-primary' : variant === 'on-dark' ? 'text-on-dark' : 'text-text'
	);
</script>

<a class="inline-flex items-center gap-xs {variantClass}" href={resolve('/')} aria-label={label}>
	<svg
		class="block"
		viewBox="0 0 128 128"
		width={size}
		height={size}
		aria-hidden="true"
		focusable="false"
	>
		<path fill="currentColor" d="M18 104V24h14l32 42 32-42h14v80H94V53L68 86h-8L34 53v51H18Z" />
		<path fill="currentColor" fill-opacity=".28" d="M28 28h18l18 23 18-23h18L68 72h-8L28 28Z" />
	</svg>
	{#if showWordmark}
		<span class="font-display text-[21px] font-semibold tracking-[-0.231px]">MO_WA</span>
	{/if}
</a>
