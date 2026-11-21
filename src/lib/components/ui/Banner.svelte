<script lang="ts">
	/** 상단 배너 (DS §7-10): 데이터 지연·부분 실패. 오류는 up-soft 배경 + ✕ + 본문 색(빨강 글자 금지, DS §2) */
	import type { Snippet } from 'svelte';
	import type { BannerTone } from './types';

	let { tone = 'warn', children }: { tone?: BannerTone; children: Snippet } = $props();
	const ICON: Record<BannerTone, string> = { info: 'ⓘ', warn: '⚠', err: '✕' };
	const WORD: Record<BannerTone, string> = { info: '정보', warn: '주의', err: '오류' };
</script>

<div class="banner {tone}" role={tone === 'err' ? 'alert' : 'status'}>
	<span class="ico" aria-hidden="true">{ICON[tone]}</span>
	<span class="sr-only">{WORD[tone]}:</span>
	<div class="msg">{@render children()}</div>
</div>

<style>
	.banner {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 10px 14px;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		border: 1px solid var(--color-line);
		background: var(--color-warn-soft);
		color: var(--color-text);
	}
	.info {
		background: var(--color-info-soft);
	}
	.err {
		background: var(--color-up-soft);
	}
	.ico {
		flex: none;
		font-size: var(--text-xs);
		line-height: var(--text-sm--line-height);
	}
	.warn .ico {
		color: var(--color-warn);
	}
	.info .ico {
		color: var(--color-info);
	}
	.msg {
		min-width: 0;
	}
</style>
