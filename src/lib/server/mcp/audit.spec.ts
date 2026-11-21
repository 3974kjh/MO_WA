import { describe, expect, it } from 'vitest';
import {
	assertPreviewHasNoRawBody,
	buildArgsPreview,
	createAuditRecorder,
	createImmediateWaitUntil,
	createMemoryAuditSink,
	digestArgs,
	stableStringify
} from './audit';
import { createStubMcpContext } from './context';
import { mowaDisplayId } from './display-id';
import { mcpError, mcpSuccess, McpToolError, validationError } from './errors';
import { sanitizeIdentityFields } from './identity';
import { assertToolScope } from './scopes';
import { recordRateLimited, runAuditedToolCall } from './tool-gate';

describe('buildArgsPreview (R-SYS-05)', () => {
	it('stores body fields as length only — no raw request body', () => {
		const body = 'A'.repeat(500);
		const preview = buildArgsPreview({
			kind: 'daily_brief',
			body_md: body,
			summary: 'line1\nline2',
			title: 'ok-title'
		});
		expect(preview.body_md).toEqual({ length: 500 });
		expect(preview.summary).toEqual({ length: 'line1\nline2'.length });
		expect(preview.title).toBe('ok-title');
		expect(JSON.stringify(preview)).not.toContain(body);
		assertPreviewHasNoRawBody(preview, { body_md: body, summary: 'line1\nline2', title: 'ok-title' });
	});

	it('redacts secret-shaped keys', () => {
		const preview = buildArgsPreview({
			token: 'super-secret-value',
			pepper: 'do-not-log',
			nested: { api_key: 'abc12345' }
		});
		const json = JSON.stringify(preview);
		expect(json).not.toContain('super-secret-value');
		expect(json).not.toContain('do-not-log');
		expect(json).not.toContain('abc12345');
		expect(preview.token).toEqual({ redacted: true });
	});

	it('truncates oversized previews without embedding raw bodies', () => {
		const huge: Record<string, string> = {};
		for (let i = 0; i < 200; i++) huge[`field_${i}`] = 'x'.repeat(40);
		const preview = buildArgsPreview(huge);
		expect(preview._truncated).toBe(true);
		expect(new TextEncoder().encode(JSON.stringify(preview)).length).toBeLessThanOrEqual(2048);
	});
});

describe('stableStringify / digestArgs', () => {
	it('digests with sorted keys so key order does not matter', async () => {
		const a = await digestArgs({ b: 1, a: 2 });
		const b = await digestArgs({ a: 2, b: 1 });
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	});
});

describe('response contract (design §5-3)', () => {
	it('success may include warnings[]', () => {
		const res = mcpSuccess({
			id: 'x',
			warnings: [{ rule: 'R-VAL-M01', field: 'currency', message: 'market default USD' }]
		});
		expect(res.isError).toBeFalsy();
		expect(res.structuredContent.warnings?.[0]?.rule).toBe('R-VAL-M01');
	});

	it('error includes code + errors[]', () => {
		const res = validationError([
			{ rule: 'R-VAL-T05', field: 'period_start', message: 'weekly period invalid' }
		]);
		expect(res.isError).toBe(true);
		expect(res.structuredContent.code).toBe('VALIDATION');
		expect(res.structuredContent.errors[0]?.rule).toBe('R-VAL-T05');
	});

	it('FORBIDDEN_SCOPE uses R-PERM-04', () => {
		const denied = assertToolScope({ scopes: ['read'] }, 'propose_position_change');
		expect(denied?.isError).toBe(true);
		expect(denied?.structuredContent.code).toBe('FORBIDDEN_SCOPE');
		expect(denied?.structuredContent.errors[0]?.rule).toBe('R-PERM-04');
	});
});

describe('R-PERM-03 impersonation overwrite', () => {
	it('overwrites owner_id / source_bot_id and records R-PERM-03', () => {
		const ctx = createStubMcpContext();
		const result = sanitizeIdentityFields(
			{
				owner_id: 'attacker-owner',
				source_bot_id: 'attacker-bot',
				title: 'keep-me'
			},
			ctx
		);
		expect(result.impersonationAttempted).toBe(true);
		expect(result.ruleIds).toEqual(['R-PERM-03']);
		expect(result.args.owner_id).toBe(ctx.ownerId);
		expect(result.args.source_bot_id).toBe(ctx.botClientId);
		expect(result.args.title).toBe('keep-me');
	});

	it('ignores proposed_by user claims from bot keys', () => {
		const ctx = createStubMcpContext();
		const result = sanitizeIdentityFields(
			{
				proposed_by_type: 'user',
				proposed_by_user_id: 'spoofed-user'
			},
			ctx
		);
		expect(result.ruleIds).toContain('R-PERM-03');
		expect(result.args.proposed_by_type).toBe('bot');
		expect(result.args.proposed_by_bot_id).toBe(ctx.botClientId);
		expect(result.args.proposed_by_user_id).toBeUndefined();
	});
});

describe('mowa_display_id', () => {
	it('formats owner-scoped P- / R- ids (no PP-)', () => {
		expect(mowaDisplayId('P', 412)).toBe('P-0412');
		expect(mowaDisplayId('R', 1)).toBe('R-0001');
		expect(mowaDisplayId('P', 10_000)).toBe('P-10000');
		expect(mowaDisplayId('P', 412)).not.toMatch(/^PP-/);
	});
});

describe('audit outcomes: ok · error · denied · rate_limited', () => {
	it('records all four results with safe args_preview', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext({ scopes: ['read', 'journal:write'] });
		const longBody = 'BODY_SECRET_CONTENT_' + 'Z'.repeat(80);

		// ok (+ WARN → warnings + rule_ids)
		const okRes = await runAuditedToolCall({
			ctx,
			args: { title: 'entry', body_md: longBody },
			meta: { tool: 'add_journal_entry', requestId: '1' },
			recorder,
			handler: async ({ ruleIds }) => ({
				data: { id: 'j1', created: true },
				warnings: [{ rule: 'R-VAL-J06', message: 'duplicate day/title without client_ref' }],
				ruleIds,
				affectedIds: ['j1']
			})
		});
		expect(okRes.isError).toBeFalsy();
		if (!okRes.isError) {
			expect(okRes.structuredContent.warnings?.[0]?.rule).toBe('R-VAL-J06');
		}

		// denied — FORBIDDEN_SCOPE (R-PERM-04)
		const deniedRes = await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args: { change_type: 'close' },
			meta: { tool: 'propose_position_change', requestId: '2' },
			recorder,
			handler: async () => ({ data: {} })
		});
		expect(deniedRes.isError).toBe(true);
		if (deniedRes.isError) {
			expect(deniedRes.structuredContent.code).toBe('FORBIDDEN_SCOPE');
		}

		// error — validation
		await runAuditedToolCall({
			ctx,
			args: { body_md: longBody },
			meta: { tool: 'add_journal_entry', requestId: '3' },
			recorder,
			handler: async () => {
				throw new McpToolError('VALIDATION', [
					{ rule: 'R-VAL-J02', field: 'price', message: 'buy requires price' }
				]);
			}
		}).then((res) => {
			expect(res.isError).toBe(true);
			if (res.isError) expect(res.structuredContent.code).toBe('VALIDATION');
		});

		// rate_limited
		recordRateLimited({
			recorder,
			ctx,
			tool: '(auth)',
			requestId: '4',
			args: { body_md: longBody }
		});

		await recorder.drain();

		const results = sink.rows.map((r) => r.result).sort();
		expect(results).toEqual(['denied', 'error', 'ok', 'rate_limited'].sort());

		const okRow = sink.rows.find((r) => r.result === 'ok');
		expect(okRow?.warnings[0]?.rule).toBe('R-VAL-J06');
		expect(okRow?.rule_ids).toContain('R-VAL-J06');
		expect(JSON.stringify(okRow?.args_preview)).not.toContain(longBody);
		expect(okRow?.args_preview.body_md).toEqual({ length: longBody.length });

		const deniedRow = sink.rows.find((r) => r.result === 'denied');
		expect(deniedRow?.error_code).toBe('FORBIDDEN_SCOPE');
		expect(deniedRow?.rule_ids).toContain('R-PERM-04');

		const errorRow = sink.rows.find((r) => r.result === 'error');
		expect(errorRow?.error_code).toBe('VALIDATION');
		expect(errorRow?.rule_ids).toContain('R-VAL-J02');

		const rl = sink.rows.find((r) => r.result === 'rate_limited');
		expect(rl?.error_code).toBe('RATE_LIMITED');
		expect(JSON.stringify(rl?.args_preview)).not.toContain(longBody);
	});

	it('records R-PERM-03 on impersonation attempts during ok path', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext({ scopes: ['read'] });

		await runAuditedToolCall({
			ctx,
			args: { owner_id: 'spoof', source_bot_id: 'spoof-bot' },
			meta: { tool: 'whoami', requestId: 'imp' },
			recorder,
			handler: async ({ args, ruleIds }) => {
				expect(args.owner_id).toBe(ctx.ownerId);
				expect(ruleIds).toContain('R-PERM-03');
				return { data: { ok: true }, ruleIds };
			}
		});
		await recorder.drain();
		expect(sink.rows[0]?.rule_ids).toContain('R-PERM-03');
		expect(sink.rows[0]?.result).toBe('ok');
	});

	it('schedules writes through waitUntil (async)', async () => {
		const sink = createMemoryAuditSink();
		const scheduled: Promise<unknown>[] = [];
		const recorder = createAuditRecorder({
			sink,
			waitUntil: (p) => {
				scheduled.push(p);
			}
		});
		recorder.record({
			ctx: createStubMcpContext(),
			tool: 'whoami',
			args: { body_md: 'should-not-appear-raw' },
			result: 'ok'
		});
		expect(scheduled).toHaveLength(1);
		expect(sink.rows).toHaveLength(0);
		await Promise.all(scheduled);
		expect(sink.rows).toHaveLength(1);
		expect(JSON.stringify(sink.rows[0]?.args_preview)).not.toContain('should-not-appear-raw');
	});
});

describe('mcpError helpers', () => {
	it('builds CONFLICT envelope', () => {
		const res = mcpError('CONFLICT', [{ rule: 'R-VAL-R11', message: 'key owned by another actor' }]);
		expect(res.structuredContent.code).toBe('CONFLICT');
	});
});
