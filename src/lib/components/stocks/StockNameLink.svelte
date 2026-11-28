<script lang="ts">
	/**
	 * 종목명 글자 링크(v1.6.3, PM이 전한 사용자 결정 2026-11-22): 이름 글자만 `/stocks/[ticker]`, 행 전체는 링크 아님.
	 * stock·etf가 아니거나 코드가 없으면 링크 없이 글자만(결정 3: bond·cash는 종목 화면 대상 아님).
	 * 클릭 영역은 보이지 않는 ::after로 넓히고(모바일 ≥44, PC·태블릿 높이 ≥40), 포커스 링은 글자에 맞춘다.
	 */
	import { resolve } from '$app/paths';
	import { stockHref } from '$lib/stocks/view';

	let {
		name,
		ticker,
		assetType,
		srText
	}: { name: string; ticker: string | null; assetType: string | null; srText?: string } = $props();
	let href = $derived(stockHref(ticker, assetType));
</script>

{#if href}<a class="stk-link" href={resolve(href)}
		>{name}{#if srText}<span class="sr-only">{` ${srText}`}</span>{/if}</a
	>{:else}{name}{/if}

<style>
	.stk-link {
		position: relative;
		color: var(--color-text);
		font-weight: inherit;
		text-decoration: none;
		border-radius: 4px;
		overflow-wrap: anywhere;
	}
	.stk-link::after {
		content: '';
		position: absolute;
		inset: -13px -9px;
	}
	.stk-link:hover,
	.stk-link:focus-visible {
		color: var(--color-accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.stk-link:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	@media (max-width: 639px) {
		.stk-link::after {
			inset: -13px -12px;
		}
	}
</style>
