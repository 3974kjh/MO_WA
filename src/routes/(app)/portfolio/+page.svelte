<script lang="ts">
	/**
	 * 포트폴리오 `/portfolio` — FE-07 변경 요청(#queue). 시안 `screens/portfolio.html`(큐 구역)·
	 * `screens/approval-override.html`. 시안의 상태 고정 버튼·안내줄·상태 범례·샘플 데이터는 넣지 않는다.
	 * - 보유 표·자산 비중 본문은 FE-05. 여기서는 기록 수정(§7-12) 진입점만 보유 목록에 둔다.
	 * - G-2: 반영·고쳐서 반영·기록 수정은 확인 → 낙관적 UI → 5초 뒤 요청. 되돌리기·탭 닫기·이동이면 보내지 않는다.
	 *   거절은 확인 뒤 즉시. 보류·확인했어요는 바로 처리.
	 * - 서버가 반영 안 됨(기록 달라짐)을 돌려주면 '확인 필요'로 옮긴다(일반 오류 토스트 아님).
	 *   미리 막힌 카드(approval_version ≠ base_version)는 배지 그대로, 반영 버튼만 aria-disabled.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { PageData } from './$types';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import { toast } from '$lib/components/ui/toast.svelte';
	import QueueCard from '$lib/components/queue/QueueCard.svelte';
	import DiffTable from '$lib/components/queue/DiffTable.svelte';
	import OverrideSheet from '$lib/components/queue/OverrideSheet.svelte';
	import CorrectionSheet from '$lib/components/queue/CorrectionSheet.svelte';
	import { createDeferredSender, UNDO_GRACE_MS } from '$lib/queue/deferred';
	import {
		ACTION_ERROR_TEXT,
		classifyActionResult,
		diffRows,
		formatField,
		isPreBlocked,
		sortHistory,
		type ActionOutcome,
		type Ccy,
		type CorrectionTarget,
		type FieldValues,
		type QueueItem
	} from '$lib/queue/proposals';

	let { data }: { data: PageData } = $props();

	type QueueFilter = 'open' | 'closed' | 'all';
	let filter = $state<QueueFilter>('open');
	let section = $state<'holdings' | 'weights' | 'queue'>('holdings');

	/** 5초 유예 중인 반영(낙관적). 되돌리면 지운다. */
	let optimistic = $state<
		Record<string, { applied: FieldValues | null; note: string | null; at: string }>
	>({});
	/** 서버가 반영 안 됨(기록 달라짐)을 돌려준 요청 — 다시 불러오기 전까지 '확인 필요'로 보인다. */
	let conflicted = $state<Record<string, true>>({});
	let busy = $state<Record<string, true>>({});
	let correctionLocal = $state<Record<string, { qty: number; avg_price: number; currency: Ccy }>>(
		{}
	);

	let approveTarget = $state<QueueItem | null>(null);
	let rejectTarget = $state<QueueItem | null>(null);
	let rejectNote = $state('');
	let overrideTarget = $state<QueueItem | null>(null);
	let overrideConflict = $state(false);
	let correctionTarget = $state<CorrectionTarget | null>(null);

	const sender = createDeferredSender();
	onDestroy(() => sender.dispose());
	beforeNavigate(({ from, to }) => {
		// 다른 화면으로 가면 아직 보내지 않은 요청은 버린다(G-2). 같은 화면 안 #이동은 그대로.
		if (!to || from?.url.pathname !== to.url.pathname) sender.dropAll();
	});

	onMount(() => {
		const h = location.hash.replace('#', '');
		if (h === 'queue' || h === 'holdings' || h === 'weights') section = h;
		if (h === 'queue') {
			requestAnimationFrame(() => document.getElementById('queue')?.scrollIntoView());
		}
	});

	let queueItems = $derived(data.queue.items);
	let openList = $derived(queueItems.filter((i) => !optimistic[i.id] && !conflicted[i.id]));
	let attentionList = $derived.by(() => {
		const server = data.attentionNeeded;
		const ids = new Set(server.map((i) => i.id));
		const local = queueItems
			.filter((i) => conflicted[i.id] && !ids.has(i.id))
			.map((i) => ({ ...i, status: 'conflict' as const }));
		return [...local, ...server];
	});
	let historyList = $derived.by(() => {
		const local: QueueItem[] = [];
		for (const i of queueItems) {
			const o = optimistic[i.id];
			if (o) {
				local.push({
					...i,
					status: 'approved',
					applied_values: o.applied ?? { ...i.proposed_values },
					decision_note: o.note,
					decided_at: o.at
				});
			} else if (conflicted[i.id]) {
				local.push({ ...i, status: 'conflict' });
			}
		}
		const ids = new Set(local.map((i) => i.id));
		return sortHistory([...local, ...data.history.items.filter((i) => !ids.has(i.id))]);
	});
	let holdings = $derived(data.holdings.map((h) => ({ ...h, ...(correctionLocal[h.id] ?? {}) })));

	async function postAction(name: string, fields: Record<string, string>): Promise<ActionOutcome> {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		try {
			const res = await fetch(`?/${name}`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			return classifyActionResult(deserialize(await res.text()));
		} catch {
			return { kind: 'error', message: ACTION_ERROR_TEXT };
		}
	}

	function setBusy(id: string, on: boolean) {
		if (on) busy[id] = true;
		else delete busy[id];
	}

	/* ── 반영 · 고쳐서 반영 (G-2 5초 유예) ── */
	function commitApprove(
		item: QueueItem,
		overrides: Record<string, unknown> | null,
		note: string | null
	) {
		optimistic[item.id] = {
			applied: overrides ? { ...item.proposed_values, ...overrides } : null,
			note,
			at: new Date().toISOString()
		};
		let toastId = 0;
		const handle = sender.schedule(
			async () => {
				toast.dismiss(toastId);
				setBusy(item.id, true);
				const fields: Record<string, string> = { id: item.id };
				// 그대로 반영이면 overrides 필드를 보내지 않는다(빈 문자열 금지).
				if (overrides) fields.overrides = JSON.stringify(overrides);
				if (note) fields.note = note;
				const out = await postAction('approve', fields);
				setBusy(item.id, false);
				if (out.kind === 'conflict' || (out.kind === 'ok' && out.status === 'conflict')) {
					delete optimistic[item.id];
					conflicted[item.id] = true;
					if (overrides) {
						overrideConflict = true;
						overrideTarget = { ...item, status: 'conflict' };
					} else {
						toast.show('반영 안 됨(기록 달라짐) · ‘확인 필요’로 옮겼어요');
					}
				} else if (out.kind === 'error') {
					delete optimistic[item.id];
					toast.show(out.message, { tone: 'err' });
				} else if (out.status === 'expired') {
					delete optimistic[item.id];
					toast.show('기한이 지나 반영하지 않았어요 · ‘확인 필요’에서 볼 수 있어요');
				}
				await invalidateAll();
				delete optimistic[item.id];
			},
			() => {
				delete optimistic[item.id];
			}
		);
		toastId = toast.show(
			overrides
				? '고친 값으로 반영했어요 · 5초 안에 되돌릴 수 있어요'
				: '반영했어요 · 5초 안에 되돌릴 수 있어요',
			{
				duration: UNDO_GRACE_MS,
				action: {
					label: '되돌리기',
					onclick: () => {
						if (handle.cancel()) {
							delete optimistic[item.id];
							toast.show('되돌렸어요 · 반영 전 상태로 돌아왔어요');
						}
					}
				}
			}
		);
	}

	function confirmApprove() {
		const item = approveTarget;
		if (!item || isPreBlocked(item)) return;
		approveTarget = null;
		commitApprove(item, null, null);
	}

	function openOverride(item: QueueItem) {
		overrideConflict = false;
		overrideTarget = item;
	}

	/* ── 거절(확인 뒤 즉시) · 보류 · 확인했어요 ── */
	async function confirmReject() {
		const item = rejectTarget;
		if (!item) return;
		const note = rejectNote.trim();
		rejectTarget = null;
		rejectNote = '';
		setBusy(item.id, true);
		const out = await postAction('reject', note ? { id: item.id, note } : { id: item.id });
		setBusy(item.id, false);
		if (out.kind === 'ok') toast.show('요청을 거절했어요', { tone: 'ok' });
		else toast.show(out.kind === 'error' ? out.message : ACTION_ERROR_TEXT, { tone: 'err' });
		await invalidateAll();
	}

	async function doHold(item: QueueItem, hold: boolean) {
		setBusy(item.id, true);
		const out = await postAction('hold', { id: item.id, hold: String(hold) });
		setBusy(item.id, false);
		if (out.kind === 'ok') {
			toast.show(hold ? '요청을 보류했어요' : '확인 대기로 되돌렸어요', { tone: 'ok' });
		} else toast.show(out.kind === 'error' ? out.message : ACTION_ERROR_TEXT, { tone: 'err' });
		await invalidateAll();
	}

	async function doAck(item: QueueItem) {
		setBusy(item.id, true);
		const out = await postAction('ack', { id: item.id, kind: 'position' });
		setBusy(item.id, false);
		if (out.kind === 'ok') {
			delete conflicted[item.id];
			toast.show('확인했어요 · ‘확인 필요’에서 내렸고 기록은 지난 내역에 남아요', { tone: 'ok' });
		} else toast.show(out.kind === 'error' ? out.message : ACTION_ERROR_TEXT, { tone: 'err' });
		await invalidateAll();
	}

	/* ── 기록 수정(§7-12, G-2 5초 유예) ── */
	function commitCorrection(input: {
		target: CorrectionTarget;
		qty: number;
		avg_price: number;
		currency: Ccy;
		reason: string;
	}) {
		const { target } = input;
		correctionTarget = null;
		correctionLocal[target.id] = {
			qty: input.qty,
			avg_price: input.avg_price,
			currency: input.currency
		};
		const clientRef = crypto.randomUUID();
		let toastId = 0;
		const handle = sender.schedule(
			async () => {
				toast.dismiss(toastId);
				setBusy(target.id, true);
				const out = await postAction('correct', {
					position_id: target.id,
					qty: String(input.qty),
					avg_price: String(input.avg_price),
					currency: input.currency,
					reason: input.reason,
					client_ref: clientRef,
					base_version: String(target.approval_version)
				});
				setBusy(target.id, false);
				if (out.kind === 'conflict') {
					toast.show(
						'그 사이 보유 기록이 바뀌어 저장하지 않았어요 · 바뀐 기록을 보고 다시 수정해 주세요'
					);
				} else if (out.kind === 'error') {
					toast.show(out.message, { tone: 'err' });
				}
				await invalidateAll();
				delete correctionLocal[target.id];
			},
			() => {
				delete correctionLocal[target.id];
			}
		);
		toastId = toast.show(`${target.name} 기록을 수정했어요 · 5초 안에 되돌릴 수 있어요`, {
			duration: UNDO_GRACE_MS,
			action: {
				label: '되돌리기',
				onclick: () => {
					if (handle.cancel()) {
						delete correctionLocal[target.id];
						toast.show('되돌렸어요 · 이전 값으로 돌아왔어요');
					}
				}
			}
		});
	}

	const FILTERS: { value: QueueFilter; label: string }[] = [
		{ value: 'open', label: '확인 대기' },
		{ value: 'closed', label: '지난 내역' },
		{ value: 'all', label: '전체' }
	];
	const STATUS_TEXT: Record<string, string> = { holding: '보유', planned: '매수 계획' };
</script>

<svelte:head><title>포트폴리오 · MO_WA</title></svelte:head>

<div class="pf" data-testid="portfolio-page">
	<nav class="tabs" aria-label="포트폴리오 구역">
		<a href="#holdings" aria-current={section === 'holdings'} onclick={() => (section = 'holdings')}
			>보유·매수 계획</a
		>
		<a href="#weights" aria-current={section === 'weights'} onclick={() => (section = 'weights')}
			>자산 비중</a
		>
		<a href="#queue" aria-current={section === 'queue'} onclick={() => (section = 'queue')}
			>변경 요청 <Pill count={data.pendingCount ?? 0} /></a
		>
	</nav>

	<div class="grid">
		<Card class="c-7" flush title="보유·매수 계획">
			<div id="holdings" class="anchor"></div>
			{#if data.positionsError}
				<ErrorState desc="잠시 후 다시 시도해 주세요." />
			{:else if holdings.length === 0}
				<EmptyState
					icon="💼"
					title="아직 보유 기록이 없어요"
					desc="봇이 보낸 변경 요청을 반영하면 여기에 보여요."
				/>
			{:else}
				<ul class="holdings" aria-label="보유 기록">
					{#each holdings as h (h.id)}
						<li class="h-row">
							<div class="h-main">
								<span class="h-name">{h.name}</span>
								<span class="h-sub">{STATUS_TEXT[h.status] ?? ''}</span>
							</div>
							<dl class="h-kv">
								<dt>수량</dt>
								<dd class="num">{formatField('qty', h.qty, h.currency, h.asset_type)}</dd>
								<dt>평균 단가</dt>
								<dd class="num">
									{formatField('avg_price', h.avg_price, h.currency, h.asset_type)}
								</dd>
							</dl>
							<button
								type="button"
								class="btn sm"
								data-action="correct"
								aria-disabled={busy[h.id] ? 'true' : undefined}
								onclick={() => {
									if (!busy[h.id])
										correctionTarget = data.holdings.find((x) => x.id === h.id) ?? null;
								}}>기록 수정<span class="sr-only"> · {h.name}</span></button
							>
						</li>
					{/each}
				</ul>
				<p class="foot-note">
					수량·평균 단가는 여기서 직접 고칠 수 없어요. 각 보유 행의 <b>기록 수정</b>에서 확인하면
					바로 반영되고 활동 기록에 남아요(5초 안에 되돌릴 수 있어요).
				</p>
			{/if}
		</Card>

		<Card class="c-5" title="자산 비중">
			<div id="weights" class="anchor"></div>
			<EmptyState icon="🥧" title="자산 비중은 준비 중이에요" desc="곧 이 자리에서 볼 수 있어요." />
		</Card>

		<section class="c-12 queue" id="queue" aria-labelledby="queue-title">
			<div class="q-top">
				<div>
					<h2 id="queue-title" class="q-title">변경 요청</h2>
					<p class="q-desc">
						봇이 보낸 변경 요청은 <b>내가 반영해야</b> 보유 기록에 적용돼요. 요청이 바꾸는 항목만
						<b>고쳐서 반영</b>할 수도 있어요. 내가 직접 한 기록 수정은 확인 즉시 반영되고 ‘지난
						내역’에 남아요.
					</p>
				</div>
				<SegmentedControl
					ariaLabel="변경 요청 보기"
					options={FILTERS}
					value={filter}
					onchange={(v) => (filter = v)}
				/>
			</div>

			{#if data.attentionError}
				<div class="attn" role="region" aria-label="확인 필요">
					<ErrorState desc="확인 필요 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
				</div>
			{:else if attentionList.length > 0}
				<div class="attn" role="region" aria-label="확인 필요" data-testid="attention">
					<h3 class="attn-title">
						<span aria-hidden="true">⚠</span> 확인 필요
						<span class="count">{attentionList.length}건</span>
					</h3>
					<p class="attn-desc">
						반영 안 된 요청이 있어요(기록 달라짐·기한 지남). <b>확인했어요</b>를 누르거나 문제가
						생긴 날부터 14일이 지나면 이 묶음에서 빠지고, 기록은 ‘지난 내역’에 그대로 남아요.
					</p>
					<div class="cards">
						{#each attentionList as item (item.id)}
							<QueueCard {item} mode="attention" busy={!!busy[item.id]} onack={doAck} />
						{/each}
					</div>
				</div>
			{/if}

			{#if filter !== 'closed'}
				<div class="block" data-testid="queue-open">
					{#if filter === 'all'}<h3 class="block-title">확인 대기</h3>{/if}
					{#if data.queueError}
						<ErrorState desc="변경 요청을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
					{:else if openList.length === 0}
						<div class="empty-card">
							<EmptyState
								icon="✓"
								title="확인할 요청이 없어요"
								desc="봇이 새 변경 요청을 보내면 여기와 홈에 표시돼요."
							/>
						</div>
					{:else}
						<div class="cards">
							{#each openList as item (item.id)}
								<QueueCard
									{item}
									mode="open"
									busy={!!busy[item.id]}
									onapprove={(i) => (approveTarget = i)}
									onoverride={openOverride}
									onhold={doHold}
									onreject={(i) => {
										rejectNote = '';
										rejectTarget = i;
									}}
								/>
							{/each}
						</div>
						{#if data.queue.total > data.queue.items.length}
							<p class="more">
								확인 대기·보류 {data.queue.total}건 중 최근 {data.queue.items.length}건을 보여요.
							</p>
						{/if}
					{/if}
				</div>
			{/if}

			{#if filter !== 'open'}
				<div class="block" data-testid="queue-history">
					{#if filter === 'all'}<h3 class="block-title">지난 내역</h3>{/if}
					{#if data.historyError}
						<ErrorState desc="지난 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
					{:else if historyList.length === 0}
						<div class="empty-card">
							<EmptyState
								icon="🗂"
								title="지난 내역이 없어요"
								desc="반영·거절한 요청과 기록 수정이 여기에 남아요."
							/>
						</div>
					{:else}
						<div class="cards">
							{#each historyList as item (item.id)}
								<QueueCard {item} mode="history" />
							{/each}
						</div>
						{#if data.history.total > data.history.items.length}
							<p class="more">
								지난 내역 {data.history.total}건 중 최근 {data.history.items.length}건을 보여요.
							</p>
						{/if}
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>

<Sheet open={!!approveTarget} onclose={() => (approveTarget = null)} title="이 요청을 반영할까요?">
	{#if approveTarget}
		<div class="sheet-body" data-testid="approve-confirm">
			<DiffTable rows={diffRows(approveTarget)} />
			<p class="sheet-note">
				반영하면 보유 기록의 수량·평균 단가가 바로 바뀌고 이력에 남아요. 반영 뒤 <b
					>5초 안에 되돌릴 수 있어요</b
				>(5초가 지나야 저장돼요 · 그 전에 탭을 닫으면 저장되지 않아요).
			</p>
		</div>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (approveTarget = null)}>취소</button>
		<button
			type="button"
			class="btn primary"
			data-action="approve-confirm"
			aria-disabled={approveTarget && isPreBlocked(approveTarget) ? 'true' : undefined}
			onclick={confirmApprove}>반영하기</button
		>
	{/snippet}
</Sheet>

<Sheet open={!!rejectTarget} onclose={() => (rejectTarget = null)} title="이 요청을 거절할까요?">
	{#if rejectTarget}
		<div class="sheet-body" data-testid="reject-confirm">
			<DiffTable rows={diffRows(rejectTarget)} />
			<p class="sheet-note">
				거절 이유를 남기면 봇이 다음 요청에 참고해요. 거절은 바로 처리되며 되돌릴 수 없어요.
			</p>
			<label class="field" for="reject-note"
				>거절 이유(선택)<input
					id="reject-note"
					class="input"
					maxlength="200"
					bind:value={rejectNote}
				/></label
			>
		</div>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (rejectTarget = null)}>취소</button>
		<button type="button" class="btn danger" data-action="reject-confirm" onclick={confirmReject}
			>거절</button
		>
	{/snippet}
</Sheet>

<OverrideSheet
	item={overrideTarget}
	conflict={overrideConflict}
	onclose={() => {
		overrideTarget = null;
		overrideConflict = false;
	}}
	onsubmit={({ item, overrides, note }) => {
		overrideTarget = null;
		commitApprove(item, overrides, note);
	}}
/>

<CorrectionSheet
	target={correctionTarget}
	onclose={() => (correctionTarget = null)}
	onsubmit={commitCorrection}
/>

<style>
	.pf {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--color-line);
		overflow-x: auto;
	}
	.tabs a {
		padding: 10px 14px;
		color: var(--color-muted);
		font-weight: 600;
		border-bottom: 3px solid transparent;
		white-space: nowrap;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		text-decoration: none;
	}
	.tabs a[aria-current='true'] {
		color: var(--color-accent);
		border-bottom-color: var(--color-accent);
	}
	.tabs a:hover {
		color: var(--color-text);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 16px;
	}
	.grid > :global(*) {
		grid-column: span 12;
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.grid > :global(.c-7) {
			grid-column: span 7;
		}
		.grid > :global(.c-5) {
			grid-column: span 5;
		}
	}
	.anchor {
		scroll-margin-top: 72px;
	}
	.queue {
		scroll-margin-top: 72px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.q-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 8px;
	}
	.q-title {
		font-size: var(--text-xl);
	}
	.q-desc,
	.attn-desc {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.attn {
		background: var(--color-warn-soft);
		border-radius: var(--radius-md);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.attn-title {
		font-size: var(--text-lg);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.count {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0 8px;
		border-radius: var(--radius-xs);
		background: var(--color-warn-fill);
		color: var(--color-on-warn);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.block-title {
		font-size: var(--text-lg);
	}
	/* 카드: 모바일 1열, 태블릿·PC 2열(c-6) */
	.cards {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
	}
	@media (min-width: 640px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.empty-card {
		background: var(--color-surface);
		border: 1px solid var(--color-card-line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}
	.more,
	.foot-note {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.foot-note {
		padding: 10px 16px 14px;
	}
	.holdings {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.h-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-top: 1px solid var(--color-line);
		flex-wrap: wrap;
	}
	.h-main {
		flex: 1 1 140px;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.h-name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.h-sub {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.h-kv {
		display: grid;
		grid-template-columns: auto auto;
		gap: 2px 10px;
		font-size: var(--text-sm);
		margin: 0;
	}
	.h-kv dt {
		color: var(--color-subtle);
	}
	.h-kv dd {
		margin: 0;
		text-align: right;
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sheet-note {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
</style>
