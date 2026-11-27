<script lang="ts">
	/**
	 * 변경 요청 카드 (DS §7-6, §7-6b, handoff §14-4). 왼쪽 색 세로선 없이 상태 배지(아이콘+글자)로만 구분.
	 * mode=open: 반영 / 고쳐서 반영 / 보류 / 거절(close·원칙 개정은 3칸). mode=attention: 확인했어요. mode=history: 결정 시각.
	 */
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { formatKstShort } from '$lib/format/datetime';
	import {
		badgeKind,
		canOverride,
		changeTypeLabel,
		diff3Rows,
		diffRows,
		isPreBlocked,
		itemTitle,
		preBlockedNote,
		proposedProblem,
		proposedProblemNote,
		type QueueItem
	} from '$lib/queue/proposals';
	import DiffTable from './DiffTable.svelte';
	import Diff3 from './Diff3.svelte';
	import PrincipleBody from './PrincipleBody.svelte';

	let {
		item,
		mode = 'open',
		busy = false,
		onapprove,
		onoverride,
		onhold,
		onreject,
		onack
	}: {
		item: QueueItem;
		mode?: 'open' | 'attention' | 'history';
		busy?: boolean;
		onapprove?: (item: QueueItem) => void;
		onoverride?: (item: QueueItem) => void;
		onhold?: (item: QueueItem, hold: boolean) => void;
		onreject?: (item: QueueItem) => void;
		onack?: (item: QueueItem) => void;
	} = $props();

	let badge = $derived(badgeKind(item));
	let modified = $derived(badge === 'modified');
	let blocked = $derived(mode === 'open' && isPreBlocked(item));
	let overridable = $derived(canOverride(item));
	// 봇이 보낸 값이 그대로는 반영 안 됨: '반영'만 막고 '고쳐서 반영'·보류·거절은 연다.
	let problem = $derived(mode === 'open' && !blocked && !!proposedProblem(item));
	let noteId = $derived(`why-${item.id}`);
	let isUser = $derived(item.proposed_by_type === 'user');
	let isPrinciple = $derived(item.kind === 'principle');
	let noteEl = $state<HTMLElement>();

	const kst = (d: string | null) => (d ? formatKstShort(d) : '');

	function guardApprove(fn: (() => void) | undefined) {
		if (busy) return;
		if (problem) {
			noteEl?.focus();
			return;
		}
		guard(fn);
	}

	function guard(fn: (() => void) | undefined) {
		if (busy) return;
		if (blocked) {
			noteEl?.focus();
			return;
		}
		fn?.();
	}

	let statusNote = $derived.by(() => {
		switch (item.status) {
			case 'conflict':
				return item.kind === 'principle'
					? '요청이 가정한 투자 원칙 본문과 지금 본문이 달라 반영하지 않았어요. 새 요청이 필요해요.'
					: '요청이 가정한 보유 기록과 실제 기록이 달라 반영하지 않았어요. 새 요청이 필요해요.';
			case 'expired':
				return '7일 안에 결정하지 않아 기한이 지났어요.';
			case 'superseded':
				return '새 요청으로 바뀌었어요.';
			case 'cancelled':
				return '요청한 봇이 취소했어요.';
			default:
				return null;
		}
	});
</script>

<article
	class="qi"
	data-status={item.status}
	data-kind={item.kind}
	data-testid="queue-card"
	aria-label="{item.display_id} {itemTitle(item)}"
>
	<header class="q-head">
		<span class="meta">
			{#if item.display_id}<span class="num">{item.display_id}</span> ·
			{/if}<span class="num">{kst(item.created_at)}</span>
			<span class="ctype">{changeTypeLabel(item.change_type)}</span>
		</span>
		{#if modified}
			<span class="sb-mod" data-badge="modified"
				><span aria-hidden="true">✓</span>반영됨 · 값 고침</span
			>
		{:else}
			<StatusBadge status={item.status} />
		{/if}
	</header>

	<h3 class="title">{itemTitle(item)}</h3>
	<p class="by">
		요청한 봇 {#if isUser}<b>나</b>{#if !isPrinciple}(직접 수정){/if}{:else}<b
				>{item.proposer_name}</b
			>{/if}
	</p>

	{#if isPrinciple}
		<PrincipleBody text={item.body_preview} truncated={item.body_truncated} />
		{#if item.reason}<p class="reason"><b>요청 이유</b> {item.reason}</p>{/if}
		{#if item.status === 'rejected' && item.decision_note}<p class="reason">
				<b>거절 이유</b>
				{item.decision_note}
			</p>{/if}
	{:else if modified && item.applied_values}
		<Diff3 rows={diff3Rows(item, item.applied_values)} />
		{#if item.decision_note}<p class="hist-mod"><b>고친 이유</b> {item.decision_note}</p>{/if}
		<p class="mw-sub">
			{kst(item.decided_at)} · 나 · 봇 요청 값과 다른 값으로 반영
		</p>
	{:else}
		<DiffTable
			rows={diffRows(
				item,
				item.status === 'approved' && item.applied_values
					? item.applied_values
					: item.proposed_values
			)}
		/>
		{#if item.calc_note}<p class="calc"><b>계산식</b> {item.calc_note}</p>{/if}
		{#if item.reason}<p class="reason"><b>요청 이유</b> {item.reason}</p>{/if}
		{#if item.status === 'rejected' && item.decision_note}<p class="reason">
				<b>거절 이유</b>
				{item.decision_note}
			</p>{/if}
	{/if}

	{#if item.evidence.length > 0}
		<ul class="chips" aria-label="근거">
			{#each item.evidence as e, i (i)}
				<li>
					{#if e.href}
						<!-- 외부 근거 URL(http·https만, view.ts에서 거름) — 앱 내부 경로가 아니라 resolve()를 쓰지 않는다 -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a class="mw-chip" href={e.href} target="_blank" rel="noopener noreferrer nofollow"
							>{e.label} ↗</a
						>{:else}<span class="mw-chip">{e.label}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if item.status === 'on_hold' && item.held_at}
		<p class="mw-sub"><span aria-hidden="true">⏸</span> {kst(item.held_at)} 보류</p>
	{/if}
	{#if statusNote}
		<p class="status-note" class:alert={item.status === 'conflict' || item.status === 'expired'}>
			{statusNote}
		</p>
	{/if}

	{#if mode === 'open'}
		{#if blocked}
			<p
				class="status-note alert"
				id={noteId}
				tabindex="-1"
				bind:this={noteEl}
				data-testid="pre-blocked"
			>
				<span aria-hidden="true">⚠</span>
				<span><b>지금은 반영할 수 없어요</b> {preBlockedNote(item)}</span>
			</p>
		{/if}
		{#if problem}
			<p
				class="status-note alert"
				id={noteId}
				tabindex="-1"
				bind:this={noteEl}
				data-testid="proposed-problem"
			>
				<span aria-hidden="true">⚠</span>
				<span>{proposedProblemNote(item)}</span>
			</p>
		{/if}
		<div class="acts" class:c3={!overridable}>
			<button
				type="button"
				class="btn-primary-m btn preset-filled-brand"
				data-action="approve"
				aria-disabled={blocked || problem || busy ? 'true' : undefined}
				aria-describedby={blocked || problem ? noteId : undefined}
				onclick={() => guardApprove(() => onapprove?.(item))}>반영</button
			>
			{#if overridable}
				<button
					type="button"
					class="btn preset-outlined-surface-500"
					data-action="override"
					aria-disabled={blocked || busy ? 'true' : undefined}
					aria-describedby={blocked ? noteId : undefined}
					onclick={() => guard(() => onoverride?.(item))}>고쳐서 반영</button
				>
			{/if}
			{#if item.status === 'on_hold'}
				<button
					type="button"
					class="btn preset-outlined-surface-500"
					data-action="unhold"
					aria-disabled={busy ? 'true' : undefined}
					onclick={() => !busy && onhold?.(item, false)}>대기로 되돌리기</button
				>
			{:else}
				<button
					type="button"
					class="btn preset-outlined-surface-500"
					data-action="hold"
					aria-disabled={busy ? 'true' : undefined}
					onclick={() => !busy && onhold?.(item, true)}>보류</button
				>
			{/if}
			<button
				type="button"
				class="btn preset-outlined-error-700-300"
				data-action="reject"
				aria-disabled={busy ? 'true' : undefined}
				onclick={() => !busy && onreject?.(item)}>거절</button
			>
		</div>
		{#if !overridable && item.change_type === 'close'}
			<p class="hint">
				보유 종료는 고칠 항목이 없어 ‘고쳐서 반영’이 없어요. 그대로 반영하거나 거절해요.
			</p>
		{/if}
	{:else if mode === 'attention'}
		<div class="acts one">
			<button
				type="button"
				class="btn preset-outlined-surface-500"
				data-action="ack"
				aria-disabled={busy ? 'true' : undefined}
				onclick={() => !busy && onack?.(item)}>확인했어요</button
			>
		</div>
	{:else if !modified && (item.decided_at || item.acknowledged_at)}
		<p class="mw-sub">
			{#if item.decided_at}{kst(item.decided_at)}{/if}{#if item.acknowledged_at}
				· 내가 확인함 {kst(item.acknowledged_at)}{/if}
		</p>
	{/if}
</article>

<style>
	.qi {
		background: var(--color-surface);
		border: 1px solid var(--color-card-line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		padding: 16px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.q-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.meta {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}
	.ctype {
		font-size: var(--text-xs);
		color: var(--color-muted);
		background: var(--color-surface-2);
		padding: 1px 6px;
		border-radius: var(--radius-xs);
	}
	.sb-mod {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 22px;
		padding: 0 8px;
		border-radius: var(--radius-xs);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		background: var(--color-ok-soft);
		color: var(--color-ok);
	}
	.title {
		font-size: var(--text-lg);
		line-height: var(--text-lg--line-height);
		overflow-wrap: anywhere;
	}
	.by,
	.mw-sub,
	.hint {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.by b {
		color: var(--color-text);
	}
	.calc,
	.reason,
	.hist-mod {
		font-size: var(--text-sm);
		color: var(--color-muted);
		overflow-wrap: anywhere;
		white-space: pre-line;
	}
	.hist-mod {
		background: var(--color-surface-2);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.mw-chip {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		padding: 0 10px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-line);
		font-size: var(--text-xs);
		color: var(--color-muted);
	}
	.status-note {
		display: flex;
		gap: 6px;
		font-size: var(--text-sm);
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--color-surface-2);
		color: var(--color-text);
	}
	.status-note.alert {
		background: var(--color-warn-soft);
	}
	.acts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 4px;
	}
	.acts.c3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.acts.one {
		grid-template-columns: minmax(0, 1fr);
	}
	.acts .btn {
		min-width: 0;
		padding: 0 8px;
	}
	/* 모바일 주요 액션 44 (DS §4-1): 반영(44)·고쳐서 반영·보류·거절(40)이 한 줄에서 높이가 다르지 않게 모두 44 */
	@media (max-width: 639px) {
		.acts .btn {
			min-height: 2.75rem;
		}
	}
</style>
