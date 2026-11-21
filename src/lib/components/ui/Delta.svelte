<script lang="ts">
	/**
	 * 등락률 (FE-02, H §10 결정 ④): 통화·시장과 무관하게 >0 빨강 ▲ +, <0 파랑 ▼ −, 0 회색 –.
	 * 미국 종목용 분기·옵션은 만들지 않는다.
	 */
	import { deltaDirection, formatSigned } from '$lib/format/number';

	let {
		value,
		digits = 2,
		suffix = '%',
		class: className = ''
	}: { value: number; digits?: number; suffix?: string; class?: string } = $props();

	let dir = $derived(deltaDirection(value, digits));
	let text = $derived(formatSigned(value, digits) + suffix);
	const SYMBOL = { up: '▲', down: '▼', flat: '–' } as const;
	const WORD = { up: '상승', down: '하락', flat: '보합' } as const;
</script>

<span class="delta num {dir} {className}" data-dir={dir}
	><span class="sym" aria-hidden="true">{SYMBOL[dir]}</span><span class="sr-only"
		>{WORD[dir]}
	</span>{text}</span
>

<style>
	.delta {
		font-weight: 600;
		white-space: nowrap;
	}
	.sym {
		margin-right: 2px;
		font-size: 0.78em;
	}
	.up {
		color: var(--color-up);
	}
	.down {
		color: var(--color-down);
	}
	.flat {
		color: var(--color-muted);
	}
</style>
