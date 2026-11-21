<script lang="ts">
	/**
	 * FE-08 보관함 (DS §7-14, G-13). 공통 컴포넌트(Card·DataTable·EmptyState·Sheet 확인 시트)만 쓴다.
	 * - 유형 칩(건수) + 제목 검색은 화면 안에서만 거른다(보관 행은 유형별 최근 N건).
	 * - PC는 표, 모바일(<640)은 카드형(DataTable mobile='cards').
	 * - 행별 '복원' → 확인 시트('복원할까요?') → ?/restore → 토스트 + 다시 읽기. 영구 삭제 없음(Q-01).
	 */
	import type { PageData } from './$types';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import { toast } from '$lib/components/ui/toast.svelte';
	import type { Col } from '$lib/components/ui/types';
	import {
		ARCHIVE_KIND_LABEL,
		ARCHIVE_KINDS,
		ARCHIVED_BY_ME,
		ARCHIVED_BY_UNKNOWN,
		filterArchive,
		type ArchiveItem,
		type ArchiveKind
	} from '$lib/archive/view';

	let { data }: { data: PageData } = $props();

	const base = resolve('/archive');

	let kind = $state<ArchiveKind | ''>('');
	let q = $state('');
	let box = $state<SearchBox>();

	let items = $derived(filterArchive(data.items, kind, q));
	let filtered = $derived(kind !== '' || q.trim() !== '');

	function resetFilter() {
		box?.cancel();
		kind = '';
		q = '';
	}

	const columns: Col<ArchiveItem>[] = [
		{ key: 'title', label: '제목', title: true, render: titleCell },
		{ key: 'kindLabel', label: '유형' },
		{ key: 'origin', label: '원래 위치' },
		{ key: 'archivedBy', label: '보관한 사람' },
		{ key: 'archivedLabel', label: '보관한 날', num: true },
		{ key: 'restore', label: '복원', align: 'right', render: restoreCell }
	];

	// ——— 복원(확인 시트) ———
	let target = $state<ArchiveItem | null>(null);
	let restoring = $state(false);

	function byText(by: string): string {
		if (by === ARCHIVED_BY_ME) return '내가';
		if (by === ARCHIVED_BY_UNKNOWN) return '';
		return `${by}이(가)`;
	}

	async function confirmRestore() {
		const t = target;
		if (!t || restoring) return;
		restoring = true;
		const body = new FormData();
		body.set('id', t.id);
		body.set('table', t.kind);
		let ok: boolean;
		try {
			const res = await fetch(`${base}?/restore`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			ok = deserialize(await res.text()).type === 'success';
		} catch {
			ok = false;
		}
		restoring = false;
		target = null;
		if (!ok) {
			toast.show('복원하지 못했어요. 잠시 후 다시 시도해 주세요.', { tone: 'err' });
			return;
		}
		toast.show(`복원했어요 · ${t.origin}에 다시 보여요`, { tone: 'ok' });
		await invalidateAll();
	}
</script>

{#snippet titleCell(row: ArchiveItem)}
	<span class="name">{row.title}</span>
{/snippet}

{#snippet restoreCell(row: ArchiveItem)}
	<button
		type="button"
		class="btn sm"
		data-action="archive-restore"
		aria-label="{row.title} 복원"
		onclick={() => (target = row)}>복원</button
	>
{/snippet}

<svelte:head><title>보관함 · MO_WA</title></svelte:head>

<div class="intro">
	<Banner tone="info">
		<b>봇이 보관한 항목도 직접 복원할 수 있어요.</b> 복원하면 원래 목록에 다시 나타나요. 영구 삭제는 없어요.
	</Banner>
</div>

<div class="toolbar">
	<div class="grow">
		<SearchBox bind:this={box} bind:value={q} label="보관함 검색" placeholder="제목 검색" />
	</div>
	<div class="chips" role="group" aria-label="유형 필터" data-testid="archive-chips">
		<FilterChip pressed={kind === ''} count={data.counts.all} onclick={() => (kind = '')}
			>전체</FilterChip
		>
		{#each ARCHIVE_KINDS as k (k)}
			<FilterChip pressed={kind === k} count={data.counts[k]} onclick={() => (kind = k)}
				>{ARCHIVE_KIND_LABEL[k]}</FilterChip
			>
		{/each}
	</div>
	<p class="count" aria-live="polite" data-testid="archive-count">{items.length}건 보관 중</p>
</div>

{#if data.error && data.items.length > 0}
	<div class="aux"><Banner tone="warn">일부 유형을 불러오지 못했어요.</Banner></div>
{/if}
{#if data.truncated.length > 0}
	<p class="note">
		{data.truncated.map((k) => ARCHIVE_KIND_LABEL[k]).join('·')}은(는) 최근 보관한 항목만 보여요.
	</p>
{/if}

{#if data.error && data.items.length === 0}
	<ErrorState desc="잠시 후 다시 시도해 주세요." />
{:else if items.length === 0}
	<Card>
		<EmptyState
			icon="🗂️"
			title={filtered ? '조건에 맞는 보관 항목이 없어요' : '보관한 항목이 없어요'}
			desc={filtered
				? '검색어나 유형을 바꿔 보세요.'
				: '각 목록 화면에서 ‘보관’하면 여기에 모여요. 봇이 보관한 항목도 이곳에서 복원할 수 있어요.'}
		>
			{#snippet action()}
				{#if filtered}
					<button type="button" class="btn" onclick={resetFilter}>필터 초기화</button>
				{/if}
			{/snippet}
		</EmptyState>
	</Card>
{:else}
	<Card flush>
		<DataTable
			{columns}
			rows={items}
			mobile="cards"
			caption="보관한 항목"
			rowKey={(r) => `${r.kind}:${r.id}`}
		/>
	</Card>
{/if}

<Sheet open={target != null} onclose={() => (target = null)} variant="center" title="복원할까요?">
	{#if target}
		<div class="target">
			<div class="name">{target.title}</div>
			<div class="meta">
				{target.kindLabel} · {target.origin}{#if byText(target.archivedBy)}
					· {byText(target.archivedBy)}{/if}
				{target.archivedLabel}에 보관
			</div>
		</div>
		<p class="confirm">
			복원하면 <b>{target.origin}</b>에 다시 보여요.{#if target.archivedBy !== ARCHIVED_BY_ME && target.archivedBy !== ARCHIVED_BY_UNKNOWN}
				봇이 보관한 항목도 직접 복원할 수 있어요.{/if}
		</p>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (target = null)}>취소</button>
		<button
			type="button"
			class="btn primary"
			data-action="archive-restore-confirm"
			aria-disabled={restoring ? 'true' : undefined}
			onclick={confirmRestore}>복원</button
		>
	{/snippet}
</Sheet>

<style>
	.intro,
	.aux {
		margin-bottom: 12px;
	}
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 12px;
	}
	.grow {
		min-width: 0;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
	}
	.count,
	.note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.note {
		margin-bottom: 12px;
	}
	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.target {
		padding: 12px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		margin-bottom: 12px;
	}
	.meta {
		margin-top: 4px;
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.confirm {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-muted);
		line-height: 1.6;
	}
</style>
