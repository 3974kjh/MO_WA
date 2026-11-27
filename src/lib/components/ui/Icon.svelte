<script lang="ts">
	/**
	 * Lucide 공용 래퍼 (handoff §19-4, icons.md §1): 선 1.8 고정, 장식이면 aria-hidden + focusable=false, 줄어들지 않음.
	 * 크기: 배지 14 · 문장·버튼 16 · 입력 앞 18 · 아이콘 버튼·사이드바 20 · 하단 탭 22 · 빈/오류 상태 24.
	 * 아이콘은 깊은 경로로 import 해서 넘긴다: `import Eye from '@lucide/svelte/icons/eye'` → `<Icon icon={Eye} size={20} />`.
	 * 부모는 `inline-flex items-center` + gap 토큰(6·8)으로 맞춘다(DS §4-3).
	 */
	import type { LucideIcon } from '@lucide/svelte';

	let {
		icon: Glyph,
		size = 16,
		class: className = ''
	}: {
		icon: LucideIcon;
		size?: 14 | 16 | 18 | 20 | 22 | 24;
		class?: string;
	} = $props();
</script>

<Glyph {size} strokeWidth={1.8} class="shrink-0 {className}" aria-hidden="true" focusable="false" />
