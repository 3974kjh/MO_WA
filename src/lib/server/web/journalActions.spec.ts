/** FE-06 일지 작성·수정 액션(쓰기 경로). 저장소는 mock. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ID = '11111111-1111-4111-8111-111111111111';
const REP = '99999999-9999-4999-8999-999999999999';
const repoMock = vi.hoisted(() => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	listJournalInstruments: vi.fn(async () => ({
		data: [
			{
				id: 'a',
				ticker: '000111',
				name: '가나',
				market: 'KRX',
				asset_type: 'stock',
				archived_at: null
			},
			{
				id: 'old',
				ticker: 'OLDX',
				name: '보관',
				market: 'KRX',
				asset_type: 'stock',
				archived_at: '2026-01-01T00:00:00Z'
			}
		],
		error: null
	})),
	getJournalReportOption: vi.fn(async () => ({ data: null, error: null }) as never),
	getJournalEntryForWeb: vi.fn(async () => ({ data: null, error: null }) as never),
	createJournalEntry: vi.fn(async () => ({ data: { id: 'new-id' }, error: null }) as never),
	updateJournalEntry: vi.fn(async () => ({ data: { id: ID }, error: null }) as never)
}));
vi.mock('$lib/server/repo', () => repoMock);

import { handleJournalCreate, handleJournalUpdate } from './journalActions';

const sb = {} as never;
function fd(over: Record<string, string | string[]> = {}) {
	const f = new FormData();
	const base: Record<string, string | string[]> = {
		entry_date: '2026-11-02',
		kind: 'thought',
		state: 'pending',
		title: '메모',
		...over
	};
	for (const [k, v] of Object.entries(base)) {
		if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
		else f.set(k, v);
	}
	return f;
}
type Fail = {
	status: number;
	data: { ok: false; ruleIds: string[]; issues?: { field: string }[] };
};

beforeEach(() => vi.clearAllMocks());

describe('FE-06 ?/create', () => {
	it('buy 필수값이 없으면 400 + 필드 오류, 저장하지 않음', async () => {
		const r = (await handleJournalCreate(sb, 'u1', fd({ kind: 'buy' }))) as unknown as Fail;
		expect(r.status).toBe(400);
		expect(r.data.ruleIds).toEqual(['R-VAL-J02']);
		expect(r.data.issues?.map((i) => i.field)).toEqual([
			'instrument_id',
			'price',
			'qty',
			'currency'
		]);
		expect(repoMock.createJournalEntry).not.toHaveBeenCalled();
	});

	it('통과하면 검사한 열만 저장(owner_id·source_bot_id는 폼에서 받지 않음) + client_ref', async () => {
		const r = await handleJournalCreate(
			sb,
			'u1',
			fd({
				kind: 'buy',
				instrument_id: 'a',
				price: '1000',
				qty: '2',
				currency: 'KRW',
				owner_id: 'evil',
				source_bot_id: 'evil',
				client_ref: 'ref-1'
			})
		);
		expect(r).toEqual({ ok: true, id: 'new-id', trade: true, warnings: [] });
		const row = (repoMock.createJournalEntry.mock.calls[0] as unknown[])[1] as Record<
			string,
			unknown
		>;
		expect(row).toMatchObject({
			kind: 'buy',
			instrument_id: 'a',
			price: 1000,
			qty: 2,
			currency: 'KRW',
			tickers: ['000111'],
			client_ref: 'ref-1'
		});
		expect(row).not.toHaveProperty('owner_id');
		expect(row).not.toHaveProperty('source_bot_id');
		expect(repoMock.forUser).toHaveBeenCalledWith(sb, 'u1');
	});

	it('보관된 종목은 새로 고를 수 없다', async () => {
		const r = (await handleJournalCreate(
			sb,
			'u1',
			fd({ instrument_id: 'old' })
		)) as unknown as Fail;
		expect(r.status).toBe(400);
		expect(r.data.ruleIds).toEqual(['R-VAL-J03']);
	});

	it('내 리포트가 아니면(조회 없음) 연결 거부', async () => {
		const r = (await handleJournalCreate(sb, 'u1', fd({ report_id: REP }))) as unknown as Fail;
		expect(r.status).toBe(400);
		expect(r.data.ruleIds).toEqual(['R-VAL-J04']);
		expect(repoMock.getJournalReportOption).toHaveBeenCalledWith(expect.anything(), REP);
	});

	it('DB 오류 원문은 내보내지 않는다', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		repoMock.createJournalEntry.mockResolvedValueOnce({
			data: null,
			error: { message: 'secret detail', code: 'XX000' }
		} as never);
		const r = (await handleJournalCreate(sb, 'u1', fd())) as unknown as Fail & {
			data: { message: string };
		};
		expect(r.status).toBe(400);
		expect(JSON.stringify(r.data)).not.toContain('secret detail');
		spy.mockRestore();
	});
});

describe('FE-06 ?/update', () => {
	it('id가 uuid가 아니면 400, 없는 행은 404', async () => {
		expect(((await handleJournalUpdate(sb, 'u1', fd({ id: 'x' }))) as unknown as Fail).status).toBe(
			400
		);
		expect(((await handleJournalUpdate(sb, 'u1', fd({ id: ID }))) as unknown as Fail).status).toBe(
			404
		);
		expect(repoMock.updateJournalEntry).not.toHaveBeenCalled();
	});

	it('봇이 쓴 행도 사용자가 수정, 이미 가리키던 보관 종목은 유지 가능', async () => {
		repoMock.getJournalEntryForWeb.mockResolvedValueOnce({
			data: { id: ID, source_bot_id: 'bot-1', instrument_id: 'old' },
			error: null
		} as never);
		const r = await handleJournalUpdate(
			sb,
			'u1',
			fd({ id: ID, instrument_id: 'old', title: '고친 제목' })
		);
		expect(r).toMatchObject({ ok: true, id: ID, trade: false });
		expect(repoMock.updateJournalEntry).toHaveBeenCalledWith(
			expect.anything(),
			ID,
			expect.objectContaining({ title: '고친 제목', instrument_id: 'old' })
		);
		const patch = (repoMock.updateJournalEntry.mock.calls[0] as unknown[])[2] as Record<
			string,
			unknown
		>;
		expect(patch).not.toHaveProperty('source_bot_id');
	});
});
