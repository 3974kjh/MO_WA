/**
 * FE-09 N-3: JS 없는 첫 화면(SSR)에서 hidden scopes는 빈 값이어야 한다.
 * 그래야 프로필만 바꿔 native 제출해도 서버가 그 프로필의 기본 권한을 쓴다(확대 없음).
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

import Page from './+page.svelte';

const PROFILE_SCOPES = {
	'finance-manager': ['read', 'positions:propose', 'principles:propose'],
	'equity-analyst': ['read', 'valuations:write'],
	importer: ['import:all'],
	custom: ['read']
};

describe('설정 SSR (no-JS)', () => {
	it('발급 폼의 hidden scopes는 SSR에서 빈 값(제안 권한을 미리 싣지 않음)', () => {
		const { body } = render(Page, {
			props: {
				data: {
					title: '설정',
					ruleIdCounts: {},
					botClients: [],
					profileScopes: PROFILE_SCOPES,
					error: null
				} as never
			}
		});
		const m = body.match(/<input[^>]*name="scopes"[^>]*>/);
		expect(m).not.toBeNull();
		const tag = m![0];
		expect(tag).toContain('type="hidden"');
		expect(tag).not.toMatch(/propose/);
		expect(tag).toMatch(/value=""/);
		expect(body).toContain('data-testid="bot-issue-form"');
	});
});
