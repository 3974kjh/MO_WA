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
