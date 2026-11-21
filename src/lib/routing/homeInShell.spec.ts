import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sectionFromPath } from '$lib/components/layout/nav';

vi.mock('$lib/server/repo', () => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	loadDashboardValuation: vi.fn(async () => ({ data: { totalKrw: 0 }, error: null })),
	getLatestIndicator: vi.fn(async () => ({
		data: { key: 'kospi', value: 1, change_pct: 0, as_of: '2026-11-21' },
		error: null
	})),
	listBriefingsWithKospi: vi.fn(async () => ({
		data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
		error: null
	}))
}));

import { load as homeLoad } from '../../routes/(app)/+page.server';
import { actions as logoutActions, load as logoutLoad } from '../../routes/logout/+page.server';

const root = resolvePath(__dirname, '../../..');
const read = (p: string) => readFileSync(resolvePath(root, p), 'utf8');

beforeEach(() => {
	vi.clearAllMocks();
});

/** redirect()가 던진 값을 잡아 {status, location}으로 돌려준다. */
async function catchRedirect(fn: () => unknown) {
	try {
		await fn();
	} catch (e) {
		if (isRedirect(e)) return { status: e.status, location: e.location };
		throw e;
	}
	throw new Error('redirect not thrown');
}

describe('홈(`/`)은 (app) 셸 안 (#12 Low 1, 사용자 결정 21:27)', () => {
	it('홈 페이지는 (app) 그룹에만 있고 루트에는 없다', () => {
		expect(existsSync(resolvePath(root, 'src/routes/(app)/+page.svelte'))).toBe(true);
		expect(existsSync(resolvePath(root, 'src/routes/(app)/+page.server.ts'))).toBe(true);
		expect(existsSync(resolvePath(root, 'src/routes/+page.svelte'))).toBe(false);
		expect(existsSync(resolvePath(root, 'src/routes/+page.server.ts'))).toBe(false);
	});
	it('/login은 셸 밖에 남는다', () => {
		expect(existsSync(resolvePath(root, 'src/routes/login/+page.svelte'))).toBe(true);
		expect(existsSync(resolvePath(root, 'src/routes/(app)/login'))).toBe(false);
	});
	it('`/`에서 홈 탭이 현재 섹션이다', () => {
		expect(sectionFromPath('/')).toBe('dashboard');
	});
	it('홈 본문은 HF-1 최소 내용만(전체 화면 레이아웃·FE-03 대시보드 없음)', () => {
		const src = read('src/routes/(app)/+page.svelte');
		expect(src).toContain('data-testid="mo-wa-authenticated-landing"');
		expect(src).toContain('으로 로그인됨');
		expect(src).not.toContain('min-h-dvh');
		expect(src).not.toMatch(/<main[\s>]/);
	});
	it('로그인 안 한 `/` 요청은 /login으로 보낸다', async () => {
		const r = await catchRedirect(() =>
			homeLoad({ locals: { user: null }, parent: async () => ({}) } as never)
		);
		expect(r).toEqual({ status: 303, location: '/login' });
	});
	it('로그인한 `/`는 user와 BE-11 dashboard load 필드를 돌려준다', async () => {
		const data = await homeLoad({
			locals: {
				user: { id: 'u1', email: 'a@b.c', app_metadata: {} },
				supabase: {}
			},
			parent: async () => ({}),
			url: new URL('https://example.test/')
		} as never);
		expect(data).toMatchObject({
			user: { id: 'u1', email: 'a@b.c' },
			valuation: { totalKrw: 0 },
			valuationError: null,
			kospi: { key: 'kospi' },
			recentBriefings: []
		});
		expect(data).not.toHaveProperty('actions');
	});

	it('(app)/+page.server.ts has no logout action (use /logout)', () => {
		const src = read('src/routes/(app)/+page.server.ts');
		expect(src).not.toMatch(/export const actions/);
		expect(src).not.toMatch(/\blogout\b\s*:/);
		expect(src).not.toMatch(/signOut/);
	});
});

describe('전용 로그아웃 경로 (#12 Low 2)', () => {
	it('셸·더보기·홈 모두 LOGOUT_PATH를 쓰고 `?/logout` 하드코딩이 없다', () => {
		for (const p of [
			'src/lib/components/layout/AppShell.svelte',
			'src/lib/components/layout/MoreSheet.svelte',
			'src/routes/(app)/+page.svelte'
		]) {
			const src = read(p);
			expect(src, p).toContain('action={resolve(LOGOUT_PATH)}');
			expect(src, p).not.toContain('?/logout');
		}
	});
	it('기본 액션은 signOut 후 303 /login', async () => {
		const signOut = vi.fn(async () => ({ error: null }));
		const r = await catchRedirect(() =>
			logoutActions.default({ locals: { supabase: { auth: { signOut } } } } as never)
		);
		expect(signOut).toHaveBeenCalledTimes(1);
		expect(r).toEqual({ status: 303, location: '/login' });
	});
	it('GET /logout은 화면 없이 홈으로 돌려보낸다', async () => {
		const r = await catchRedirect(() => logoutLoad({} as never));
		expect(r).toEqual({ status: 303, location: '/' });
	});
});
