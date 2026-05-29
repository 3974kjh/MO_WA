import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetCategory, AssetCurrency } from '$lib/components/datagrid/types';
import type { AssetFormValues } from '$lib/types/asset';
import { toAssetGridRow } from '$lib/types/asset';
import type { Database } from '$lib/types/database.types';

const assetCategories = new Set<AssetCategory>(['real_estate', 'investment', 'cash', 'liability']);
const assetCurrencies = new Set<AssetCurrency>(['KRW', 'USD', 'BTC', 'ETH', 'XAU', 'XAG']);

export async function loadAssetRows(supabase: SupabaseClient<Database>) {
	const { data, error } = await supabase
		.from('assets')
		.select('*')
		.order('valuation_date', { ascending: false })
		.order('created_at', { ascending: false });

	if (error) {
		return { rows: [], error: '자산 데이터를 불러오지 못했습니다.' };
	}

	return { rows: data.map(toAssetGridRow), error: null };
}

export function parseAssetForm(form: FormData): AssetFormValues | ReturnType<typeof fail> {
	const category = String(form.get('category') ?? '');
	const currency = String(form.get('currency') ?? 'KRW');
	const name = String(form.get('name') ?? '').trim();
	const subcategory = String(form.get('subcategory') ?? '').trim();
	const valuationDate = String(form.get('valuationDate') ?? '').trim();
	const principalAmount = Number(form.get('principalAmount') ?? 0);
	const currentValue = Number(form.get('currentValue') ?? 0);
	const annualRateRaw = String(form.get('annualRate') ?? '').trim();
	const monthlyContributionRaw = String(form.get('monthlyContribution') ?? '').trim();
	const tagsRaw = String(form.get('tags') ?? '').trim();
	const maturityDateRaw = String(form.get('maturityDate') ?? '').trim();
	const contributionEndDateRaw = String(form.get('contributionEndDate') ?? '').trim();

	if (!assetCategories.has(category as AssetCategory)) {
		return fail(400, { message: '자산 유형을 선택해 주세요.' });
	}

	if (!assetCurrencies.has(currency as AssetCurrency)) {
		return fail(400, { message: '지원하는 통화를 선택해 주세요.' });
	}

	if (!name || !subcategory || !valuationDate) {
		return fail(400, { message: '자산명, 하위 카테고리, 평가일은 필수입니다.' });
	}

	if (!Number.isFinite(principalAmount) || !Number.isFinite(currentValue)) {
		return fail(400, { message: '원금과 현재가치는 숫자로 입력해 주세요.' });
	}

	if (monthlyContributionRaw && !Number.isFinite(Number(monthlyContributionRaw))) {
		return fail(400, { message: '월 납입액은 숫자로 입력해 주세요.' });
	}

	return {
		category: category as AssetCategory,
		subcategory,
		name,
		institution: nullableString(form.get('institution')),
		principalAmount,
		currentValue,
		currency: currency as AssetCurrency,
		valuationDate,
		annualRate: annualRateRaw ? Number(annualRateRaw) : null,
		memo: nullableString(form.get('memo')),
		tags: tagsRaw
			? tagsRaw
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			: [],
		maturityDate: maturityDateRaw || null,
		monthlyContribution: monthlyContributionRaw ? Number(monthlyContributionRaw) : null,
		contributionEndDate: contributionEndDateRaw || null
	};
}

export function toAssetInsert(values: AssetFormValues, userId: string) {
	return {
		user_id: userId,
		category: values.category,
		subcategory: values.subcategory,
		name: values.name,
		institution: values.institution,
		principal_amount: values.principalAmount,
		current_value: values.currentValue,
		currency: values.currency,
		valuation_date: values.valuationDate,
		annual_rate: values.annualRate,
		memo: values.memo,
		tags: values.tags,
		maturity_date: values.maturityDate,
		monthly_contribution: values.monthlyContribution,
		contribution_end_date: values.contributionEndDate
	};
}

export function toAssetUpdate(values: AssetFormValues) {
	return {
		category: values.category,
		subcategory: values.subcategory,
		name: values.name,
		institution: values.institution,
		principal_amount: values.principalAmount,
		current_value: values.currentValue,
		currency: values.currency,
		valuation_date: values.valuationDate,
		annual_rate: values.annualRate,
		memo: values.memo,
		tags: values.tags,
		maturity_date: values.maturityDate,
		monthly_contribution: values.monthlyContribution,
		contribution_end_date: values.contributionEndDate,
		updated_at: new Date().toISOString()
	};
}

function nullableString(value: FormDataEntryValue | null) {
	const text = String(value ?? '').trim();
	return text ? text : null;
}
