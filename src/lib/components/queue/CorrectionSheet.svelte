<script lang="ts">
	/**
	 * 기록 수정 (DS §7-12, G-4, BE-19 apply_user_correction). 고쳐서 반영(§7-6b)과는 다른 기능 —
	 * 진입점(보유 행)·문구·이력 라벨을 공유하지 않는다(Sheet·DiffTable만 공유).
	 * 입력 시트 → 확인 시트('확인하고 반영') → onsubmit(부모가 G-2 5초 유예 후 ?/correct).
	 */
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import {
		checkCorrection,
		correctionPrefill,
		OVERRIDE_REASON_MAX,
		type Ccy,
		type CorrectionInputs,
		type CorrectionTarget
	} from '$lib/queue/proposals';
	import DiffTable from './DiffTable.svelte';

	let {
		target,
		onclose,
		onsubmit
	}: {
		target: CorrectionTarget | null;
		onclose: () => void;
		onsubmit: (input: {
			target: CorrectionTarget;
			qty: number;
			avg_price: number;
			currency: Ccy;
			reason: string;
		}) => void;
	} = $props();

	const uid = $props.id();
	let step = $state<'edit' | 'confirm'>('edit');
	let inputs = $state<CorrectionInputs>({ qty: '', avg_price: '', currency: 'KRW', reason: '' });
	let openedFor = $state<string | null>(null);

	$effect(() => {
		const id = target?.id ?? null;
		if (id === openedFor) return;
		openedFor = id;
		if (target) {
			inputs = correctionPrefill(target);
			step = 'edit';
		}
	});

	let check = $derived(target ? checkCorrection(target, inputs) : null);
	let integerQty = $derived(target?.asset_type === 'stock' || target?.asset_type === 'etf');

	function next() {
		if (!check) return;
		if (!check.ok) {
			const f = check.field;
			document.getElementById(`${uid}-${f ?? 'qty'}`)?.focus();
			return;
		}
		step = 'confirm';
	}

	function submit() {
		if (!target || !check?.ok) return;
		const v = check.values;
		if (v.qty == null || v.avg_price == null || !v.currency) return;
		onsubmit({
			target,
			qty: v.qty,
			avg_price: v.avg_price,
			currency: v.currency,
			reason: inputs.reason.trim()
		});
	}
</script>

<Sheet open={!!target && step === 'edit'} {onclose} title="기록 수정">
	{#if target}
		<div class="form" data-testid="correction-edit">
			<Banner tone="info"
				>표에서 직접 고치지 않고 이 시트에서 기록을 수정해요. 확인하면 <b>바로 반영</b>되고 활동
				기록에 남아요.</Banner
			>
			<label class="field" for="{uid}-name"
				>종목<input
					id="{uid}-name"
					class="mw-input"
					value={target.name}
					readonly
					aria-readonly="true"
				/></label
			>
			<div class="row2">
				<label class="field" for="{uid}-qty"
					>수량<input
						id="{uid}-qty"
						class="mw-input num"
						type="text"
						inputmode={integerQty ? 'numeric' : 'decimal'}
						autocomplete="off"
						bind:value={inputs.qty}
						aria-invalid={check?.field === 'qty' && inputs.qty !== correctionPrefill(target).qty
							? 'true'
							: undefined}
					/>{#if integerQty}<span class="hint">주식·ETF는 1주 단위로만 입력할 수 있어요</span
						>{/if}</label
				>
				<label class="field" for="{uid}-currency"
					>통화<select id="{uid}-currency" class="mw-select" bind:value={inputs.currency}>
						<option value="KRW">원 (KRW)</option>
						<option value="USD">달러 (USD)</option>
					</select></label
				>
			</div>
			<label class="field" for="{uid}-avg_price"
				>평균 단가<input
					id="{uid}-avg_price"
					class="mw-input num"
					type="text"
					inputmode="decimal"
					autocomplete="off"
					bind:value={inputs.avg_price}
				/><span class="hint">달러 종목은 달러 평균 단가로 입력해요(화면은 소수 2자리).</span></label
			>
			<label class="field" for="{uid}-reason"
				>수정 이유 (한 줄, 필수)<input
					id="{uid}-reason"
					class="mw-input"
					maxlength={OVERRIDE_REASON_MAX}
					bind:value={inputs.reason}
				/><span class="hint">최대 {OVERRIDE_REASON_MAX}자</span></label
			>
			<div>
				<p class="sub">바뀌는 내용 미리보기</p>
				{#if check && check.rows.length > 0}
					<DiffTable rows={check.rows} />
				{:else}
					<p class="sub">바뀐 값이 없어요. 수량·평균 단가·통화 중 하나를 바꿔 주세요.</p>
				{/if}
			</div>
		</div>
	{/if}
	{#snippet footer()}
		<p class="form-reason" class:ok={check?.ok} id="{uid}-msg" role="status" aria-live="polite">
			{check?.message ?? ''}
		</p>
		<button type="button" class="mw-btn" onclick={onclose}>취소</button>
		<button
			type="button"
			class="mw-btn primary"
			data-action="correction-next"
			aria-disabled={check?.ok ? undefined : 'true'}
			aria-describedby="{uid}-msg"
			onclick={next}>다음: 확인</button
		>
	{/snippet}
</Sheet>

<Sheet open={!!target && step === 'confirm'} {onclose} title="이대로 바로 반영할까요?">
	{#if target && check}
		<div class="form" data-testid="correction-confirm">
			<p class="sub">{target.name} · 직접 수정 <b>나</b></p>
			<DiffTable rows={check.rows} />
			<p class="reason"><b>수정 이유</b> {inputs.reason.trim()}</p>
			<Banner tone="info"
				>확인하면 <b>바로 반영</b>되고 활동 기록에 ‘내가 수정’으로 남아요. 변경 요청 목록에서 다시
				기다리지 않아요. 반영 뒤 <b>5초 안에 되돌릴 수 있어요</b>(5초가 지나야 저장돼요. 그 전에
				탭을 닫으면 저장되지 않아요).</Banner
			>
		</div>
	{/if}
	{#snippet footer()}
		<button type="button" class="mw-btn" onclick={() => (step = 'edit')}>다시 고치기</button>
		<button type="button" class="mw-btn primary" data-action="correction-submit" onclick={submit}
			>확인하고 반영</button
		>
	{/snippet}
</Sheet>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.row2 {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12px;
	}
	.hint,
	.sub {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.sub {
		margin-bottom: 6px;
	}
	.reason {
		font-size: var(--text-sm);
		color: var(--color-muted);
		overflow-wrap: anywhere;
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
		.row2 {
			grid-template-columns: minmax(0, 1fr);
		}
		.mw-input,
		.mw-select {
			font-size: 16px;
			height: 44px;
		}
	}
</style>
