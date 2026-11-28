<script lang="ts">
	/** 네이버 지도 검색 링크(허용 주소만). 새 창 + noopener. 이름 뒤에 '(새 창)'을 스크린리더에만 읽힌다. */
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { isAllowedMapLink, type ComplexItem } from '$lib/maps/points';

	let {
		item,
		label = '네이버 지도에서 보기'
	}: { item: Pick<ComplexItem, 'name' | 'naverUrl'>; label?: string } = $props();
</script>

{#if isAllowedMapLink(item.naverUrl)}
	<a class="rm-ext" href={item.naverUrl} target="_blank" rel="noopener noreferrer external"
		>{label}<ExternalLink size={15} aria-hidden="true" /><span class="sr-only"
			>({item.name}, 새 창)</span
		></a
	>
{/if}

<style>
	.rm-ext {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 600;
		color: var(--color-accent);
		min-height: 40px;
		white-space: nowrap;
	}
</style>
