<script lang="ts">
	/**
	 * 포트폴리오 `/portfolio` — FE-05 지표 4·보유/매수 계획 표·자산 비중·수익률 막대 + FE-07 변경 요청(#queue).
	 * 시안 `screens/portfolio.html`·`screens/approval-override.html`. 시안의 상태 고정 버튼·안내줄·상태 범례·샘플 데이터는 넣지 않는다.
	 * - FE-05 표는 읽기 전용(DS 원칙 5, G-4): 수량·평균 단가·상태·통화·감시 가격·방향·손익분기 가격·관심만 입력란이 없다.
	 *   기록 수정(§7-12) 진입점은 보유 기록 행의 '기록 수정' 버튼(FE-07과 같은 동작·같은 요청).
	 * - 숫자는 승인된 보유 기록 값만. 대기 요청이 있는 행은 배지만 붙인다. 매수 계획 행은 수량·평균 단가 '—'.
	 *   보유 종료 행은 '전체'에서만 보인다.
	 * - G-2: 반영·고쳐서 반영·기록 수정은 확인 → 낙관적 UI → 5초 뒤 요청. 되돌리기·탭 닫기·이동이면 보내지 않는다.
	 *   거절은 확인 뒤 즉시. 보류·확인했어요는 바로 처리.
	 * - 원칙 개정 요청(R-)도 같은 목록에 섞여 나온다: 반영은 ?/approvePrinciple(5초 유예 동일),
	 *   거절·보류·대기로 되돌리기는 ?/decidePrinciple, 확인했어요는 ?/ack kind=principle. 고쳐서 반영은 없다.
	 * - 서버가 반영 안 됨(보유가 달라짐)을 돌려주면 '확인 필요'로 옮긴다(일반 오류 토스트 아님).
	 *   미리 막힌 카드(approval_version ≠ base_version)는 배지 그대로, 반영 버튼만 aria-disabled.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { PageData } from './$types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Delta from '$lib/components/ui/Delta.svelte';
	import MetricTile from '$lib/components/ui/MetricTile.svelte';
	import Money from '$lib/components/ui/Money.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { Col } from '$lib/components/ui/types';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import TriggerGauge from '$lib/components/dashboard/TriggerGauge.svelte';
	import { holdingSummary, positionLabel, weightItems } from '$lib/dashboard/home';
	import { DIRECTION_BADGE, distanceLabel, triggerState } from '$lib/dashboard/trigger';
	import {
		avgPending,
		avgText,
		currencyMismatch,
		filterRows,
		G4_NOTICE,
		memoLine,
		priceText,
		qtyText,
		rowReturnPct,
		rowWeightPct,
		segmentCounts,
		STATUS_LABEL,
		unitText,
		type PortfolioRow,
		type Segment
	} from '$lib/portfolio/view';
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
	import PrincipleBody from '$lib/components/queue/PrincipleBody.svelte';
	import { createDeferredSender, UNDO_GRACE_MS } from '$lib/queue/deferred';
	import {
		ACTION_ERROR_TEXT,
		classifyActionResult,
		diffRows,
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
	/** 서버가 반영 안 됨(보유가 달라짐)을 돌려준 요청 — 다시 불러오기 전까지 '확인 필요'로 보인다. */
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
	// 형제 요청(서버와 같은 기준): 같은 position_id, 또는 한쪽이 같은 종목의 position 없는 open_holding.
	// (승인되면 서버가 나머지를 supersede하므로, 하나가 5초 유예·전송 중이면 형제는 잠가
	// 두 번째 반영이 일반 오류로 떨어지지 않게 한다.) 종목 id가 없으면 종목 기준으로는 묶지 않고,
	// 원칙은 어디와도 묶지 않는다. 되돌리기·이동으로 버려지면 optimistic이 지워져 자동으로 풀린다.
	const isLooseOpenHolding = (i: QueueItem) => !i.position_id && i.change_type === 'open_holding';
	const areSiblings = (a: QueueItem, b: QueueItem) =>
		a.id !== b.id &&
		a.kind === 'position' &&
		b.kind === 'position' &&
		((!!a.position_id && a.position_id === b.position_id) ||
			(!!a.instrument_id &&
				a.instrument_id === b.instrument_id &&
				(isLooseOpenHolding(a) || isLooseOpenHolding(b))));
	const siblingLocked = (i: QueueItem) =>
		!optimistic[i.id] &&
		!busy[i.id] &&
		queueItems.some((o) => (optimistic[o.id] || busy[o.id]) && areSiblings(i, o));
	let attentionList = $derived.by(() => {
		const server = data.attentionNeeded;
		const ids = new Set(server.map((i) => i.id));
		const local = queueItems
			.filter((i) => conflicted[i.id] && !ids.has(i.id))
			.map((i) => ({ ...i, status: 'conflict' as const }));
		return [...local, ...server];
	});
	// 실제 건수 + 화면에서만 더해진 항목(서버 목록 밖). 건수 조회 실패 시 서버가 목록 길이를 보낸다.
	let attentionCount = $derived(
		data.attentionTotal + (attentionList.length - data.attentionNeeded.length)
	);
	// 서버가 목록을 최근 attentionLimit건(ATTENTION_NEEDED_LIMIT)으로 자른다. 실제 총건수가 상한을 넘고
	// 보여 준 건수보다 많을 때만 안내. 상한 숫자는 서버 상수 하나만 쓴다.
	let attentionTruncated = $derived(
		data.attentionTotal > data.attentionLimit && data.attentionTotal > data.attentionShown
	);
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
	/* ── FE-05 표·지표 (기록 수정 5초 유예 중이면 그 값으로 보인다) ── */
	let segment = $state<Segment>('all');
	let rows = $derived(
		(data.portfolio?.rows ?? []).map((r) => ({ ...r, ...(correctionLocal[r.id] ?? {}) }))
	);
	let counts = $derived(segmentCounts(rows));
	let visibleRows = $derived(filterRows(rows, segment));
	let correctable = $derived(new Set(data.holdings.map((h) => h.id)));
	let usdkrw = $derived(data.portfolio?.usdkrw ?? null);
	let summary = $derived(holdingSummary(rows, usdkrw));
	let heldCount = $derived(
		rows.filter((r) => r.status === 'holding' && r.qty != null && r.qty > 0).length
	);
	let weights = $derived(weightItems(rows));
	let bars = $derived(
		rows
			.filter((r) => r.status === 'holding')
			.flatMap((r) => {
				const v = rowReturnPct(r);
				return v == null ? [] : [{ label: r.ticker?.trim() || positionLabel(r), value: v }];
			})
	);
	let segOptions = $derived<{ value: Segment; label: string }[]>([
		{ value: 'all', label: '전체' },
		{ value: 'holding', label: `보유 ${counts.holding}` },
		{ value: 'planned', label: `매수 계획 ${counts.planned}` }
	]);
	const pct1 = (v: number) => `${v.toFixed(1)}%`;
	const fx = (v: number) =>
		`${v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`;

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

	// 즉시 전송하는 동작(거절·보류·확인했어요) 뒤 재조회. 실패해도 처리 안 된 거부로 남기지 않고,
	// 다음 이동·새로고침 때 다시 읽는다. busy는 재조회 전에 이미 풀려 있어 잠금이 남지 않는다.
	async function refresh() {
		try {
			await invalidateAll();
		} catch {
			/* 다음 이동·새로고침 때 다시 읽는다 */
		}
	}

	const SIBLING_LOCK_TEXT =
		'같은 종목의 다른 요청을 처리하는 중이에요 · 끝난 뒤 다시 확인해 주세요';

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
		if (siblingLocked(item)) {
			toast.show(SIBLING_LOCK_TEXT);
			return;
		}
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
				const out = await postAction(
					item.kind === 'principle' ? 'approvePrinciple' : 'approve',
					item.kind === 'principle' ? { id: item.id } : fields
				);
				setBusy(item.id, false);
				if (out.kind === 'conflict' || (out.kind === 'ok' && out.status === 'conflict')) {
					delete optimistic[item.id];
					conflicted[item.id] = true;
					if (overrides) {
						overrideConflict = true;
						overrideTarget = { ...item, status: 'conflict' };
					} else {
						toast.show('반영 안 됨(보유가 달라짐) · ‘확인 필요’로 옮겼어요');
					}
				} else if (out.kind === 'error') {
					delete optimistic[item.id];
					toast.show(out.message, { tone: 'err' });
				} else if (out.status === 'expired') {
					delete optimistic[item.id];
					toast.show('기한이 지나 반영하지 않았어요 · ‘확인 필요’에서 볼 수 있어요');
				}
				// 재조회가 실패(throw)해도 낙관 상태는 풀어 카드가 잠긴 채 남지 않게 한다.
				try {
					await invalidateAll();
				} catch {
					// 재조회 실패는 다음 이동·새로고침 때 다시 읽는다(처리되지 않은 거부로 남기지 않음).
				} finally {
					delete optimistic[item.id];
				}
			},
			() => {
				// 화면 이동·닫기로 버려지면 더는 누를 수 없는 '되돌리기' 토스트도 내린다.
				toast.dismiss(toastId);
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
		// 반영 경로와 같은 가드: 같은 종목의 형제가 유예·전송 중이면 보내지 않는다(이미 열린 시트를 확인한 경우).
		if (siblingLocked(item)) {
			toast.show(SIBLING_LOCK_TEXT);
			return;
		}
		setBusy(item.id, true);
		const base: Record<string, string> =
			item.kind === 'principle' ? { id: item.id, action: 'reject' } : { id: item.id };
		if (note) base.note = note;
		const out = await postAction(item.kind === 'principle' ? 'decidePrinciple' : 'reject', base);
		setBusy(item.id, false);
		if (out.kind === 'ok') toast.show('요청을 거절했어요', { tone: 'ok' });
		else toast.show(out.kind === 'error' ? out.message : ACTION_ERROR_TEXT, { tone: 'err' });
		await refresh();
	}

	async function doHold(item: QueueItem, hold: boolean) {
		setBusy(item.id, true);
		const out =
			item.kind === 'principle'
				? await postAction('decidePrinciple', { id: item.id, action: hold ? 'hold' : 'unhold' })
				: await postAction('hold', { id: item.id, hold: String(hold) });
		setBusy(item.id, false);
		if (out.kind === 'ok') {
			toast.show(hold ? '요청을 보류했어요' : '확인 대기로 되돌렸어요', { tone: 'ok' });
		} else toast.show(out.kind === 'error' ? out.message : ACTION_ERROR_TEXT, { tone: 'err' });
		await refresh();
	}

	async function doAck(item: QueueItem) {
		setBusy(item.id, true);
		const out = await postAction('ack', { id: item.id, kind: item.kind });
		setBusy(item.id, false);
		if (out.kind === 'ok') {
			delete conflicted[item.id];
			toast.show('확인했어요 · ‘확인 필요’에서 내렸고 기록은 지난 내역에 남아요', { tone: 'ok' });
		} else toast.show(out.kind === 'error' ? out.message : ACTION_ERROR_TEXT, { tone: 'err' });
		await refresh();
	}

	/* ── 기록 수정(§7-12, G-2 5초 유예) ── */
	// 이미 예약(5초 유예)·전송 중인 수정이 있는 행은 '기록 수정'을 잠근다(FE-07 Low-2).
	// 시트는 서버 값(같은 approval_version)으로 열리므로 두 번째 수정은 409가 되고, 첫 전송
	// 끝의 delete가 두 번째 낙관값을 지운다. 되돌리기·전송 완료 뒤 correctionLocal이 지워지면 풀린다.
	const correctionLocked = (id: string) => !!correctionLocal[id] || !!busy[id];
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
				// 잠금은 재조회가 끝난 뒤에 푼다(먼저 풀면 재조회 중 두 번째 수정이 409). throw해도 푼다.
				try {
					await invalidateAll();
				} catch {
					// 재조회 실패는 다음 이동·새로고침 때 다시 읽는다(처리되지 않은 거부로 남기지 않음).
				} finally {
					delete correctionLocal[target.id];
				}
			},
			() => {
				toast.dismiss(toastId);
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

	const columns: Col<PortfolioRow>[] = [
		{ key: 'name', label: '종목', title: true, render: nameCell },
		{ key: 'qty', label: '수량', align: 'right', render: qtyCell },
		{ key: 'avg_price', label: '평균 단가', align: 'right', render: avgCell },
		{ key: 'breakeven', label: '손익분기 가격', align: 'right', render: breakevenCell },
		{ key: 'price', label: '현재가', align: 'right', render: priceCell },
		{ key: 'return', label: '수익률', align: 'right', render: returnCell },
		{ key: 'value_krw', label: '평가금액', align: 'right', render: valueCell },
		{ key: 'weight', label: '비중', align: 'right', render: weightCell },
		{ key: 'memo', label: '감시 가격까지', render: memoCell },
		{ key: 'actions', label: '작업', render: actionCell }
	];
</script>

{#snippet nameCell(r: PortfolioRow)}
	<div class="t-name">
		{positionLabel(r)}
		{#if r.status === 'planned'}
			<Badge tone="info">{r.watch_only ? '관심' : STATUS_LABEL.planned}</Badge>
		{:else if r.status === 'closed'}
			<Badge>{STATUS_LABEL.closed}</Badge>
		{/if}
		{#if r.open_status}<StatusBadge status={r.open_status} />{/if}
	</div>
	<div class="t-sub">
		{#if r.ticker}<span>{r.ticker}</span>{/if}
		<span class="ccy" data-testid="row-ccy">{r.currency}</span>
		{#if currencyMismatch(r)}
			<Badge tone="warn" icon="⚠" title="종목 시장·가격 기록의 통화와 보유 통화가 달라요"
				>통화 확인</Badge
			>
		{/if}
	</div>
{/snippet}

{#snippet qtyCell(r: PortfolioRow)}{qtyText(r)}{/snippet}

{#snippet avgCell(r: PortfolioRow)}
	<span>{avgText(r)}</span>
	{#if avgPending(r)}<span class="pending-note">입력 대기</span>{/if}
{/snippet}

{#snippet breakevenCell(r: PortfolioRow)}{unitText(r.breakeven, r.currency)}{/snippet}

{#snippet priceCell(r: PortfolioRow)}{priceText(r)}{/snippet}

{#snippet returnCell(r: PortfolioRow)}
	{@const v = rowReturnPct(r)}
	{#if v != null}<Delta value={v} digits={1} />{:else}—{/if}
{/snippet}

{#snippet valueCell(r: PortfolioRow)}
	{#if r.status === 'holding' && r.value_krw != null}<Money value={r.value_krw} />{:else}—{/if}
{/snippet}

{#snippet weightCell(r: PortfolioRow)}
	{@const w = rowWeightPct(r, summary.totalKrw)}
	{w != null ? pct1(w) : '—'}
{/snippet}

{#snippet memoCell(r: PortfolioRow)}
	{@const memo = memoLine(r.memo)}
	{@const t =
		r.status === 'closed'
			? null
			: triggerState({
					price: r.price,
					trigger: r.trigger_price,
					direction: r.trigger_direction,
					watchOnly: r.watch_only
				})}
	<div class="memo-cell">
		{#if t && t.state !== 'watch'}
			{@const d = DIRECTION_BADGE[t.direction]}
			<div class="memo-trig">
				<Badge tone={t.direction === 'above' ? 'info' : 'default'} icon={d.icon} title={d.title}
					>{d.label}</Badge
				>
				<span class="num">{unitText(r.trigger_price, r.currency)}</span>
				{#if 'distance' in t}<span class="num dist">{distanceLabel(t.distance)}</span>{/if}
				{#if t.state === 'warn'}<Badge tone="warn" icon="⚠">3% 이내</Badge>
				{:else if t.state === 'hit'}<Badge tone="accent" icon="✓">도달</Badge>
				{:else if t.state === 'unpriced'}<Badge>현재가 없음</Badge>{/if}
			</div>
			{#if 'distance' in t}<TriggerGauge distance={t.distance} />{/if}
		{:else if r.watch_only}
			<Badge>관심만</Badge>
		{/if}
		{#if memo}<span class="memo">{memo}</span>
		{:else if !t || (t.state === 'watch' && !r.watch_only)}<span class="memo">—</span>{/if}
	</div>
{/snippet}

{#snippet actionCell(r: PortfolioRow)}
	{#if correctable.has(r.id)}
		<button
			type="button"
			class="btn sm"
			data-action="correct"
			aria-disabled={correctionLocked(r.id) ? 'true' : undefined}
			onclick={() => {
				if (!correctionLocked(r.id))
					correctionTarget = data.holdings.find((x) => x.id === r.id) ?? null;
			}}>기록 수정<span class="sr-only"> · {positionLabel(r)}</span></button
		>
	{/if}
{/snippet}

<svelte:head><title>포트폴리오 · MO_WA</title></svelte:head>

<div class="pf" data-testid="portfolio-page">
	<div class="tiles" data-testid="portfolio-tiles">
		<MetricTile
			label="총 평가금액"
			foot={data.valuationError
				? '잠시 후 다시 시도해 주세요.'
				: summary.unpriced > 0
					? `평가금액 없는 ${summary.unpriced}종목 제외`
					: '평가금액 기준'}
		>
			{#snippet value()}
				{#if !data.valuationError && summary.totalKrw != null}<Money
						value={summary.totalKrw}
					/>{:else}—{/if}
			{/snippet}
		</MetricTile>
		<MetricTile
			label="평가손익"
			delta={data.valuationError ? undefined : (summary.pnlPct ?? undefined)}
			deltaDigits={1}
			foot={data.valuationError
				? '잠시 후 다시 시도해 주세요.'
				: summary.pnlCount < heldCount
					? `평균 단가·가격 있는 ${summary.pnlCount}종목 기준`
					: '수익률'}
		>
			{#snippet value()}
				{#if !data.valuationError && summary.pnlKrw != null}<Money
						value={summary.pnlKrw}
						plus
						tone="sign"
					/>{:else}—{/if}
			{/snippet}
		</MetricTile>
		<MetricTile
			label="달러 환율"
			value={!data.valuationError && usdkrw != null ? fx(usdkrw) : '—'}
			foot={data.valuationError
				? '잠시 후 다시 시도해 주세요.'
				: usdkrw != null
					? '달러 종목은 이 환율로 원화 환산'
					: '환율 기록 없음'}
		/>
		<MetricTile
			label="확인 대기"
			value="{data.pendingCount ?? 0}건"
			foot={data.portfolio?.holdCount != null
				? `보류 ${data.portfolio.holdCount}건 별도`
				: '보류 건수를 불러오지 못했어요'}
		/>
	</div>

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
		<Card class="c-12" flush title="보유·매수 계획">
			{#snippet aside()}
				{#if !data.positionsError && !data.portfolioError && rows.length > 0}
					<SegmentedControl
						ariaLabel="보유·매수 계획 구분"
						options={segOptions}
						value={segment}
						onchange={(v) => (segment = v)}
					/>
				{/if}
			{/snippet}
			<div id="holdings" class="anchor"></div>
			{#if data.positionsError || data.portfolioError}
				<div class="pad"><ErrorState desc="잠시 후 다시 시도해 주세요." /></div>
			{:else if rows.length === 0}
				<EmptyState
					icon="💼"
					title="아직 보유 기록이 없어요"
					desc="봇이 보낸 변경 요청을 반영하면 여기에 보여요."
				/>
			{:else}
				<div data-testid="portfolio-table">
					<DataTable
						{columns}
						rows={visibleRows}
						mobile="cards"
						caption="보유·매수 계획"
						rowKey={(r) => r.id}
					>
						{#snippet empty()}
							<p class="empty-row">
								{segment === 'planned' ? '매수 계획이 없어요' : '보유 중인 종목이 없어요'}
							</p>
						{/snippet}
					</DataTable>
				</div>
			{/if}
			<p class="foot-note" data-testid="g4-notice">{G4_NOTICE}</p>
		</Card>

		<Card class="c-5" title="자산 비중" sub="평가금액 기준">
			<div id="weights" class="anchor"></div>
			{#if data.positionsError || data.valuationError}
				<ErrorState desc="잠시 후 다시 시도해 주세요." />
			{:else if weights.length === 0}
				<EmptyState icon="◔" title="비중을 낼 평가금액이 없어요" />
			{:else}
				<DonutChart
					items={weights}
					ariaLabel="보유 종목 비중"
					total={summary.totalKrw ?? undefined}
					sub="총 평가금액"
					valueKind="KRW"
				/>
				<dl class="kv">
					<dt>달러 자산</dt>
					<dd class="num">{summary.usdSharePct != null ? pct1(summary.usdSharePct) : '—'}</dd>
				</dl>
			{/if}
		</Card>

		<Card class="c-7" title="종목별 수익률" sub="평균 단가 대비 %">
			{#if data.positionsError || data.portfolioError}
				<ErrorState desc="잠시 후 다시 시도해 주세요." />
			{:else if bars.length === 0}
				<EmptyState icon="📊" title="수익률을 낼 보유 종목이 없어요" />
			{:else}
				<BarChart items={bars} ariaLabel="종목별 평균 단가 대비 수익률" digits={1} />
			{/if}
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
						<span class="count">{attentionCount}건</span>
					</h3>
					<p class="attn-desc">
						반영 안 된 요청이 있어요(보유가 달라짐·기한 지남). <b>확인했어요</b>를 누르거나 문제가
						생긴 날부터 14일이 지나면 이 묶음에서 빠지고, 기록은 ‘지난 내역’에 그대로 남아요.
					</p>
					<div class="cards">
						{#each attentionList as item (item.id)}
							<QueueCard {item} mode="attention" busy={!!busy[item.id]} onack={doAck} />
						{/each}
					</div>
					{#if attentionTruncated}
						<p class="more" data-testid="attention-truncated">
							최근 {data.attentionLimit}건만 보여드려요. 처리하면 나머지가 보여요.
						</p>
					{/if}
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
									busy={!!busy[item.id] || siblingLocked(item)}
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
			{#if approveTarget.kind === 'principle'}
				<PrincipleBody text={approveTarget.body_preview} truncated={approveTarget.body_truncated} />
			{:else}
				<DiffTable rows={diffRows(approveTarget)} />
			{/if}
			<p class="sheet-note">
				{approveTarget.kind === 'principle'
					? '반영하면 투자 원칙이 이 본문으로 새로 개정되고 이력에 남아요.'
					: '반영하면 보유 기록의 수량·평균 단가가 바로 바뀌고 이력에 남아요.'} 반영 뒤
				<b>5초 안에 되돌릴 수 있어요</b>(5초가 지나야 저장돼요 · 그 전에 탭을 닫으면 저장되지
				않아요).
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
			{#if rejectTarget.kind === 'principle'}
				<PrincipleBody text={rejectTarget.body_preview} truncated={rejectTarget.body_truncated} />
			{:else}
				<DiffTable rows={diffRows(rejectTarget)} />
			{/if}
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
	/* 태블릿(640~1023): 비중 | 수익률 2열, PC: 5 | 7 */
	@media (min-width: 640px) {
		.grid > :global(.c-7),
		.grid > :global(.c-5) {
			grid-column: span 6;
		}
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
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 1023px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 639px) {
		.tiles {
			gap: 8px;
		}
	}
	.pad {
		padding: 0 16px 16px;
	}
	.t-name {
		font-weight: 600;
		overflow-wrap: anywhere;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
	}
	.t-sub {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
	}
	.ccy {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0 6px;
		border-radius: var(--radius-xs);
		border: 1px solid var(--color-line);
		color: var(--color-muted);
	}
	.pending-note {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.memo-cell {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 170px;
		text-align: left;
	}
	.memo-trig {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
		font-size: var(--text-xs);
	}
	.dist {
		font-weight: 700;
	}
	.memo {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		overflow-wrap: anywhere;
	}
	.empty-row {
		text-align: center;
		color: var(--color-subtle);
		padding: 16px 0;
	}
	.kv {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 12px;
		margin: 12px 0 0;
		padding-top: 12px;
		border-top: 1px solid var(--color-line);
		font-size: var(--text-sm);
	}
	.kv dt {
		color: var(--color-subtle);
	}
	.kv dd {
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
