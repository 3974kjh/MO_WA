import { describe, expect, it } from 'vitest';
import {
	ARCHIVE_AUDIT_TOLERANCE_MS,
	ARCHIVE_KINDS,
	ARCHIVE_KIND_LABEL,
	ARCHIVED_BY_BOT,
	ARCHIVED_BY_ME,
	ARCHIVED_BY_UNKNOWN,
	archivedByOf,
	auditWindowStart,
	countArchive,
	filterArchive,
	formatArchivedAt,
	isArchiveKind,
	toArchiveItems,
	type ArchivedRowsByKind
} from './view';

const NOW = new Date('2026-11-22T03:00:00+09:00');

function rows(over: Partial<ArchivedRowsByKind> = {}): ArchivedRowsByKind {
	return {
		reports: [],
		journal_entries: [],
		positions: [],
		instruments: [],
		decisions: [],
		events: [],
		...over
	};
}

describe('FE-08 보관함 유형', () => {
	it('6개 유형, 용어집 표시 이름(부동산 없음)', () => {
		expect(ARCHIVE_KINDS.map((k) => ARCHIVE_KIND_LABEL[k])).toEqual([
			'브리핑',
			'일지',
			'보유 종목',
			'종목',
			'결정 메모',
			'일정'
		]);
		expect(isArchiveKind('journal_entries')).toBe(true);
		expect(isArchiveKind('re_complexes')).toBe(false);
		expect(isArchiveKind('re_subscriptions')).toBe(false);
		expect(isArchiveKind('')).toBe(false);
		expect(isArchiveKind(undefined)).toBe(false);
	});
});

describe('보관한 날(KST)', () => {
	it('올해는 MM/DD HH:mm, 다른 해는 연도를 붙인다', () => {
		expect(formatArchivedAt('2026-11-20T09:02:00Z', NOW)).toBe('11/20 18:02');
		expect(formatArchivedAt('2025-12-31T15:30:00Z', NOW)).toBe('01/01 00:30');
		expect(formatArchivedAt('2025-06-01T00:00:00Z', NOW)).toBe('2025/06/01 09:00');
	});
	it('읽을 수 없으면 —', () => {
		expect(formatArchivedAt('', NOW)).toBe('—');
		expect(formatArchivedAt('nope', NOW)).toBe('—');
	});
});

describe('서버 행 → 화면 행', () => {
	const data = rows({
		reports: [
			{
				id: 'r1',
				title: '오래된 것',
				report_date: '2026-10-01',
				archived_at: '2026-11-01T00:00:00Z'
			},
			{ id: 'r2', title: '새 것', report_date: '2026-11-01', archived_at: '2026-11-10T00:00:00Z' }
		],
		journal_entries: [
			{ id: 'j1', title: '메모', entry_date: '2026-11-05', archived_at: '2026-11-15T00:00:00Z' }
		],
		positions: [
			{
				id: 'p1',
				status: 'closed',
				archived_at: '2026-11-02T00:00:00Z',
				instruments: { ticker: 'SGOV', name: 'iShares 0-3M' }
			},
			{ id: 'p2', status: 'weird', archived_at: '2026-11-03T00:00:00Z', instruments: null }
		],
		instruments: [
			{ id: 'i1', ticker: 'AAPL', name: 'Apple', archived_at: '2026-11-04T00:00:00Z' },
			{ id: 'i2', ticker: 'QQQ', name: 'QQQ', archived_at: '2026-11-04T00:00:00Z' }
		],
		decisions: [{ id: 'd1', title: '선택지', archived_at: '2026-11-06T00:00:00Z' }],
		events: [
			{ id: 'e1', title: '만기', event_date: '2026-12-01', archived_at: '2026-11-07T00:00:00Z' }
		]
	});
	const items = toArchiveItems(data, NOW);

	it('유형 순서로 묶고, 유형 안에서는 보관 최신순', () => {
		expect(items.map((i) => i.id)).toEqual(['r2', 'r1', 'j1', 'p2', 'p1', 'i1', 'i2', 'd1', 'e1']);
	});
	it('제목·유형·원래 위치', () => {
		const by = Object.fromEntries(items.map((i) => [i.id, i]));
		expect(by.r2.title).toBe('2026-11-01 새 것');
		expect(by.r2.kindLabel).toBe('브리핑');
		expect(by.r2.origin).toBe('브리핑 목록');
		expect(by.j1.title).toBe('2026-11-05 메모');
		expect(by.p1.title).toBe('iShares 0-3M (보유 종료)');
		expect(by.p2.title).toBe('종목 없음');
		expect(by.i1.title).toBe('Apple (AAPL)');
		expect(by.i2.title).toBe('QQQ');
		expect(by.d1.title).toBe('선택지');
		expect(by.e1.title).toBe('2026-12-01 만기');
		expect(by.e1.origin).toBe('일정');
		expect(by.d1.archivedBy).toBe(ARCHIVED_BY_UNKNOWN);
	});
	it('건수·필터', () => {
		const c = countArchive(items);
		expect(c).toMatchObject({
			all: 9,
			reports: 2,
			journal_entries: 1,
			positions: 2,
			instruments: 2,
			decisions: 1,
			events: 1
		});
		expect(filterArchive(items, 'reports', '').map((i) => i.id)).toEqual(['r2', 'r1']);
		expect(filterArchive(items, '', 'APPLE').map((i) => i.id)).toEqual(['i1']);
		expect(filterArchive(items, 'events', 'apple')).toEqual([]);
		expect(filterArchive(items, '', '  ')).toHaveLength(9);
	});
});

describe('보관한 사람', () => {
	const at = '2026-11-20T09:00:00.000Z';
	const item = { id: 'j1', kind: 'journal_entries' as const, archivedAt: at };
	const names = new Map([['b1', '투자 관리 봇']]);
	const audit = (over: Record<string, unknown> = {}) => ({
		bot_client_id: 'b1',
		tool: 'archive_journal_entry',
		affected_ids: [{ table: 'journal_entries', id: 'j1' }],
		created_at: '2026-11-20T09:00:01.000Z',
		...over
	});

	it('보관 시각 근처의 봇 보관 기록이면 봇 이름', () => {
		expect(archivedByOf(item, [audit()], names)).toBe('투자 관리 봇');
		expect(archivedByOf(item, [audit({ bot_client_id: 'gone' })], names)).toBe(ARCHIVED_BY_BOT);
	});
	it('기록이 없거나, 다른 행·다른 도구·시간 차가 크면 나', () => {
		expect(archivedByOf(item, [], names)).toBe(ARCHIVED_BY_ME);
		expect(
			archivedByOf(item, [audit({ affected_ids: [{ table: 'journal_entries', id: 'x' }] })], names)
		).toBe(ARCHIVED_BY_ME);
		expect(
			archivedByOf(item, [audit({ affected_ids: [{ table: 'reports', id: 'j1' }] })], names)
		).toBe(ARCHIVED_BY_ME);
		expect(archivedByOf(item, [audit({ tool: 'archive_report' })], names)).toBe(ARCHIVED_BY_ME);
		expect(archivedByOf(item, [audit({ affected_ids: null })], names)).toBe(ARCHIVED_BY_ME);
		const late = new Date(Date.parse(at) + ARCHIVE_AUDIT_TOLERANCE_MS + 1000).toISOString();
		expect(archivedByOf(item, [audit({ created_at: late })], names)).toBe(ARCHIVED_BY_ME);
	});
	it('기록을 읽지 못하면 봇이 보관할 수 있는 유형은 —', () => {
		expect(archivedByOf(item, null, names)).toBe(ARCHIVED_BY_UNKNOWN);
	});
	it('보유 종목·종목은 봇이 보관할 수 없어 항상 나', () => {
		expect(archivedByOf({ id: 'p', kind: 'positions', archivedAt: at }, null, names)).toBe(
			ARCHIVED_BY_ME
		);
		expect(archivedByOf({ id: 'i', kind: 'instruments', archivedAt: at }, [], names)).toBe(
			ARCHIVED_BY_ME
		);
	});
	it('활동 기록 검색 시작 = 봇 보관 가능 유형의 가장 오래된 보관 시각 − 허용 오차', () => {
		const items = toArchiveItems(
			rows({
				positions: [
					{ id: 'p', status: 'closed', archived_at: '2026-01-01T00:00:00Z', instruments: null }
				],
				decisions: [{ id: 'd', title: 't', archived_at: '2026-11-20T00:02:00Z' }],
				events: [
					{ id: 'e', title: 't', event_date: '2026-11-30', archived_at: '2026-11-21T00:00:00Z' }
				]
			}),
			NOW
		);
		expect(auditWindowStart(items)).toBe('2026-11-20T00:00:00.000Z');
		expect(auditWindowStart(items.filter((i) => i.kind === 'positions'))).toBeNull();
	});
});
