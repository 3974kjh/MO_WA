<script lang="ts">
	/**
	 * FE-06 일지 작성·수정 폼(사용자). 서버 액션 `/journal?/create`·`?/update`로 보낸다.
	 * - 화면과 서버가 같은 validateJournalForm을 쓴다. 오류는 aria-describedby로 입력에 잇는다.
	 *   규칙 번호는 일반 화면에 보이지 않고(용어집 v1.3) `data-rule`로만 싣는다.
	 * - buy/sell: 종목·가격·수량·통화 필수. 그 밖은 종목 선택 + 연결 종목(tickers[], instruments 코드만).
	 * - 통화 기본값은 종목 시장 통화. 다르면 주의만 보인다(저장은 됨).
	 * - 모바일 입력 16px(iOS 확대 방지).
	 */
	import { deserialize } from '$app/forms';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import {
		JOURNAL_CURRENCIES,
		JOURNAL_TITLE_MAX,
		emptyJournalForm,
		firstIssueByField,
		isTradeKind,
		journalFormFromItem,
		marketCurrency,
		qtyStep,
		validateJournalForm,
		type FormIssue,
		type JournalField,
		type JournalFormInput
	} from '$lib/journal/form';
	import {
		JOURNAL_STATE_LABEL,
		JOURNAL_STATES,
		dotDate,
		type InstrumentOption,
		type JournalItem,
		type ReportOption
	} from '$lib/journal/view';
	import { JOURNAL_TYPE_LABEL, JOURNAL_TYPES } from '$lib/routing/listQuery';

	let {
		item = null,
		instruments,
		reports,
		today,
		onsaved,
		oncancel
	}: {
		/** 수정할 행. 없으면 새로 쓰기 */
		item?: JournalItem | null;
		instruments: InstrumentOption[];
		reports: ReportOption[];
		today: string;
		onsaved: (r: { id: string; trade: boolean; created: boolean }) => void;
		oncancel: () => void;
	} = $props();

	const uid = $props.id();
	const initial = untrack(() => (item ? journalFormFromItem(item) : emptyJournalForm(today)));
	let v = $state<JournalFormInput>(initial);
	const clientRef = untrack(() =>
		item ? '' : typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : ''
	);
	let tried = $state(false);
	let busy = $state(false);
	let serverIssues = $state<FormIssue[]>([]);
	let serverMessage = $state('');
	let addTicker = $state('');

	let editingInstrumentId = untrack(() => item?.instrument_id ?? null);
	/** 새로 고를 수 있는 종목: 보관되지 않은 것 + 이 행이 이미 가리키던 종목 */
	let choosable = $derived(instruments.filter((i) => !i.archived || i.id === editingInstrumentId));
	let trade = $derived(isTradeKind(v.kind));
	let instrument = $derived(instruments.find((i) => i.id === v.instrument_id) ?? null);
	let check = $derived(validateJournalForm(v, instruments));
	let issues = $derived(
		firstIssueByField([...(tried && !check.ok ? check.errors : []), ...serverIssues])
	);
	let warnings = $derived(firstIssueByField(check.warnings));
	let tickerChoices = $derived(
		choosable.filter((i) => !v.tickers.includes(i.ticker) && i.id !== v.instrument_id)
	);

	function onInstrumentChange() {
		const cur = marketCurrency(instrument?.market);
		if (cur && !v.currency) v.currency = cur;
	}

	function addTickerCode() {
		const t = addTicker;
		if (t && !v.tickers.includes(t)) v.tickers = [...v.tickers, t];
		addTicker = '';
	}
	function removeTicker(t: string) {
		v.tickers = v.tickers.filter((x) => x !== t);
	}

	const errId = (f: JournalField) => `${uid}-${f}-err`;
	const described = (f: JournalField) =>
		[issues[f] ? errId(f) : '', warnings[f] ? `${uid}-${f}-warn` : ''].filter(Boolean).join(' ') ||
		undefined;

	let formEl = $state<HTMLFormElement>();

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		tried = true;
		serverIssues = [];
		serverMessage = '';
		if (!check.ok) {
			const first = check.errors[0]?.field;
			if (first) formEl?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
			return;
		}
		if (busy) return;
		busy = true;
		const body = new FormData();
		for (const [k, val] of Object.entries(v)) {
			if (k === 'tickers') continue;
			body.set(k, val == null ? '' : String(val));
		}
		for (const t of v.tickers) body.append('tickers', t);
		if (item) body.set('id', item.id);
		else if (clientRef) body.set('client_ref', clientRef);
		try {
			const res = await fetch(`${resolve('/journal')}?/${item ? 'update' : 'create'}`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				const d = (result.data ?? {}) as { id?: unknown; trade?: unknown };
				onsaved({
					id: typeof d.id === 'string' ? d.id : (item?.id ?? ''),
					trade: d.trade === true,
					created: !item
				});
				return;
			}
			const d = (result.type === 'failure' ? (result.data ?? {}) : {}) as {
				issues?: unknown;
				message?: unknown;
			};
			serverIssues = Array.isArray(d.issues) ? (d.issues as FormIssue[]) : [];
			serverMessage =
				typeof d.message === 'string'
					? d.message
					: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
		} catch {
			serverMessage = '저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
		} finally {
			busy = false;
		}
	}

	let summary = $derived(
		serverMessage || (tried && !check.ok ? `확인할 항목 ${check.errors.length}개가 있어요.` : '')
	);
</script>

{#snippet err(f: JournalField)}
	{#if issues[f]}<span class="err" id={errId(f)} data-rule={issues[f]?.rule}
			>{issues[f]?.message}</span
		>{/if}
	{#if warnings[f]}<span class="warn" id="{uid}-{f}-warn" data-rule={warnings[f]?.rule}
			>⚠ {warnings[f]?.message}</span
		>{/if}
{/snippet}

<form
	bind:this={formEl}
	class="jform"
	data-testid="journal-form"
	novalidate
	onsubmit={submit}
	aria-describedby="{uid}-summary"
>
	<div class="row2">
		<label class="field"
			>날짜<input
				class="num input"
				type="date"
				name="entry_date"
				required
				bind:value={v.entry_date}
				aria-invalid={issues.entry_date ? 'true' : undefined}
				aria-describedby={described('entry_date')}
			/>{@render err('entry_date')}</label
		>
		<label class="field"
			>구분<select
				class="input"
				name="kind"
				bind:value={v.kind}
				aria-invalid={issues.kind ? 'true' : undefined}
				aria-describedby={described('kind')}
			>
				{#each JOURNAL_TYPES as k (k)}<option value={k}>{JOURNAL_TYPE_LABEL[k]}</option>{/each}
			</select>{@render err('kind')}</label
		>
	</div>
	<label class="field"
		>상태<select
			class="input"
			name="state"
			bind:value={v.state}
			aria-invalid={issues.state ? 'true' : undefined}
			aria-describedby={described('state')}
		>
			{#each JOURNAL_STATES as s (s)}<option value={s}>{JOURNAL_STATE_LABEL[s]}</option>{/each}
		</select>{@render err('state')}</label
	>
	<label class="field"
		>제목<input
			class="input"
			name="title"
			maxlength={JOURNAL_TITLE_MAX}
			required
			bind:value={v.title}
			aria-invalid={issues.title ? 'true' : undefined}
			aria-describedby={described('title')}
		/>{@render err('title')}</label
	>
	<label class="field"
		>종목{#if trade}<span class="req"> (필수)</span>{/if}<select
			class="input"
			name="instrument_id"
			bind:value={v.instrument_id}
			onchange={onInstrumentChange}
			aria-required={trade ? 'true' : undefined}
			aria-invalid={issues.instrument_id ? 'true' : undefined}
			aria-describedby={described('instrument_id')}
		>
			<option value="">{trade ? '종목을 골라 주세요' : '선택 안 함'}</option>
			{#each choosable as i (i.id)}<option value={i.id}>{i.name} ({i.ticker})</option>{/each}
		</select>{@render err('instrument_id')}</label
	>
	{#if !trade}
		<div class="field">
			<span id="{uid}-tickers-label">연결 종목</span>
			{#if v.tickers.length > 0}
				<ul class="chips" aria-labelledby="{uid}-tickers-label">
					{#each v.tickers as t (t)}
						<li>
							<span class="mw-chip">{t}</span><button
								type="button"
								class="x"
								aria-label="{t} 연결 빼기"
								onclick={() => removeTicker(t)}>×</button
							>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="addrow">
				<select
					class="input"
					name="tickers"
					aria-labelledby="{uid}-tickers-label"
					aria-invalid={issues.tickers ? 'true' : undefined}
					aria-describedby={described('tickers')}
					bind:value={addTicker}
				>
					<option value="">종목 목록에서 고르기</option>
					{#each tickerChoices as i (i.id)}<option value={i.ticker}>{i.name} ({i.ticker})</option
						>{/each}
				</select>
				<button
					type="button"
					class="btn preset-outlined-surface-500"
					disabled={!addTicker}
					onclick={addTickerCode}>추가</button
				>
			</div>
			{@render err('tickers')}
		</div>
	{/if}
	<div class="row3">
		<label class="field"
			>가격{#if trade}<span class="req"> (필수)</span>{/if}<input
				class="num input"
				name="price"
				inputmode="decimal"
				bind:value={v.price}
				aria-required={trade ? 'true' : undefined}
				aria-invalid={issues.price ? 'true' : undefined}
				aria-describedby={described('price')}
			/>{@render err('price')}</label
		>
		<label class="field"
			>수량{#if trade}<span class="req"> (필수)</span>{/if}<input
				class="num input"
				name="qty"
				type="number"
				min="0"
				step={qtyStep(instrument?.asset_type)}
				inputmode="decimal"
				bind:value={v.qty}
				aria-required={trade ? 'true' : undefined}
				aria-invalid={issues.qty ? 'true' : undefined}
				aria-describedby={described('qty')}
			/>{@render err('qty')}</label
		>
		<label class="field"
			>통화{#if trade}<span class="req"> (필수)</span>{/if}<select
				class="input"
				name="currency"
				bind:value={v.currency}
				aria-required={trade ? 'true' : undefined}
				aria-invalid={issues.currency ? 'true' : undefined}
				aria-describedby={described('currency')}
			>
				<option value="">선택</option>
				{#each JOURNAL_CURRENCIES as c (c)}<option value={c}
						>{c === 'KRW' ? '원(KRW)' : '달러(USD)'}</option
					>{/each}
			</select>{@render err('currency')}</label
		>
	</div>
	<label class="field"
		>메모<textarea
			class="textarea"
			name="memo_md"
			rows="4"
			bind:value={v.memo_md}
			aria-describedby={described('memo_md')}
		></textarea>{@render err('memo_md')}</label
	>
	<label class="field"
		>출처 주소<input
			class="input"
			name="source_url"
			type="url"
			inputmode="url"
			placeholder="https://"
			bind:value={v.source_url}
			aria-invalid={issues.source_url ? 'true' : undefined}
			aria-describedby={described('source_url')}
		/>{@render err('source_url')}</label
	>
	<label class="field"
		>리포트 연결<select
			class="input"
			name="report_id"
			bind:value={v.report_id}
			aria-invalid={issues.report_id ? 'true' : undefined}
			aria-describedby={described('report_id')}
		>
			<option value="">연결 안 함</option>
			{#if v.report_id && !reports.some((r) => r.id === v.report_id)}
				<option value={v.report_id}>지금 연결된 리포트</option>
			{/if}
			{#each reports as r (r.id)}<option value={r.id}>{dotDate(r.report_date)} · {r.title}</option
				>{/each}
		</select>{@render err('report_id')}</label
	>
	{#if trade}
		<p class="note">
			매수·매도 기록은 보유 기록을 바로 바꾸지 않아요. 포지션 반영은 변경 요청에서 해요.
		</p>
	{/if}
	<p class="summary" id="{uid}-summary" role="status" aria-live="polite">{summary}</p>
	<div class="foot">
		<button type="button" class="btn preset-outlined-surface-500" onclick={oncancel}>취소</button>
		<button
			type="submit"
			class="btn-primary-m btn preset-filled-brand"
			aria-disabled={busy ? 'true' : undefined}>{item ? '수정 저장' : '저장'}</button
		>
	</div>
</form>

<style>
	.jform {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--text-sm);
		font-weight: 600;
		min-width: 0;
	}
	.row2,
	.row3 {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1fr;
	}
	.row3 {
		grid-template-columns: 1fr 1fr 1fr;
	}
	@media (max-width: 479px) {
		.row3 {
			grid-template-columns: 1fr 1fr;
		}
	}
	/* 높이·테두리(링)·포커스·오류·모바일 16px는 Skeleton input + skeleton-overrides.css */
	.input,
	.textarea {
		width: 100%;
		font-weight: 400;
	}
	.textarea {
		min-height: 96px;
		resize: vertical;
	}
	.err {
		color: var(--color-text);
		font-weight: 400;
	}
	.err::before {
		content: '✕ ';
		color: var(--color-up);
	}
	.warn {
		color: var(--color-muted);
		font-weight: 400;
	}
	.req {
		color: var(--color-muted);
		font-weight: 400;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.chips li {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		border: 1px solid var(--color-line-strong);
		border-radius: 999px;
		padding-left: 10px;
	}
	.mw-chip {
		font-weight: 400;
	}
	.x {
		min-width: 32px;
		min-height: 32px;
		border: 0;
		background: transparent;
		color: var(--color-muted);
		cursor: pointer;
	}
	.addrow {
		display: flex;
		gap: 8px;
	}
	.note,
	.summary {
		font-size: var(--text-sm);
		color: var(--color-muted);
		margin: 0;
	}
	.summary:empty {
		display: none;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		position: sticky;
		bottom: 0;
		background: var(--color-surface);
		padding-top: 8px;
	}
</style>
