import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetCategory } from '$lib/components/datagrid/types';
import type { Database } from '$lib/types/database.types';
import type { LiabilityFormValues } from '$lib/types/liability';
import { toLiabilityGridRow } from '$lib/types/liability';

export async function loadLiabilities(supabase: SupabaseClient<Database>) {
	const { data, error } = await supabase
		.from('liabilities')
		.select('*')
		.order('due_at', { ascending: true, nullsFirst: false });

	if (error) {
		return { liabilities: [], error: '부채 데이터를 불러오지 못했습니다.' };
	}

	return { liabilities: data.map(toLiabilityGridRow), error: null };
}

export function parseLiabilityForm(form: FormData): LiabilityFormValues | ReturnType<typeof fail> {
	const name = String(form.get('name') ?? '').trim();
	const liabilityType = String(form.get('liabilityType') ?? '').trim();
	const assetIdRaw = String(form.get('assetId') ?? '').trim();
	const principalAmount = Number(form.get('principalAmount') ?? 0);
	const remainingAmount = Number(form.get('remainingAmount') ?? 0);
	const interestRateRaw = String(form.get('interestRate') ?? '').trim();
	const startedAt = nullableString(form.get('startedAt'));
	const dueAt = nullableString(form.get('dueAt'));

	if (!name || !liabilityType) {
		return fail(400, { message: '부채명과 유형은 필수입니다.' });
	}

	if (!Number.isFinite(principalAmount) || !Number.isFinite(remainingAmount)) {
		return fail(400, { message: '원금과 잔액은 숫자로 입력해 주세요.' });
	}

	return {
		assetId: assetIdRaw || null,
		name,
		liabilityType,
		principalAmount,
		remainingAmount,
		interestRate: interestRateRaw ? Number(interestRateRaw) : null,
		startedAt,
		dueAt,
		memo: nullableString(form.get('memo'))
	};
}

export function toLiabilityInsert(values: LiabilityFormValues, userId: string) {
	return {
		user_id: userId,
		asset_id: values.assetId,
		name: values.name,
		liability_type: values.liabilityType,
		principal_amount: values.principalAmount,
		remaining_amount: values.remainingAmount,
		interest_rate: values.interestRate,
		started_at: values.startedAt,
		due_at: values.dueAt,
		memo: values.memo
	};
}

export function toLiabilityUpdate(values: LiabilityFormValues) {
	return {
		asset_id: values.assetId,
		name: values.name,
		liability_type: values.liabilityType,
		principal_amount: values.principalAmount,
		remaining_amount: values.remainingAmount,
		interest_rate: values.interestRate,
		started_at: values.startedAt,
		due_at: values.dueAt,
		memo: values.memo,
		updated_at: new Date().toISOString()
	};
}

export async function loadAssetCategories(supabase: SupabaseClient<Database>) {
	const { data, error } = await supabase
		.from('asset_categories')
		.select('*')
		.order('category')
		.order('name');

	if (error) {
		return { categories: [], error: '카테고리를 불러오지 못했습니다.' };
	}

	return { categories: data, error: null };
}

export async function ensurePresetCategories(
	supabase: SupabaseClient<Database>,
	userId: string,
	presets: Array<{ category: AssetCategory; name: string }>
) {
	const { data: existing } = await supabase
		.from('asset_categories')
		.select('category, name')
		.eq('user_id', userId);

	const existingKeys = new Set((existing ?? []).map((row) => `${row.category}:${row.name}`));
	const missing = presets.filter(
		(preset) => !existingKeys.has(`${preset.category}:${preset.name}`)
	);

	if (missing.length === 0) return;

	await supabase.from('asset_categories').insert(
		missing.map((preset) => ({
			user_id: userId,
			category: preset.category,
			name: preset.name
		}))
	);
}

function nullableString(value: FormDataEntryValue | null) {
	const text = String(value ?? '').trim();
	return text ? text : null;
}
