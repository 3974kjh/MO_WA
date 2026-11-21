<script lang="ts">
	/**
	 * /dev/shell — FE-01 AppShell 확인용(로컬 개발 전용, 운영 빌드 404). 로그인·DB 없이 픽스처로 렌더한다.
	 * ?current=dashboard|briefings|portfolio|journal  ?detail=1 (상세 화면: 모바일 상단바 '뒤로')
	 */
	import { page } from '$app/state';
	import { countPending } from '$lib/approvals/pending';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import type { SectionId } from '$lib/components/layout/nav';
	import Card from '$lib/components/ui/Card.svelte';
	import MetricTile from '$lib/components/ui/MetricTile.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { fixtureProposals } from '$lib/fixtures/proposals';

	let current = $derived((page.url.searchParams.get('current') ?? 'dashboard') as SectionId);
	let detail = $derived(page.url.searchParams.get('detail') === '1');
	const pendingCount = countPending(fixtureProposals);
</script>

<svelte:head><title>AppShell (dev)</title></svelte:head>

<AppShell
	{current}
	{pendingCount}
	userEmail="owner@example.com"
	title={detail ? '11/20 브리핑' : undefined}
	backHref={detail ? '/dev/shell?current=briefings' : null}
>
	<div class="grid">
		<Card title="AppShell 확인">
			<p class="muted">
				현재 섹션: <b>{current}</b>{detail ? ' · 상세 화면' : ''}. 대기 pill = pending
				{pendingCount}건(보류 제외, 픽스처). 폭을 바꿔 사이드바(≥1024) · 레일(640~1023) · 하단
				탭(&lt;640)을 확인하세요.
			</p>
		</Card>
		<div class="tiles">
			<MetricTile label="총 평가액" delta={-1.47}>
				{#snippet value()}<Money value={24_141_484} />{/snippet}
			</MetricTile>
			<MetricTile label="평가 손익" tone="auto" delta={-8.6} deltaDigits={1}>
				{#snippet value()}<Money value={-2_271_309} />{/snippet}
			</MetricTile>
		</div>
		<Card title="승인 대기">
			{#snippet aside()}<Badge tone="warn">{pendingCount}건</Badge>{/snippet}
			<ul class="q">
				{#each fixtureProposals as p (p.id)}
					<li>
						<b>{p.ticker}</b> <span class="muted">{p.title}</span>
						<StatusBadge status={p.status} />
					</li>
				{/each}
			</ul>
		</Card>
		{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
			<Card title="스크롤 확인 {i + 1}">
				<p class="muted">하단 탭·상단바가 고정되는지 확인하기 위한 본문입니다.</p>
			</Card>
		{/each}
	</div>
</AppShell>

<style>
	.grid {
		display: grid;
		gap: 16px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.muted {
		color: var(--color-muted);
	}
	.q {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.q li {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
