<script lang="ts">
	/**
	 * 금액·단가 (FE-02, H §10, DS §3-1)
	 * - kind=amount: 만 원 축약 + title/aria-label=정확한 값, tabindex=0, 점선 밑줄(.tip). <640에서는 탭하면 '정확한 금액' 하단 시트.
	 * - kind=unit(주가·평단·손익분기): 절대 축약하지 않는다.
	 */
	import { formatMoney, type Currency, type MoneyKind } from '$lib/format/money';
	import { EXACT_SHEET_MQ, exactValue } from './exactValue.svelte';

	let {
		value,
		currency = 'KRW',
		kind = 'amount',
		plus = false,
		tone = 'none',
		label,
		class: className = ''
	}: {
		value: number;
		currency?: Currency;
		kind?: MoneyKind;
		plus?: boolean;
		/** sign: 금액 손익처럼 숫자 색으로 부호를 보일 때(빨강 이익/파랑 손실) */
		tone?: 'none' | 'sign';
		/** 모바일 시트에 보일 항목 이름. 없으면 타일 라벨·표 열 라벨에서 찾는다 */
		label?: string;
		class?: string;
	} = $props();

	let f = $derived(formatMoney(value, currency, kind, { plus }));
	let toneClass = $derived(tone === 'sign' ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : '');

	/** 시안 shell.js와 같은 규칙으로 항목 이름을 찾는다: 타일 라벨 → 표 '첫 열 · 열 라벨' → '금액' */
	function contextLabel(el: HTMLElement): string {
		if (label) return label;
		const tile = el.closest('.tile');
		const tl = tile?.querySelector('.tile-label')?.textContent?.trim();
		if (tl) return tl;
		const td = el.closest('td');
		if (td) {
			// 표의 첫 열(종목명 등)을 이름으로 쓴다. 금액이 첫 열이면 생략.
			const first = td.closest('tr')?.querySelector('th, td');
			const name = first && first !== td ? first.textContent?.trim() : '';
			const col = td.getAttribute('data-label') ?? '';
			return [name, col].filter(Boolean).join(' · ') || '금액';
		}
		return '금액';
	}

	function openExact(e: Event) {
		// PC(≥640)는 title/aria-label 툴팁만. 모바일에서만 시트를 연다.
		if (!window.matchMedia(EXACT_SHEET_MQ).matches) return;
		e.preventDefault();
		exactValue.show(contextLabel(e.currentTarget as HTMLElement), f.exact);
	}
</script>

{#if f.abbreviated}
	<span
		class="money num tip {toneClass} {className}"
		role="button"
		tabindex="0"
		title={f.exact}
		aria-label={f.exact}
		onclick={openExact}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') openExact(e);
		}}
		>{f.text}{#if f.unit}<small class="u">{f.unit}</small>{/if}</span
	>
{:else}
	<span class="money num {toneClass} {className}"
		>{f.text}{#if f.unit}<small class="u">{f.unit}</small>{/if}</span
	>
{/if}

<style>
	.money {
		white-space: nowrap;
	}
	.up {
		color: var(--color-up);
	}
	.down {
		color: var(--color-down);
	}
</style>
