<script lang="ts">
	/** 목록 검색 입력 (FE-02): type=search, 입력 후 200ms 디바운스로 oninput 호출 (FE-10: 목록 페이지가 URL ?q=에 반영) */
	import Search from '@lucide/svelte/icons/search';
	import { untrack } from 'svelte';
	import { debounce as debounceFn } from '$lib/routing/debounce';

	let {
		value = $bindable(''),
		placeholder = '검색',
		label = '검색',
		debounce = 200,
		oninput
	}: {
		value?: string;
		placeholder?: string;
		/** 접근성 레이블(시각적으로는 숨김) */
		label?: string;
		debounce?: number;
		oninput?: (v: string) => void;
	} = $props();

	// FE-10: 디바운스 로직은 $lib/routing/debounce 하나만 쓴다(단위 테스트 대상).
	const emit = debounceFn(
		(v: string) => oninput?.(v),
		untrack(() => debounce)
	);

	function handle(e: Event & { currentTarget: HTMLInputElement }) {
		value = e.currentTarget.value;
		emit(value);
	}

	$effect(() => () => emit.cancel());
</script>

<label class="search-box">
	<Search size={18} strokeWidth={1.8} aria-hidden="true" />
	<span class="sr-only">{label}</span>
	<input type="search" {value} {placeholder} oninput={handle} autocomplete="off" />
</label>

<style>
	.search-box {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--color-surface);
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-sm);
		padding: 0 12px;
		height: var(--size-touch);
		color: var(--color-subtle);
		min-width: 0;
	}
	.search-box:focus-within {
		outline: 2px solid var(--color-focus);
		outline-offset: 1px;
	}
	input {
		border: 0;
		background: transparent;
		outline: 0;
		color: var(--color-text);
		width: 100%;
		min-width: 0;
	}
	input::placeholder {
		color: var(--color-subtle);
	}
</style>
