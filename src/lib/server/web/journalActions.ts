/**
 * FE-06 매매일지 작성·수정 웹 액션(사용자 세션 RLS 클라이언트). **쓰기 경로 — 사전 리뷰 대상.**
 *
 * - 저장소 함수는 BE-11/BE-09에 있던 createJournalEntry·updateJournalEntry를 그대로 쓴다(새 RPC·마이그레이션 없음).
 *   owner_id·source_bot_id는 저장소가 서버에서 채우고(사용자 작성 → source_bot_id null), 폼 값에서는 받지 않는다.
 * - 검사는 화면과 같은 validateJournalForm(R-VAL-J02·J03·J05·M03·C04·S04·S05·T01). 종목·리포트는 서버에서 내 행인지 다시 본다.
 * - 매수·매도 기록은 보유 기록을 바꾸지 않는다(R-PERM-02). 결과에 trade 플래그만 실어 화면이 안내한다.
 * - 웹에 삭제 액션은 없다(Q-01). 보관은 기존 ?/archive(handleArchive)를 쓴다.
 * - DB 오류 원문은 내보내지 않는다(failFromDbError).
 */
import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createJournalEntry,
	forUser,
	getJournalEntryForWeb,
	getJournalReportOption,
	listJournalInstruments,
	updateJournalEntry
} from '$lib/server/repo';
import { failFromDbError, failValidation } from '$lib/server/web/actionErrors';
import { isJournalId } from '$lib/server/web/journalPage';
import {
	isTradeKind,
	journalFormFromFormData,
	validateJournalForm,
	type FormIssue,
	type JournalFormValues
} from '$lib/journal/form';
import type { InstrumentOption } from '$lib/journal/view';
import type { Database } from '$lib/types/database.types';

const CLIENT_REF_MAX = 120;
export const JOURNAL_FORM_INVALID = '입력한 내용을 확인해 주세요.';

function failIssues(errors: FormIssue[], warnings: FormIssue[]) {
	return fail(400, {
		ok: false as const,
		message: JOURNAL_FORM_INVALID,
		ruleIds: [...new Set(errors.map((e) => e.rule))],
		issues: errors,
		warnings
	});
}

async function checkedValues(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData,
	existingInstrumentId: string | null
) {
	const repo = forUser(supabase, ownerId);
	const inst = await listJournalInstruments(repo);
	if (inst.error) return { repo, failure: failFromDbError(503, inst.error) };
	const all: InstrumentOption[] = inst.data.map((i) => ({
		id: i.id,
		ticker: i.ticker,
		name: i.name,
		market: i.market,
		asset_type: i.asset_type,
		archived: i.archived_at != null
	}));
	const input = journalFormFromFormData(form);
	const result = validateJournalForm(input, all);
	if (!result.ok) return { repo, failure: failIssues(result.errors, result.warnings) };

	const extra: FormIssue[] = [];
	const chosen = result.values.instrument_id
		? all.find((i) => i.id === result.values.instrument_id)
		: null;
	// 보관된 종목은 새로 고를 수 없다(기존 행이 이미 가리키던 종목은 그대로 둘 수 있다).
	if (chosen?.archived && chosen.id !== existingInstrumentId) {
		extra.push({
			field: 'instrument_id',
			rule: 'R-VAL-J03',
			message: '보관된 종목은 새로 고를 수 없어요.'
		});
	}
	if (result.values.report_id) {
		const rep = await getJournalReportOption(repo, result.values.report_id);
		if (rep.error) return { repo, failure: failFromDbError(503, rep.error) };
		if (!rep.data) {
			extra.push({
				field: 'report_id',
				rule: 'R-VAL-J04',
				message: '목록에 있는 리포트를 골라 주세요.'
			});
		}
	}
	if (extra.length > 0) return { repo, failure: failIssues(extra, result.warnings) };
	return { repo, values: result.values, warnings: result.warnings };
}

function clientRefOf(form: FormData): string | null | 'invalid' {
	const raw = form.get('client_ref');
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const ref = raw.trim();
	return [...ref].length > CLIENT_REF_MAX ? 'invalid' : ref;
}

function okBody(id: string, values: JournalFormValues, warnings: FormIssue[]) {
	return { ok: true as const, id, trade: isTradeKind(values.kind), warnings };
}

/** `?/create` — 사용자 일지 작성. client_ref(폼 hidden, 선택)로 중복 제출을 막는다(R-PERM-11). */
export async function handleJournalCreate(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const clientRef = clientRefOf(form);
	if (clientRef === 'invalid') return failValidation(400, 'R-PERM-11', JOURNAL_FORM_INVALID);
	const checked = await checkedValues(supabase, ownerId, form, null);
	if ('failure' in checked) return checked.failure;
	const { data, error } = await createJournalEntry(checked.repo, {
		...checked.values,
		...(clientRef ? { client_ref: clientRef } : {})
	});
	if (error || !data) return failFromDbError(400, error ?? { message: 'no row' });
	return okBody(String(data.id), checked.values, checked.warnings);
}

/** `?/update` — 사용자 일지 수정. 봇이 쓴 행도 사용자가 고칠 수 있다(작성자 표시는 그대로). */
export async function handleJournalUpdate(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	if (!isJournalId(id)) return failValidation(400, 'R-SYS-01', JOURNAL_FORM_INVALID);
	const repo = forUser(supabase, ownerId);
	const existing = await getJournalEntryForWeb(repo, id);
	if (existing.error) return failFromDbError(503, existing.error);
	if (!existing.data) return failValidation(404, 'R-SYS-01', '일지를 찾지 못했어요.');
	const prevInstrument =
		typeof existing.data.instrument_id === 'string' ? existing.data.instrument_id : null;
	const checked = await checkedValues(supabase, ownerId, form, prevInstrument);
	if ('failure' in checked) return checked.failure;
	const { error } = await updateJournalEntry(checked.repo, id, checked.values);
	if (error) return failFromDbError(400, error);
	return okBody(id, checked.values, checked.warnings);
}
