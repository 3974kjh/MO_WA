<script lang="ts">
	/**
	 * 원칙 개정 요청의 새 본문 미리보기. 평문으로만 보인다({@html}·마크다운 렌더 없음).
	 * 서버가 앞부분만 보내면(body_truncated) 그 사실을 알린다.
	 */
	let { text, truncated = false }: { text: string | null; truncated?: boolean } = $props();
</script>

{#if text && text.trim()}
	<figure class="pb" data-testid="principle-body">
		<figcaption>바뀔 원칙 본문</figcaption>
		<p class="txt">{text}</p>
		{#if truncated}<p class="more">본문이 길어 앞부분만 보여요.</p>{/if}
	</figure>
{/if}

<style>
	.pb {
		margin: 0;
		background: var(--color-surface-2);
		border-radius: var(--radius-sm);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	figcaption,
	.more {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.txt {
		font-size: var(--text-sm);
		color: var(--color-text);
		white-space: pre-line;
		overflow-wrap: anywhere;
		max-height: 240px;
		overflow: auto;
	}
</style>
