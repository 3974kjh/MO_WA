import { describe, expect, it } from 'vitest';
import { FALLBACK_COPY, NAV_COPY_ROUTES, NAV_DONE_TEXT, navCopyFor } from './navCopy';

describe('라우트별 로딩 문구', () => {
	it('종목: 불러오는 중 → 시세 기준 시각 확인 중 → 화면 구성 중', () => {
		expect(navCopyFor('/(app)/stocks').steps).toEqual([
			'보유 종목 불러오는 중',
			'시세 기준 시각 확인 중',
			'화면 구성 중'
		]);
	});

	it('(app) 그룹 접두가 있어도 없어도 같은 문구, 홈은 "/(app)"', () => {
		expect(navCopyFor('/(app)/portfolio')).toBe(navCopyFor('/portfolio'));
		expect(navCopyFor('/(app)').name).toBe('홈');
	});

	it('모르는 라우트·null은 일반 문구', () => {
		expect(navCopyFor('/(app)/nope')).toBe(FALLBACK_COPY);
		expect(navCopyFor(null)).toBe(FALLBACK_COPY);
	});

	it('모든 문구는 3단계이고 마지막은 화면 구성 중, 각 단계는 서로 다르다', () => {
		for (const id of [...NAV_COPY_ROUTES, '/nope']) {
			const { steps, name } = navCopyFor(id);
			expect(name.length).toBeGreaterThan(0);
			expect(steps).toHaveLength(3);
			expect(steps[2]).toBe('화면 구성 중');
			expect(new Set(steps).size).toBe(3);
		}
	});

	it('용어표 §0-1: 활동 기록·봇 연결 (감사·봇 키·평가액 같은 옛말 금지)', () => {
		expect(navCopyFor('/(app)/settings/audit').name).toBe('활동 기록');
		expect(navCopyFor('/(app)/settings').steps[1]).toBe('봇 연결·활동 기록 확인 중');
		const all = [...NAV_COPY_ROUTES, '/nope'].flatMap((id) => {
			const c = navCopyFor(id);
			return [c.name, ...c.steps];
		});
		for (const old of ['감사', '봇 키', '평가액', '대시보드', '승인', '충돌', '평단', '트리거']) {
			expect(all.filter((t) => t.includes(old))).toEqual([]);
		}
	});

	it('완료 문구는 단계 문구와 다르다', () => {
		for (const id of NAV_COPY_ROUTES) expect(navCopyFor(id).steps).not.toContain(NAV_DONE_TEXT);
	});

	it('(app) 안의 모든 화면 라우트에 문구가 있다', () => {
		expect(NAV_COPY_ROUTES.sort()).toEqual(
			[
				'/',
				'/analyses/[slug]',
				'/archive',
				'/briefings',
				'/briefings/[date]',
				'/journal',
				'/journal/[id]',
				'/portfolio',
				'/realestate',
				'/settings',
				'/settings/audit',
				'/stocks',
				'/stocks/[ticker]'
			].sort()
		);
	});
});
