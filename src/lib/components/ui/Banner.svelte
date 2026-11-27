<script lang="ts">
	/**
	 * 상단 배너 (DS §7-10): 데이터 지연·부분 실패. v1.7.0: 자체 `mw-callout`(아이콘 18 + 문장, DS §7-0).
	 * 정보는 중립 surface-2, 경고·오류만 soft 배경. 오류도 본문 색(빨강 글자 금지, DS §2) — 아이콘만 상태색.
	 */
	import type { Snippet } from 'svelte';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { BannerTone } from './types';

	let { tone = 'warn', children }: { tone?: BannerTone; children: Snippet } = $props();
	const ICON = { info: Info, warn: TriangleAlert, err: CircleAlert } as const;
	const WORD: Record<BannerTone, string> = { info: '정보', warn: '주의', err: '오류' };
	const Glyph = $derived(ICON[tone]);
</script>

<div class="mw-callout {tone}" role={tone === 'err' ? 'alert' : 'status'}>
	<Glyph size={18} strokeWidth={1.8} aria-hidden="true" focusable="false" />
	<span class="sr-only">{WORD[tone]}:</span>
	<div class="msg">{@render children()}</div>
</div>

<style>
	.msg {
		min-width: 0;
	}
</style>
