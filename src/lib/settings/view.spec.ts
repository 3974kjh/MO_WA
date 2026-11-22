import { describe, expect, it } from 'vitest';
import {
	ACTION_FALLBACK_MESSAGE,
	applyKstOffset,
	argsPreview,
	auditFilterActive,
	expiryRequired,
	needsExpiryClearConfirm,
	parseAuditFilter,
	selectableScopes,
	settingsErrorMessage,
	withKstOffset,
	ARGS_PREVIEW_MAX
} from './view';

describe('settingsErrorMessage: 한글화 + 규칙 ID 비노출', () => {
	it.each([
		['[R-PERM-10] importer keys require an expiry date (expires_at)'],
		['[R-PERM-10] positions:propose and principles:propose require finance-manager'],
		['[R-PERM-10] finance-manager must not receive valuations:write or principles:write'],
		['name is required'],
		['rate_limit_per_min must be an integer between 1 and 600'],
		['bot client not found or already revoked'],
		['expires_at must be a valid ISO datetime'],
		['server_misconfigured']
	])('%s', (raw) => {
		const out = settingsErrorMessage(raw);
		expect(out).toMatch(/[가-힣]/);
		expect(out).not.toMatch(/R-[A-Z]+-\d+|\[R-/);
		expect(out).not.toMatch(/[a-z_]{6,}\(?[a-z]*\)?:?[a-z]*_[a-z]/);
	});

	it('알 수 없는 영문·빈 값은 일반 문구', () => {
		expect(settingsErrorMessage('boom R-VAL-T05 weird')).toBe(ACTION_FALLBACK_MESSAGE);
		expect(settingsErrorMessage(undefined)).toBe(ACTION_FALLBACK_MESSAGE);
	});

	it('이미 한글인 서버 문구는 규칙 ID 태그만 지우고 유지', () => {
		expect(settingsErrorMessage('요청을 처리하지 못했어요.')).toBe('요청을 처리하지 못했어요.');
		expect(settingsErrorMessage('[R-X-1] 반영 안 됨(보유가 달라짐)')).toBe(
			'반영 안 됨(보유가 달라짐)'
		);
	});
});

describe('권한 범위·만료', () => {
	const defaults = ['read', 'positions:propose', 'principles:propose', 'journal:write'];
	it('finance-manager만 제안 권한을 고를 수 있다', () => {
		expect(selectableScopes('finance-manager', defaults)).toEqual(defaults);
		for (const p of ['equity-analyst', 'house-signal', 'importer', 'custom']) {
			const s = selectableScopes(p, defaults);
			expect(s).toEqual(['read', 'journal:write']);
			expect(s).not.toContain('positions:propose');
			expect(s).not.toContain('principles:propose');
		}
	});
	it('importer만 만료 필수', () => {
		expect(expiryRequired('importer')).toBe(true);
		expect(expiryRequired('finance-manager')).toBe(false);
	});
});

describe('활동 기록 필터 파싱', () => {
	const uuid = '11111111-1111-4111-8111-111111111111';
	it('올바른 값만 받는다', () => {
		const f = parseAuditFilter(
			new URLSearchParams(`bot=${uuid}&tool=report.create&result=denied&warn=1&rule=R-VAL-T05`)
		);
		expect(f).toEqual({
			bot: uuid,
			tool: 'report.create',
			result: 'denied',
			warn: true,
			rule: 'R-VAL-T05'
		});
		expect(auditFilterActive(f)).toBe(true);
	});
	it('형식이 틀린 값(필터 문법 주입 포함)은 버린다', () => {
		const f = parseAuditFilter(
			new URLSearchParams('bot=x&tool=a,b)or(c&result=weird&warn=0&rule=r-val')
		);
		expect(f).toEqual({ bot: '', tool: '', result: '', warn: false, rule: '' });
		expect(auditFilterActive(f)).toBe(false);
	});
});

describe('argsPreview', () => {
	it('JSON 문자열로, 길면 자른다', () => {
		expect(argsPreview({ a: 1 }).text).toContain('"a": 1');
		expect(argsPreview(null).text).toBe('');
		expect(argsPreview({ t: 'x'.repeat(5000) }).text.length).toBe(ARGS_PREVIEW_MAX + 1);
	});

	it('잘렸는지 함께 알려 준다(N-2)', () => {
		expect(argsPreview({ a: 1 })).toEqual({ text: '{\n  "a": 1\n}', truncated: false });
		expect(argsPreview(null)).toEqual({ text: '', truncated: false });
		const long = argsPreview({ t: 'x'.repeat(5000) });
		expect(long.truncated).toBe(true);
		expect(long.text.length).toBe(ARGS_PREVIEW_MAX + 1);
		// 경계: 정확히 ARGS_PREVIEW_MAX자는 자르지 않는다
		const pad = ARGS_PREVIEW_MAX - JSON.stringify({ t: '' }, null, 2).length;
		expect(argsPreview({ t: 'y'.repeat(pad) })).toMatchObject({ truncated: false });
		expect(argsPreview({ t: 'y'.repeat(pad + 1) })).toMatchObject({ truncated: true });
	});
});

describe('QA Low-1: 만료 입력은 KST(+09:00)로 보낸다', () => {
	it('만료 형식 오류는 한글 안내로 바뀐다', () => {
		expect(settingsErrorMessage('expires_at must be a valid ISO datetime')).toBe(
			'만료 시각 형식이 올바르지 않아요.'
		);
	});

	it.each([
		['2026-11-30T10:00', '2026-11-30T10:00+09:00'],
		['2026-11-30T10:00:30', '2026-11-30T10:00:30+09:00'],
		['2026-11-30T10:00:30.500', '2026-11-30T10:00:30.500+09:00'],
		['', ''],
		['2026-11-30T10:00+09:00', '2026-11-30T10:00+09:00'],
		['2026-11-30T01:00:00.000Z', '2026-11-30T01:00:00.000Z'],
		['2026-11-30 10:00', '2026-11-30 10:00']
	])('withKstOffset(%j) → %j', (input, out) => {
		expect(withKstOffset(input)).toBe(out);
	});

	it('applyKstOffset은 FormData만 바꾸고 빈 값은 그대로 둔다', () => {
		const a = new FormData();
		a.set('expires_at', '2026-11-30T10:00');
		applyKstOffset(a);
		applyKstOffset(a); // 멱등
		expect(a.get('expires_at')).toBe('2026-11-30T10:00+09:00');

		const b = new FormData();
		b.set('expires_at', '');
		applyKstOffset(b);
		expect(b.get('expires_at')).toBe('');

		const c = new FormData();
		applyKstOffset(c);
		expect(c.has('expires_at')).toBe(false);
	});
});

describe('Info-2: 선택 만료 해제 확인', () => {
	it.each([
		['finance-manager', '2026-12-01T01:00:00Z', '', true],
		['custom', '2026-12-01T01:00:00Z', '  ', true],
		['custom', '2026-12-01T01:00:00Z', null, true],
		['custom', '2026-12-01T01:00:00Z', '2026-12-31T10:00+09:00', false],
		['custom', null, '', false],
		['importer', '2026-12-01T01:00:00Z', '', false]
	] as const)('%s / 현재 %s / 보냄 %j → %s', (profile, current, posted, want) => {
		expect(needsExpiryClearConfirm(profile, current, posted)).toBe(want);
	});
});
