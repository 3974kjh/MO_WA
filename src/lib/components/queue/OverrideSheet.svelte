<script lang="ts">
	/**
	 * 고쳐서 반영(override) — DS §7-6b. 편집 시트(3열 diff + 고친 이유) → 최종 확인 시트(읽기 전용) → onsubmit.
	 * - 입력은 그 change_type의 허용 키만(open_holding: 수량·평균 단가·통화 / set_qty_avg: 수량·평균 단가).
	 *   감시 가격·방향·손익분기 가격·관심만 입력란은 만들지 않는다.
	 * - 미리 막힘·서버 결과(반영 안 됨)면 배너 + 입력 잠금, '다음'은 aria-disabled + 이유 문장.
	 * - 기록 수정(§7-12)과 문구·진입점을 공유하지 않는다(Sheet만 공유).
	 */
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import {
		buildOverrides,
		changeTypeLabel,
		checkOverrideDraft,
		diff3Rows,
		FIELD_LABEL,
		formatField,
		isPreBlocked,
		itemTitle,
		nowValues,
		OVERRIDE_REASON_MAX,
		overrideKeys,
		prefill,
		preBlockedNote,
		readMine,
		type FieldValues,
		type OverrideKey,
		type QueueItem
	} from '$lib/queue/proposals';
	import Diff3 from './Diff3.svelte';

	let {
		item,
		conflict = false,
		onclose,
		onsubmit
	}: {
		/** 열 대상. null이면 닫힘 */
		item: QueueItem | null;
		/** 서버가 반영 안 됨(보유가 달라짐)을 돌려준 뒤 다시 연 경우 */
		conflict?: boolean;
		onclose: () => void;
		onsubmit: (input: {
			item: QueueItem;
			overrides: Record<string, unknown>;
			mine: FieldValues;
			note: string;
		}) => void;
	} = $props();

	const uid = $props.id();
	let step = $state<'edit' | 'confirm'>('edit');
	let inputs = $state<Record<OverrideKey, string>>({ qty: '', avg_price: '', currency: '' });
	let reason = $state('');
	let openedFor = $state<string | null>(null);

	$effect(() => {
		const id = item?.id ?? null;
		if (id === openedFor) return;
		openedFor = id;
		if (item) {
			inputs = prefill(item);
			reason = '';
			step = 'edit';
		}
	});

	let keys = $derived(item ? overrideKeys(item) : []);
	let mine = $derived(item ? readMine(item, inputs) : {});
	let check = $derived(
		item
			? checkOverrideDraft(item, mine, reason, { conflict })
			: { ok: false, message: '', field: null, invalid: [] }
	);
	let rows3 = $derived(item ? diff3Rows(item, mine) : []);
	let blocked = $derived(!!item && isPreBlocked(item));
	let locked = $derived(blocked || conflict);

	function focusFirst() {
		const f = check.field;
		const el = document.getElementById(f === 'reason' ? `${uid}-why` : `${uid}-${f}`);
		el?.focus();
	}

	function next() {
		if (!check.ok) {
			focusFirst();
			return;
		}
		step = 'confirm';
	}

	function submit() {
		if (!item || !check.ok) return;
		const overrides = buildOverrides(item, mine);
		if (!overrides) return;
		onsubmit({ item, overrides, mine, note: reason.trim() });
	}
</script>

<Sheet
	open={!!item && step === 'edit'}
	{onclose}
	title={item ? `고쳐서 반영 · ${item.display_id}` : '고쳐서 반영'}
>
	{#if item}
		<div class="form" data-testid="override-edit">
			<p class="ov-meta">
				<span class="ctype">{changeTypeLabel(item.change_type)}</span>
				<span>{itemTitle(item)}</span>
				<span>· 요청한 봇 {item.proposer_name}</span>
			</p>
			<Banner tone="info"
				>봇 요청 값을 바탕으로 <b>이 요청이 바꾸는 항목만</b> 고쳐서 반영해요. 반영하면 바로
				적용되고, 봇 요청 값과 다르면 이력에 <b>반영됨 · 값 고침</b>으로 남아요.</Banner
			>
			{#if conflict}
				<Banner tone="err"
					><b>반영 안 됨(보유가 달라짐)</b> 반영하는 사이에 보유 기록이 바뀌어 반영하지 않았어요. 이 요청은
					‘확인 필요’로 옮겨졌어요. 새 요청이 필요해요.</Banner
				>
			{:else if blocked}
				<Banner tone="err"
					><b>지금은 반영할 수 없어요</b>
					{preBlockedNote(item)} 값을 고쳐도 반영되지 않아요.</Banner
				>
			{/if}

			<div class="d3" role="table" aria-label="지금 · 봇 요청 값 · 내가 고친 값(입력)">
				<div role="row" class="row head">
					<span role="columnheader">항목</span>
					<span role="columnheader">지금</span>
					<span role="columnheader">봇 요청 값</span>
					<span role="columnheader">내가 고친 값</span>
				</div>
				{#each keys as k (k)}
					{@const changed = rows3.find((r) => r.key === k)?.changed ?? false}
					<div role="row" class="row">
						<span role="rowheader" class="k">{FIELD_LABEL[k]}</span>
						<span role="cell" class="cur num"
							><span class="lbl">지금</span>{formatField(
								k,
								nowValues(item)[k],
								item.currency,
								item.asset_type
							)}</span
						>
						<span role="cell" class="bot num"
							><span class="lbl">봇 요청 값</span>{formatField(
								k,
								item.proposed_values[k],
								item.currency,
								item.asset_type
							)}</span
						>
						<span role="cell" class="mine" class:changed>
							<label class="lbl" for="{uid}-{k}">내가 고친 값</label>
							{#if k === 'currency'}
								<select
									id="{uid}-{k}"
									class="select"
									bind:value={inputs.currency}
									disabled={locked}
									aria-label="내가 고친 통화"
									aria-invalid={check.invalid.includes(k) ? 'true' : undefined}
								>
									<option value="KRW">원 (KRW)</option>
									<option value="USD">달러 (USD)</option>
								</select>
							{:else}
								<input
									id="{uid}-{k}"
									class="input num"
									type="text"
									autocomplete="off"
									inputmode={k === 'qty' ? 'numeric' : 'decimal'}
									bind:value={inputs[k]}
									disabled={locked}
									aria-label="내가 고친 {FIELD_LABEL[k]}"
									aria-invalid={check.invalid.includes(k) ? 'true' : undefined}
								/>
							{/if}
						</span>
					</div>
				{/each}
			</div>
			<p class="locked">
				고칠 수 있는 항목: <b>{keys.map((k) => FIELD_LABEL[k]).join('·')}</b>{item.change_type ===
				'set_qty_avg'
					? ' (이 유형은 통화를 바꿀 수 없어요)'
					: ''}.{item.currency === 'USD'
					? ' 달러 평균 단가는 화면에서 소수 2자리로 보여요(저장은 4자리).'
					: ''} 감시 가격·방향·손익분기 가격·관심만은 봇이 직접 기록하는 값이라 여기서 고칠 수 없어요.
			</p>
			<label class="field" for="{uid}-why">
				고친 이유 (한 줄, 필수)
				<input
					id="{uid}-why"
					class="input"
					maxlength={OVERRIDE_REASON_MAX}
					bind:value={reason}
					disabled={locked}
					aria-describedby="{uid}-whyn"
				/>
				<span class="hint" id="{uid}-whyn"
					><span class="num">{[...reason].length}</span>/{OVERRIDE_REASON_MAX}자 · 활동 기록과
					이력에 남아요</span
				>
			</label>
		</div>
	{/if}
	{#snippet footer()}
		<p class="form-reason" class:ok={check.ok} id="{uid}-msg" role="status" aria-live="polite">
			{check.message}
		</p>
		<button type="button" class="btn" onclick={onclose}>취소</button>
		<button
			type="button"
			class="btn primary"
			data-action="override-next"
			aria-disabled={check.ok ? undefined : 'true'}
			aria-describedby="{uid}-msg"
			onclick={next}>다음: 확인</button
		>
	{/snippet}
</Sheet>

<Sheet open={!!item && step === 'confirm'} {onclose} title="고친 값으로 반영할까요?">
	{#if item}
		<div class="form" data-testid="override-confirm">
			<Diff3 rows={rows3} />
			<p class="hist-mod"><b>고친 이유</b> {reason.trim()}</p>
			<p class="note">
				반영하면 보유 기록의 수량·평균 단가가 <b>내가 고친 값</b>으로 바로 바뀌고, 이력에
				<b>반영됨 · 값 고침</b>으로 남아요. 반영 뒤 <b>5초 안에 되돌릴 수 있어요</b>(5초가 지나야
				저장돼요 · 그 전에 탭을 닫으면 저장되지 않아요).
			</p>
		</div>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (step = 'edit')}>다시 고치기</button>
		<button
			type="button"
			class="btn primary"
			data-action="override-submit"
			aria-disabled={check.ok ? undefined : 'true'}
			onclick={submit}>고쳐서 반영</button
		>
	{/snippet}
</Sheet>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.ov-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		align-items: center;
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.ctype {
		font-size: var(--text-xs);
		color: var(--color-muted);
		background: var(--color-surface-2);
		padding: 1px 6px;
		border-radius: var(--radius-xs);
	}
	.d3 {
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		overflow: hidden;
		font-size: var(--text-sm);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(64px, auto) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
		border-top: 1px solid var(--color-line);
	}
	.row:first-child {
		border-top: 0;
	}
	.row > span {
		padding: 8px 10px;
		min-width: 0;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px 6px;
		overflow-wrap: anywhere;
	}
	.head > span {
		background: var(--color-surface-2);
		color: var(--color-muted);
		font-weight: 600;
		font-size: var(--text-xs);
	}
	.k {
		font-weight: 600;
		background: var(--color-surface-2);
	}
	.cur {
		color: var(--color-muted);
	}
	.mine.changed {
		background: var(--color-accent-soft);
	}
	.mine .input,
	.mine .select {
		width: 100%;
	}
	.lbl {
		display: none;
	}
	.locked,
	.hint {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.hist-mod {
		font-size: var(--text-sm);
		color: var(--color-muted);
		background: var(--color-surface-2);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
		overflow-wrap: anywhere;
	}
	.note {
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.form-reason {
		flex: 1 1 100%;
		font-size: var(--text-sm);
		color: var(--color-muted);
		margin: 0;
	}
	.form-reason.ok {
		color: var(--color-ok);
	}
	@media (max-width: 639px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}
		.head {
			display: none;
		}
		.row > span {
			padding: 4px 12px;
		}
		.k {
			padding-top: 10px;
		}
		.mine {
			padding-bottom: 10px;
		}
		.lbl {
			display: inline-block;
			min-width: 72px;
			color: var(--color-subtle);
			font-size: var(--text-xs);
			font-weight: 600;
		}
		.mine .input,
		.mine .select {
			flex: 1 1 140px;
			font-size: 16px;
			height: 44px;
		}
	}
</style>
