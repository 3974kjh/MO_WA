import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import {
	toCashflowGridItem,
	type CashflowCadence,
	type CashflowDirection,
	type CashflowFormValues
} from '$lib/types/cashflow';

const directions = new Set<CashflowDirection>(['income', 'expense']);
const cadences = new Set<CashflowCadence>(['monthly', 'yearly']);

export async function loadCashflows(supabase: SupabaseClient<Database>) {
	const { data, error } = await supabase
		.from('cashflow_items')
		.select('*')
		.order('direction', { ascending: false })
		.order('created_at', { ascending: false });

	if (error) {
		return { cashflows: [], error: '고정 수입/지출 데이터를 불러오지 못했습니다.' };
	}

	return { cashflows: data.map(toCashflowGridItem), error: null };
}

export function parseCashflowForm(form: FormData): CashflowFormValues | ReturnType<typeof fail> {
	const name = String(form.get('name') ?? '').trim();
	const direction = String(form.get('direction') ?? '');
	const cadence = String(form.get('cadence') ?? '');
	const amount = Number(form.get('amount') ?? 0);

	if (!name) return fail(400, { message: '고정 수입/지출 이름을 입력해 주세요.' });
	if (!directions.has(direction as CashflowDirection)) {
		return fail(400, { message: '수입 또는 지출을 선택해 주세요.' });
	}
	if (!cadences.has(cadence as CashflowCadence)) {
		return fail(400, { message: '월 또는 년 단위를 선택해 주세요.' });
	}
	if (!Number.isFinite(amount) || amount <= 0) {
		return fail(400, { message: '금액은 0보다 큰 숫자로 입력해 주세요.' });
	}

	return {
		name,
		direction: direction as CashflowDirection,
		cadence: cadence as CashflowCadence,
		amount,
		category: nullableString(form.get('category')),
		startDate: nullableString(form.get('startDate')),
		endDate: nullableString(form.get('endDate')),
		memo: nullableString(form.get('memo'))
	};
}

export function toCashflowInsert(values: CashflowFormValues, userId: string) {
	return {
		user_id: userId,
		name: values.name,
		direction: values.direction,
		cadence: values.cadence,
		amount: values.amount,
		category: values.category,
		start_date: values.startDate,
		end_date: values.endDate,
		memo: values.memo
	};
}

export function toCashflowUpdate(values: CashflowFormValues) {
	return {
		name: values.name,
		direction: values.direction,
		cadence: values.cadence,
		amount: values.amount,
		category: values.category,
		start_date: values.startDate,
		end_date: values.endDate,
		memo: values.memo,
		updated_at: new Date().toISOString()
	};
}

function nullableString(value: FormDataEntryValue | null) {
	const text = String(value ?? '').trim();
	return text ? text : null;
}
