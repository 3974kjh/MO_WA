<script lang="ts">
	/**
	 * 목록 검색 입력 (FE-02): type=search, 입력 후 200ms 디바운스로 oninput 호출 (FE-10: 목록 페이지가 URL ?q=에 반영).
	 * FE-10 Low-1: bind:this로 cancel()·flush()·isPending()을 쓴다. 다른 이동 전에 cancel(), Enter는 flush().
	 */
	import Search from '@lucide/svelte/icons/search';
	import { untrack } from 'svelte';
	import { debounce as debounceFn } from '$lib/routing/debounce';
	import { shouldFlushOnKey } from '$lib/routing/searchKeys';

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

	/** 대기 중인 입력을 버린다(칩·필터 초기화·뒤로 가기 등 다른 이동 전에). */
	export function cancel() {
		emit.cancel();
	}
	/** 대기 중인 입력을 즉시 보낸다(Enter). */
	export function flush() {
		emit.flush();
	}
	/** 아직 보내지 않은 입력이 있으면 true. */
	export function isPending() {
		return emit.pending();
	}

	function keydown(e: KeyboardEvent) {
		// 한글 조합 중 Enter는 조합 확정용이라 건너뛴다.
		if (shouldFlushOnKey(e)) flush();
	}

	$effect(() => () => emit.cancel());
</script>

<label class="mw-input-group">
	<Search size={18} strokeWidth={1.8} aria-hidden="true" />
	<span class="sr-only">{label}</span>
	<input
		type="search"
		{value}
		{placeholder}
		oninput={handle}
		onkeydown={keydown}
		autocomplete="off"
	/>
</label>
