<script lang="ts">
	// FE-11 종목·분석 리포트 화면의 +error 공통: 404 = '없는 …' + 종목 목록으로, 그 밖 = 다시 시도.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';

	let { what, title, desc }: { what: string; title: string; desc: string } = $props();
</script>

<Card>
	{#if page.status === 404}
		<EmptyState icon="○" {title} {desc}>
			{#snippet action()}
				<a class="btn-primary-m btn preset-filled-brand" href={resolve('/(app)/stocks')}
					>종목 목록으로</a
				>
			{/snippet}
		</EmptyState>
	{:else}
		<ErrorState
			title="{what} 정보를 불러오지 못했어요"
			desc="잠시 뒤 다시 시도해 주세요."
			onretry={() => location.reload()}
		/>
	{/if}
</Card>
