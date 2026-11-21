import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { AssetGridRow } from '$lib/components/datagrid/types';
import { loadAssetRows, parseAssetForm, toAssetInsert, toAssetUpdate } from '$lib/server/assets';
import {
	loadCashflows,
	parseCashflowForm,
	toCashflowInsert,
	toCashflowUpdate
} from '$lib/server/cashflows';
import {
	ensurePresetCategories,
	loadAssetCategories,
	loadLiabilities,
	parseLiabilityForm,
	toLiabilityInsert,
	toLiabilityUpdate
} from '$lib/server/liabilities';
import { presetCategoryRows } from '$lib/types/asset';
import {
	buildDashboardSummary,
	type ChartSeries,
	type ValuationRecord
} from '$lib/utils/assetCalculations';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user?.id;
	if (userId) {
		await ensurePresetCategories(locals.supabase, userId, presetCategoryRows);
	}

	const { rows, error } = await loadAssetRows(locals.supabase);
	const { liabilities, error: liabilityError } = await loadLiabilities(locals.supabase);
	const { cashflows, error: cashflowError } = await loadCashflows(locals.supabase);
	const { categories } = await loadAssetCategories(locals.supabase);

	const { data: valuations } = await locals.supabase
		.from('asset_valuations')
		.select('asset_id, value, valued_at')
		.order('valued_at', { ascending: true })
		.limit(500);

	const { data: goal } = await locals.supabase
		.from('goals')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	const valuationRecords: ValuationRecord[] = (valuations ?? []).map((row) => ({
		asset_id: row.asset_id,
		value: Number(row.value),
		valued_at: row.valued_at
	}));

	const summary = buildDashboardSummary(rows, {
		valuations: valuationRecords,
		liabilities
	});

	return {
		assetRows: rows,
		liabilities,
		cashflows,
		customCategories: categories.map((row) => row.name),
		valuationSeries: buildServerValuationSeries(rows, valuationRecords),
		loadError: error ?? liabilityError ?? cashflowError,
		summary,
		valuations: valuationRecords,
		goal
	};
};

export const actions: Actions = {
	createAsset: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const values = parseAssetForm(await request.formData());
		if ('status' in values) return values;

		const { data, error } = await locals.supabase
			.from('assets')
			.insert(toAssetInsert(values, userId))
			.select('id')
			.single();

		if (error || !data) return fail(400, { message: '자산을 저장하지 못했습니다.' });

		await locals.supabase.from('asset_valuations').insert({
			asset_id: data.id,
			user_id: userId,
			value: values.currentValue,
			currency: values.currency,
			valued_at: values.valuationDate,
			source: 'manual'
		});

		await locals.supabase.from('asset_categories').upsert(
			{
				user_id: userId,
				category: values.category,
				name: values.subcategory
			},
			{ onConflict: 'user_id,category,name', ignoreDuplicates: true }
		);

		return { message: '자산을 추가했습니다.' };
	},

	updateAsset: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '수정할 자산을 찾지 못했습니다.' });

		const values = parseAssetForm(form);
		if ('status' in values) return values;

		const { error } = await locals.supabase
			.from('assets')
			.update(toAssetUpdate(values))
			.eq('id', id)
			.eq('user_id', userId);

		if (error) return fail(400, { message: '자산을 수정하지 못했습니다.' });

		await locals.supabase.from('asset_valuations').insert({
			asset_id: id,
			user_id: userId,
			value: values.currentValue,
			currency: values.currency,
			valued_at: values.valuationDate,
			source: 'manual'
		});

		return { message: '자산을 수정했습니다.' };
	},

	deleteAsset: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '삭제할 자산을 찾지 못했습니다.' });

		const { error } = await locals.supabase
			.from('assets')
			.delete()
			.eq('id', id)
			.eq('user_id', userId);
		if (error) return fail(400, { message: '자산을 삭제하지 못했습니다.' });

		return { message: '자산을 삭제했습니다.' };
	},

	createLiability: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const values = parseLiabilityForm(await request.formData());
		if ('status' in values) return values;

		const { error } = await locals.supabase
			.from('liabilities')
			.insert(toLiabilityInsert(values, userId));

		if (error) return fail(400, { message: '부채를 저장하지 못했습니다.' });
		return { message: '부채를 추가했습니다.' };
	},

	updateLiability: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '수정할 부채를 찾지 못했습니다.' });

		const values = parseLiabilityForm(form);
		if ('status' in values) return values;

		const { error } = await locals.supabase
			.from('liabilities')
			.update(toLiabilityUpdate(values))
			.eq('id', id)
			.eq('user_id', userId);

		if (error) return fail(400, { message: '부채를 수정하지 못했습니다.' });
		return { message: '부채를 수정했습니다.' };
	},

	deleteLiability: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '삭제할 부채를 찾지 못했습니다.' });

		const { error } = await locals.supabase
			.from('liabilities')
			.delete()
			.eq('id', id)
			.eq('user_id', userId);

		if (error) return fail(400, { message: '부채를 삭제하지 못했습니다.' });
		return { message: '부채를 삭제했습니다.' };
	},

	createCashflow: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const values = parseCashflowForm(await request.formData());
		if ('status' in values) return values;

		const { error } = await locals.supabase
			.from('cashflow_items')
			.insert(toCashflowInsert(values, userId));

		if (error) return fail(400, { message: '고정 수입/지출을 저장하지 못했습니다.' });
		return { message: '고정 수입/지출을 추가했습니다.' };
	},

	updateCashflow: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '수정할 고정 수입/지출을 찾지 못했습니다.' });

		const values = parseCashflowForm(form);
		if ('status' in values) return values;

		const { error } = await locals.supabase
			.from('cashflow_items')
			.update(toCashflowUpdate(values))
			.eq('id', id)
			.eq('user_id', userId);

		if (error) return fail(400, { message: '고정 수입/지출을 수정하지 못했습니다.' });
		return { message: '고정 수입/지출을 수정했습니다.' };
	},

	deleteCashflow: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '삭제할 고정 수입/지출을 찾지 못했습니다.' });

		const { error } = await locals.supabase
			.from('cashflow_items')
			.delete()
			.eq('id', id)
			.eq('user_id', userId);

		if (error) return fail(400, { message: '고정 수입/지출을 삭제하지 못했습니다.' });
		return { message: '고정 수입/지출을 삭제했습니다.' };
	},

	recordLiabilityPayment: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const liabilityId = String(form.get('liabilityId') ?? '');
		const principalPaid = Number(form.get('principalPaid') ?? 0);
		const interestPaid = Number(form.get('interestPaid') ?? 0);
		const paidAt = String(form.get('paidAt') ?? new Date().toISOString().slice(0, 10));

		if (!liabilityId) return fail(400, { message: '부채를 선택해 주세요.' });

		const { error: paymentError } = await locals.supabase.from('liability_payments').insert({
			liability_id: liabilityId,
			user_id: userId,
			paid_at: paidAt,
			principal_paid: principalPaid,
			interest_paid: interestPaid
		});

		if (paymentError) return fail(400, { message: '상환 내역을 저장하지 못했습니다.' });

		const { data: liability } = await locals.supabase
			.from('liabilities')
			.select('remaining_amount')
			.eq('id', liabilityId)
			.single();

		if (liability) {
			await locals.supabase
				.from('liabilities')
				.update({
					remaining_amount: Math.max(0, Number(liability.remaining_amount) - principalPaid),
					updated_at: new Date().toISOString()
				})
				.eq('id', liabilityId)
				.eq('user_id', userId);
		}

		return { message: '상환 내역을 저장했습니다.' };
	},

	updateGoal: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) redirect(303, '/login');

		const form = await request.formData();
		const target = Number(form.get('targetNetWorth') ?? 0);
		const targetDate = String(form.get('targetDate') ?? '').trim() || null;

		if (!Number.isFinite(target) || target <= 0) {
			return fail(400, { message: '목표 순자산은 0보다 큰 숫자로 입력해 주세요.' });
		}

		const { error } = await locals.supabase.from('goals').insert({
			user_id: userId,
			target_net_worth: target,
			target_date: targetDate
		});

		if (error) return fail(400, { message: '목표를 저장하지 못했습니다.' });
		return { message: '목표를 저장했습니다.' };
	},

	logout: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/login');
	}
};

function buildServerValuationSeries(
	rows: AssetGridRow[],
	valuations: ValuationRecord[]
): ChartSeries[] {
	return rows.map((row) => {
		const points = valuations
			.filter((valuation) => valuation.asset_id === row.id)
			.map((valuation) => ({
				x: valuation.valued_at,
				y: Number(valuation.value),
				label: row.name,
				category: row.category
			}));

		return {
			id: row.id,
			name: row.name,
			type: 'line' as const,
			points: points.length
				? points
				: [
						{
							x: row.valuationDate,
							y: row.currentValue,
							label: row.name,
							category: row.category
						}
					]
		};
	});
}
