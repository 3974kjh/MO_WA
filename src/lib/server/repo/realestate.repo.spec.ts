/**
 * FE-12 realestate.repo: 실제 supabase-js가 만든 요청 URL로 읽기 조건을 확인한다(네트워크 없음).
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import {
	listRecentComplexSnapshots,
	listReComplexesForMap,
	RE_SNAPSHOT_SCAN_MAX
} from './realestate.repo';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

function stub() {
	const requests: Array<{ method: string; table: string; params: URLSearchParams }> = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		requests.push({
			method: (init?.method ?? 'GET').toUpperCase(),
			table: url.pathname.replace(/^\/rest\/v1\//, ''),
			params: url.searchParams
		});
		return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
	};
	const sb = createClient('http://stub.local', 'stub-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchStub as typeof fetch }
	});
	return { repo: forUser(sb as never, OWNER), requests };
}

describe('FE-12 realestate.repo (읽기 전용)', () => {
	it('단지: 보관 제외 · owner만 · 필요 열만(meta 전체 대신 i7_roles) · GET', async () => {
		const { repo, requests } = stub();
		await listReComplexesForMap(repo);
		const r = requests[0];
		expect(r.method).toBe('GET');
		expect(r.table).toBe('re_complexes');
		expect(new Set(r.params.getAll('owner_id'))).toEqual(new Set([`eq.${OWNER}`]));
		expect(r.params.get('archived_at')).toBe('is.null');
		const sel = r.params.get('select')!.replace(/\s/g, '');
		expect(sel).toContain('roles:meta->i7_roles');
		expect(sel).toContain('lat');
		expect(sel.split(',')).not.toContain('meta');
		expect(sel).not.toContain('scores');
	});

	it('스냅샷: 그 단지들만 · 최신 순 · 상한 · owner만 · GET, 빈 목록이면 요청 없음', async () => {
		const { repo, requests } = stub();
		await listRecentComplexSnapshots(repo, []);
		expect(requests).toHaveLength(0);
		await listRecentComplexSnapshots(repo, ['c1', 'c2']);
		const r = requests[0];
		expect(r.method).toBe('GET');
		expect(r.table).toBe('re_complex_snapshots');
		expect(r.params.get('complex_id')).toBe('in.(c1,c2)');
		expect(r.params.get('order')).toBe('as_of.desc');
		expect(r.params.get('limit')).toBe(String(RE_SNAPSHOT_SCAN_MAX));
		expect(new Set(r.params.getAll('owner_id'))).toEqual(new Set([`eq.${OWNER}`]));
	});
});
