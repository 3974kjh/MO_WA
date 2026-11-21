<script lang="ts">
	import { THEME_LABEL } from '$lib/theme/theme';
	import { themeState } from '$lib/theme/themeState.svelte';
	import ThemeIcon from './ThemeIcon.svelte';

	$effect(() => {
		themeState.sync();
	});

	let label = $derived(`화면 모드: ${THEME_LABEL[themeState.mode]} (누르면 변경)`);
</script>

<!-- 3단 토글: 시스템 → 라이트 → 다크 (H §1-3) -->
<button
	type="button"
	class="icon-btn"
	aria-label={label}
	title={label}
	onclick={() => themeState.cycle()}
>
	<ThemeIcon mode={themeState.mode} />
</button>

<style>
	.icon-btn {
		width: 40px;
		height: 40px;
		flex: none;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-line);
		background: var(--color-surface);
		display: inline-grid;
		place-items: center;
		color: var(--color-muted);
	}
	.icon-btn:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
	}
</style>
