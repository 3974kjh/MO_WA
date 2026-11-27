import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<typeof import('@sveltejs/kit')>('@sveltejs/kit');
	return {
		...actual,
		fail: (status: number, data: unknown) => ({ status, data })
	};
});

vi.mock('$lib/server/repo', () => ({
	forUser: (_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	}),
	approveProposalRpc: vi.fn(),
	rejectProposalRpc: vi.fn(),
	holdProposalRpc: vi.fn(),
	applyUserCorrectionRpc: vi.fn(),
	acknowledgeProposalRpc: vi.fn(),
	acknowledgePrincipleProposalRpc: vi.fn(),
	approvePrincipleProposalRpc: vi.fn(),
	decidePrincipleProposalRpc: vi.fn(),
	archiveRow: vi.fn(),
	restoreRow: vi.fn()
}));

import {
	approveProposalRpc,
	approvePrincipleProposalRpc,
	applyUserCorrectionRpc,
	acknowledgeProposalRpc
} from '$lib/server/repo';
import {
	handleAck,
	handleApprove,
	handleApprovePrinciple,
	handleCorrect,
	retryOnceOnDeadlock
} from './proposalActions';

beforeEach(() => {
	vi.clearAllMocks();
});

function fakeSupabase(meta: {
	change_type?: string;
	proposed_by_type?: string;
	asset_type?: string;
	proposed_values?: unknown;
	status?: string;
	/** ISO. 생략하면 한 시간 뒤(만료 전) */
	expires_at?: string | null;
	position_id?: string | null;
	position?: { id: string; instrument_id: string; approval_version: number } | null;
}) {
	return {
		from(table: string) {
			if (table === 'position_proposals') {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								maybeSingle: async () => ({
									data: {
										change_type: meta.change_type ?? 'set_qty_avg',
										proposed_by_type: meta.proposed_by_type ?? 'bot',
										proposed_values: 'proposed_values' in meta ? meta.proposed_values : { qty: 2 },
										instrument_id: 'inst-1',
										position_id: 'position_id' in meta ? meta.position_id : 'pos-1',
										status: meta.status ?? 'pending',
										expires_at:
											'expires_at' in meta
												? meta.expires_at
												: new Date(Date.now() + 3_600_000).toISOString()
									}
								})
							})
						})
					})
				};
			}
			if (table === 'instruments') {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								maybeSingle: async () => ({
									data: { asset_type: meta.asset_type ?? 'stock' }
								})
							})
						})
					})
				};
			}
			if (table === 'positions') {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								maybeSingle: async () => ({
									data: meta.position ?? {
										id: 'pos-1',
										instrument_id: 'inst-1',
										approval_version: 1
									}
								})
							})
						})
					})
				};
			}
			throw new Error(`unexpected table ${table}`);
		}
	} as never;
}

describe('BE-11 approve action', () => {
	it('conflict path returns 409 when RPC status=conflict', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue({
			data: {
				id: 'p1',
				status: 'conflict',
				display_id: 'P-0001',
				base_version: 1,
				applied_values: null,
				proposed_values: {},
				change_type: 'set_qty_avg',
				attention_started_at: null,
				acknowledged_at: null
			},
			error: null
		});
		const form = new FormData();
		form.set('id', 'p1');
		form.set('overrides', JSON.stringify({ qty: 2 }));
		const result = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: { status?: string; ruleIds: string[]; code?: string; message?: string };
		};
		expect(result.status).toBe(409);
		expect(result.data.status).toBe('conflict');
		expect(result.data.code).toBe('CONFLICT');
		expect(result.data.message).toBe('반영 안 됨(보유가 달라짐)');
		expect(result.data.ruleIds).toContain('R-PERM-13');
	});

	it('다른 세션에서 superseded된 요청 승인 → 400 code SUPERSEDED(중립 문구, 원문 없음)', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(approveProposalRpc).mockResolvedValue({
			data: null,
			error: { code: 'P0001', message: 'proposal is already superseded' }
		} as never);
		const form = new FormData();
		form.set('id', 'p1');
		const result = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: Record<string, unknown>;
		};
		log.mockRestore();
		expect(result.status).toBe(400);
		expect(result.data).toMatchObject({ code: 'SUPERSEDED', status: 'superseded' });
		expect(String(result.data.message)).not.toContain('proposal is already');
	});

	it('동시 승인 교착(40P01)은 한 번만 다시 시도해 성공을 돌려준다 (BE-17 Low-2)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(approveProposalRpc)
			.mockResolvedValueOnce({
				data: null,
				error: { code: '40P01', message: 'deadlock detected' }
			} as never)
			.mockResolvedValueOnce({ data: { id: 'p1', status: 'approved' }, error: null } as never);
		const form = new FormData();
		form.set('id', 'p1');
		const result = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			ok?: boolean;
			proposal?: { status: string };
		};
		warn.mockRestore();
		expect(approveProposalRpc).toHaveBeenCalledTimes(2);
		expect(result).toEqual({ ok: true, proposal: { id: 'p1', status: 'approved' } });
	});

	it('40P01이 두 번 이어지면 더 시도하지 않고 일반 오류(400), 다른 오류는 재시도 없음', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(approveProposalRpc).mockResolvedValue({
			data: null,
			error: { code: '40P01', message: 'deadlock detected' }
		} as never);
		const form = new FormData();
		form.set('id', 'p1');
		const r1 = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: Record<string, unknown>;
		};
		expect(approveProposalRpc).toHaveBeenCalledTimes(2);
		expect(r1.status).toBe(400);
		expect(r1.data.code).toBeUndefined();

		vi.mocked(approveProposalRpc).mockClear();
		vi.mocked(approveProposalRpc).mockResolvedValue({
			data: null,
			error: { code: '42501', message: 'nope' }
		} as never);
		await handleApprove(fakeSupabase({}), 'owner', form);
		expect(approveProposalRpc).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		log.mockRestore();
	});

	it('B1 L-5: 승인 note는 한 줄·120자까지(R-VAL-P11), 비면 생략, 어기면 RPC 전에 400', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue({
			data: { id: 'p1', status: 'approved' },
			error: null
		} as never);
		const call = async (note: string | null) => {
			const form = new FormData();
			form.set('id', 'p1');
			if (note !== null) form.set('note', note);
			return (await handleApprove(fakeSupabase({}), 'owner', form)) as {
				ok?: boolean;
				status?: number;
				data?: { ruleIds: string[] };
			};
		};
		expect((await call('가'.repeat(120))).ok).toBe(true);
		expect((await call('  ')).ok).toBe(true);
		expect((await call(null)).ok).toBe(true);
		expect(vi.mocked(approveProposalRpc).mock.calls.map((c) => c[1].note)).toEqual([
			'가'.repeat(120),
			null,
			null
		]);
		vi.mocked(approveProposalRpc).mockClear();
		for (const bad of ['가'.repeat(121), '첫 줄\n둘째 줄', '이유\r']) {
			const r = await call(bad);
			expect(r.status).toBe(400);
			expect(r.data?.ruleIds).toEqual(['R-VAL-P11']);
		}
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	it('blocks disallowed override keys before RPC', async () => {
		const form = new FormData();
		form.set('id', 'p1');
		form.set('overrides', JSON.stringify({ trigger_price: 100 }));
		const result = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: { ruleIds: string[] };
		};
		expect(result.status).toBe(400);
		expect(result.data.ruleIds).toContain('R-VAL-P07');
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	it('R-VAL-M03 blocks fractional stock qty override', async () => {
		const form = new FormData();
		form.set('id', 'p1');
		form.set('overrides', JSON.stringify({ qty: 1.5 }));
		const result = (await handleApprove(fakeSupabase({ asset_type: 'stock' }), 'owner', form)) as {
			status: number;
			data: { ruleIds: string[] };
		};
		expect(result.status).toBe(400);
		expect(result.data.ruleIds).toContain('R-VAL-M03');
	});

	/** H-2: never coerce bad overrides to {} (would apply bot proposed_values). */
	it.each([
		['broken JSON', '{qty:'],
		['array', '[1,2]'],
		['JSON null string', 'null'],
		['number', '42'],
		['boolean true', 'true'],
		['empty string', '']
	] as const)('rejects %s overrides with 400 R-PERM-13 and skips RPC', async (_label, raw) => {
		const form = new FormData();
		form.set('id', 'p1');
		form.set('overrides', raw);
		const result = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: { ruleIds: string[]; message: string };
		};
		expect(result.status).toBe(400);
		expect(result.data.ruleIds).toContain('R-PERM-13');
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	it('rejects File overrides with 400 R-PERM-13 and skips RPC', async () => {
		const form = new FormData();
		form.set('id', 'p1');
		form.set('overrides', new File(['{"qty":1}'], 'overrides.json', { type: 'application/json' }));
		const result = (await handleApprove(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: { ruleIds: string[] };
		};
		expect(result.status).toBe(400);
		expect(result.data.ruleIds).toContain('R-PERM-13');
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	it('omitted overrides field still allows approve (empty object)', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue({
			data: {
				id: 'p1',
				status: 'approved',
				display_id: 'P-0001',
				base_version: 1,
				applied_values: { qty: 1 },
				proposed_values: { qty: 1 },
				change_type: 'set_qty_avg',
				attention_started_at: null,
				acknowledged_at: null
			},
			error: null
		});
		const form = new FormData();
		form.set('id', 'p1');
		// no overrides key
		const result = await handleApprove(fakeSupabase({}), 'owner', form);
		expect(result).toMatchObject({ ok: true });
		expect(approveProposalRpc).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ overrides: {} })
		);
	});
});

describe('승인 시점 재검증 (proposed_values 를 합친 값으로 다시 검사)', () => {
	const okRpc = { data: { id: 'p1', status: 'approved' }, error: null } as never;
	const form = (overrides?: Record<string, unknown>) => {
		const f = new FormData();
		f.set('id', 'p1');
		if (overrides) f.set('overrides', JSON.stringify(overrides));
		return f;
	};
	type Fail = { status: number; data: { ruleIds: string[]; source?: string; key?: string } };

	it('고치지 않고 승인할 때 proposed avg_price 소수 5자리 → 400 R-FMT-13(source=proposed), RPC 호출 없음', async () => {
		const r = (await handleApprove(
			fakeSupabase({ proposed_values: { qty: 2, avg_price: 1.00005 } }),
			'owner',
			form()
		)) as Fail;
		expect(r.status).toBe(400);
		expect(r.data).toMatchObject({ ruleIds: ['R-FMT-13'], source: 'proposed', key: 'avg_price' });
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	it('같은 proposed 라도 사용자가 avg_price 를 고쳐 보내면 통과해 RPC 로 간다(overrides 그대로 전달)', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
		const r = await handleApprove(
			fakeSupabase({ proposed_values: { qty: 2, avg_price: 1.00005 } }),
			'owner',
			form({ avg_price: 1.0001 })
		);
		expect(r).toMatchObject({ ok: true });
		expect(approveProposalRpc).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ overrides: { avg_price: 1.0001 } })
		);
	});

	it('정상 proposed 값은 그대로 RPC 로 간다', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
		const r = await handleApprove(
			fakeSupabase({ proposed_values: { qty: 2, avg_price: 23090.0123 } }),
			'owner',
			form()
		);
		expect(r).toMatchObject({ ok: true });
		expect(approveProposalRpc).toHaveBeenCalledTimes(1);
	});

	it('proposed 의 직접 쓰기 필드·허용 밖 키·잘못된 값은 RPC 전에 막는다', async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ qty: 2, breakeven: 5 }, 'R-VAL-P07'],
			[{ qty: 2, status: 'closed' }, 'R-PERM-13'],
			[{ qty: 2, avg_price: -3 }, 'R-VAL-M02'],
			[{ qty: 1.5 }, 'R-VAL-M03']
		];
		for (const [proposed_values, ruleId] of cases) {
			const r = (await handleApprove(fakeSupabase({ proposed_values }), 'owner', form())) as Fail;
			expect(r.status).toBe(400);
			expect(r.data.ruleIds).toEqual([ruleId]);
			expect(r.data.source).toBe('proposed');
		}
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	it('open_holding 은 proposed 에 수량·평균 단가가 없으면 막고, 고쳐서 채우면 통과한다', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
		const sb = () =>
			fakeSupabase({ change_type: 'open_holding', proposed_values: { qty: 3, currency: 'KRW' } });
		const bad = (await handleApprove(sb(), 'owner', form())) as Fail;
		expect(bad.data.ruleIds).toEqual(['R-VAL-P04']);
		expect(approveProposalRpc).not.toHaveBeenCalled();
		const good = await handleApprove(sb(), 'owner', form({ avg_price: 1000 }));
		expect(good).toMatchObject({ ok: true });
	});

	// ── L-2: 만료·superseded·종결은 RPC 가 먼저 가린다 ──
	describe('L-2 순서: 이미 읽은 행이 처리 대기가 아니거나 만료면 재검증을 건너뛰고 RPC 로 보낸다', () => {
		const badValues = { qty: 2, avg_price: 1.00005 };
		for (const status of [
			'superseded',
			'expired',
			'approved',
			'rejected',
			'conflict',
			'cancelled'
		]) {
			it(`status=${status} + 잘못된 값 → 재검증 없이 RPC`, async () => {
				vi.mocked(approveProposalRpc).mockResolvedValue({
					data: null,
					error: { code: 'P0001', message: `proposal is already ${status}` }
				} as never);
				const r = (await handleApprove(
					fakeSupabase({ proposed_values: badValues, status }),
					'owner',
					form()
				)) as Fail & { data: { code?: string } };
				expect(approveProposalRpc).toHaveBeenCalledTimes(1);
				expect(r.data.ruleIds).not.toContain('R-FMT-13');
				if (status === 'superseded') expect(r.data.code).toBe('SUPERSEDED');
			});
		}

		it('pending 이지만 만료 시각이 지났다 → RPC(expired 로 바꿈)가 먼저', async () => {
			vi.mocked(approveProposalRpc).mockResolvedValue({
				data: { id: 'p1', status: 'expired' },
				error: null
			} as never);
			const r = await handleApprove(
				fakeSupabase({
					proposed_values: badValues,
					expires_at: new Date(Date.now() - 1000).toISOString()
				}),
				'owner',
				form()
			);
			expect(approveProposalRpc).toHaveBeenCalledTimes(1);
			expect(r).toMatchObject({ ok: true, proposal: { status: 'expired' } });
		});

		it('on_hold 는 만료 대상이 아니므로 재검증한다', async () => {
			const r = (await handleApprove(
				fakeSupabase({
					proposed_values: badValues,
					status: 'on_hold',
					expires_at: new Date(Date.now() - 1000).toISOString()
				}),
				'owner',
				form()
			)) as Fail;
			expect(r.data.ruleIds).toEqual(['R-FMT-13']);
			expect(approveProposalRpc).not.toHaveBeenCalled();
		});

		it('pending 이고 만료 전이면 재검증한다', async () => {
			const r = (await handleApprove(
				fakeSupabase({ proposed_values: badValues, status: 'pending' }),
				'owner',
				form()
			)) as Fail;
			expect(r.data.ruleIds).toEqual(['R-FMT-13']);
		});
	});

	// ── L-3: RPC 가 받는 overrides 는 검사를 통과한 바로 그 객체 ──
	it('RPC 는 validateOverrides 를 통과(정규화)한 overrides 를 받는다 — 원본 파싱 값이 아니다', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
		await handleApprove(
			fakeSupabase({ proposed_values: { qty: 2, avg_price: 10 } }),
			'owner',
			form({ avg_price: '12.5000' })
		);
		const sent = vi.mocked(approveProposalRpc).mock.calls[0]![1].overrides;
		expect(sent).toEqual({ avg_price: 12.5 });
		expect(typeof (sent as { avg_price: unknown }).avg_price).toBe('number');
	});

	it('RPC 로 가는 overrides 에는 검사를 통과하지 못한 추가 키가 섞이지 않는다', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
		const r = (await handleApprove(
			fakeSupabase({ proposed_values: { qty: 2 } }),
			'owner',
			form({ qty: 3, trigger_price: 5 })
		)) as Fail;
		expect(r.status).toBe(400);
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	// ── Nit-2: 빈 값은 '고쳐서 반영'으로 채울 수 있다고 표시 ──
	it('set_qty_avg 에 두 값이 모두 없으면 missing 표시(화면이 고쳐서 반영을 안내)', async () => {
		const r = (await handleApprove(
			fakeSupabase({ proposed_values: {} }),
			'owner',
			form()
		)) as Fail & { data: { missing?: boolean } };
		expect(r.data).toMatchObject({ ruleIds: ['R-VAL-P07'], source: 'proposed', missing: true });
		const fixed = await (async () => {
			vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
			return handleApprove(fakeSupabase({ proposed_values: {} }), 'owner', form({ qty: 3 }));
		})();
		expect(fixed).toMatchObject({ ok: true });
	});

	it('포지션 없는 open_holding 에 통화가 없으면 M01(missing) — 고쳐서 채울 수 있다', async () => {
		const r = (await handleApprove(
			fakeSupabase({
				change_type: 'open_holding',
				position_id: null,
				proposed_values: { qty: 3, avg_price: 10 }
			}),
			'owner',
			form()
		)) as Fail & { data: { missing?: boolean } };
		expect(r.data).toMatchObject({ ruleIds: ['R-VAL-M01'], missing: true, source: 'proposed' });
		expect(approveProposalRpc).not.toHaveBeenCalled();
	});

	// ── G3: 보관 대상 오류 코드 ──
	it('RPC 가 MW001(보관된 보유 기록)·MW002(보관된 종목)를 내면 코드로 구분해 돌려준다', async () => {
		for (const [code, want] of [
			['MW001', 'ARCHIVED_POSITION'],
			['MW002', 'ARCHIVED_INSTRUMENT']
		] as const) {
			vi.mocked(approveProposalRpc).mockResolvedValue({
				data: null,
				error: { code, message: '[R-VAL-P02] position is archived; restore it or reject' }
			} as never);
			const r = (await handleApprove(fakeSupabase({}), 'owner', form())) as Fail & {
				data: { code?: string; message: string };
			};
			expect(r.status).toBe(400);
			expect(r.data.code).toBe(want);
			expect(r.data.message).not.toMatch(/R-|archived/);
		}
	});

	it('close 승인은 proposed {} 라 재검증을 그대로 통과한다', async () => {
		vi.mocked(approveProposalRpc).mockResolvedValue(okRpc);
		const r = await handleApprove(
			fakeSupabase({ change_type: 'close', proposed_values: {} }),
			'owner',
			form()
		);
		expect(r).toMatchObject({ ok: true });
	});
});

describe('BE-19 correct / ack actions', () => {
	it('reason 121 chars → ERROR; 120 ok', async () => {
		const long = new FormData();
		long.set('position_id', 'pos-1');
		long.set('qty', '1');
		long.set('currency', 'KRW');
		long.set('avg_price', '100');
		long.set('reason', 'x'.repeat(121));
		const bad = (await handleCorrect(fakeSupabase({}), 'owner', long)) as {
			status: number;
			data: { ruleIds: string[] };
		};
		expect(bad.status).toBe(400);
		expect(bad.data.ruleIds).toContain('R-VAL-P11');

		vi.mocked(applyUserCorrectionRpc).mockResolvedValue({
			data: {
				id: 'new',
				status: 'approved',
				display_id: 'P-0002',
				base_version: 1,
				applied_values: { qty: 1, avg_price: 100, currency: 'KRW' },
				proposed_values: { qty: 1, avg_price: 100, currency: 'KRW' },
				change_type: 'set_qty_avg',
				attention_started_at: null,
				acknowledged_at: null
			},
			error: null
		});
		const okForm = new FormData();
		okForm.set('position_id', 'pos-1');
		okForm.set('qty', '1');
		okForm.set('currency', 'KRW');
		okForm.set('avg_price', '100');
		okForm.set('reason', 'x'.repeat(120));
		const ok = await handleCorrect(fakeSupabase({}), 'owner', okForm);
		expect(ok).toMatchObject({ ok: true });
		expect(applyUserCorrectionRpc).toHaveBeenCalled();
	});

	it('newline reason is ERROR', async () => {
		const form = new FormData();
		form.set('position_id', 'pos-1');
		form.set('qty', '1');
		form.set('currency', 'KRW');
		form.set('avg_price', '100');
		form.set('reason', 'a\nb');
		const result = (await handleCorrect(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: { ruleIds: string[] };
		};
		expect(result.status).toBe(400);
		expect(result.data.ruleIds).toContain('R-VAL-P11');
	});

	it('base_version mismatch → CONFLICT', async () => {
		vi.mocked(applyUserCorrectionRpc).mockResolvedValue({
			data: null,
			error: Object.assign(new Error('[R-PERM-13] CONFLICT: position changed'), {
				code: '40001'
			})
		});
		const form = new FormData();
		form.set('position_id', 'pos-1');
		form.set('qty', '1');
		form.set('currency', 'KRW');
		form.set('avg_price', '100');
		form.set('reason', '정정');
		form.set('base_version', '1');
		const result = (await handleCorrect(fakeSupabase({}), 'owner', form)) as {
			status: number;
			data: { code?: string };
		};
		expect(result.status).toBe(409);
		expect(result.data.code).toBe('CONFLICT');
	});

	it('ack leaves status as-is (RPC only stamps acknowledged_at)', async () => {
		vi.mocked(acknowledgeProposalRpc).mockResolvedValue({
			data: {
				id: 'p1',
				status: 'conflict',
				display_id: 'P-0001',
				base_version: 1,
				applied_values: null,
				proposed_values: {},
				change_type: 'set_qty_avg',
				attention_started_at: '2026-11-20T00:00:00Z',
				acknowledged_at: '2026-11-21T00:00:00Z'
			},
			error: null
		});
		const form = new FormData();
		form.set('id', 'p1');
		const result = await handleAck(fakeSupabase({}), 'owner', form);
		expect(result).toMatchObject({
			ok: true,
			proposal: { status: 'conflict', acknowledged_at: expect.any(String) }
		});
	});
});

describe('BE-17 Low-2 교착 재시도', () => {
	it('원칙 승인도 40P01이면 한 번 다시 시도한다', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(approvePrincipleProposalRpc)
			.mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock' } } as never)
			.mockResolvedValueOnce({ data: { id: 'r1', status: 'approved' }, error: null } as never);
		const form = new FormData();
		form.set('id', 'r1');
		const r = await handleApprovePrinciple({} as never, 'owner', form);
		warn.mockRestore();
		expect(approvePrincipleProposalRpc).toHaveBeenCalledTimes(2);
		expect(r).toEqual({ ok: true, proposal: { id: 'r1', status: 'approved' } });
	});

	it('retryOnceOnDeadlock: 성공·다른 오류는 1번, 40P01은 최대 2번', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const ok = vi.fn(async () => ({ data: 1, error: null }));
		expect(await retryOnceOnDeadlock(ok)).toEqual({ data: 1, error: null });
		expect(ok).toHaveBeenCalledTimes(1);
		const other = vi.fn(async () => ({ data: null, error: { code: '40001' } }));
		await retryOnceOnDeadlock(other);
		expect(other).toHaveBeenCalledTimes(1);
		const dl = vi.fn(async () => ({ data: null, error: { code: '40P01' } }));
		expect((await retryOnceOnDeadlock(dl)).error).toEqual({ code: '40P01' });
		expect(dl).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});
});
