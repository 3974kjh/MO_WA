/**
 * FE-08 보관함 화면 모델(서버 load·화면 공용, 순수 함수).
 *
 * - 보관 유형 6종(DS v1.3 §0-1·§7-14): 브리핑·일지·보유 종목·종목·결정 메모·일정.
 *   유형 키는 DB 테이블 이름 그대로다(모두 `archived_at` 열이 있다). 부동산(re_*)은 FE-08 범위가 아니다.
 * - '보관한 사람': 행에 archived_by 열이 없다. 봇 보관은 MCP 도구(archive_*)가 활동 기록(mcp_audit_log)에
 *   affected_ids와 함께 남기므로, 확정 매칭(도구 + table·id + 보관 시각 ±2분)이면 그 봇이다.
 *   실패 닫힘: 기록을 못 읽었거나, 상한에 걸려 그 행의 구간을 다 보지 못했으면 '—'(모름).
 *   구간을 다 보고도 매칭이 없을 때만 '나'(웹 보관은 활동 기록이 없다).
 *   보유 종목·종목은 봇 보관 도구가 없어(DB 가드) 항상 '나'.
 */
import { STATUS_LABEL } from '$lib/portfolio/view';

export const ARCHIVE_KINDS = [
	'reports',
	'journal_entries',
	'positions',
	'instruments',
	'decisions',
	'events'
] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];

/** 유형 라벨(용어집 v1.3: 보관함 유형) */
export const ARCHIVE_KIND_LABEL: Record<ArchiveKind, string> = {
	reports: '브리핑',
	journal_entries: '일지',
	positions: '보유 종목',
	instruments: '종목',
	decisions: '결정 메모',
	events: '일정'
};

/** 복원하면 다시 보이는 곳(원래 위치) */
export const ARCHIVE_KIND_ORIGIN: Record<ArchiveKind, string> = {
	reports: '브리핑 목록',
	journal_entries: '매매일지',
	positions: '보유·매수 계획',
	instruments: '종목',
	decisions: '결정 대기',
	events: '일정'
};

export function isArchiveKind(v: unknown): v is ArchiveKind {
	return typeof v === 'string' && (ARCHIVE_KINDS as readonly string[]).includes(v);
}

/* ── 서버가 읽는 행(열은 repo의 명시 select와 같다) ── */

export type ArchivedReportRow = {
	id: string;
	title: string;
	report_date: string;
	archived_at: string;
};
export type ArchivedJournalRow = {
	id: string;
	title: string;
	entry_date: string;
	archived_at: string;
};
export type ArchivedPositionRow = {
	id: string;
	status: string;
	archived_at: string;
	instruments: { ticker: string; name: string } | null;
};
export type ArchivedInstrumentRow = {
	id: string;
	ticker: string;
	name: string;
	archived_at: string;
};
export type ArchivedDecisionRow = {
	id: string;
	title: string;
	archived_at: string;
};
export type ArchivedEventRow = {
	id: string;
	title: string;
	event_date: string;
	archived_at: string;
};

export type ArchivedRowsByKind = {
	reports: ArchivedReportRow[];
	journal_entries: ArchivedJournalRow[];
	positions: ArchivedPositionRow[];
	instruments: ArchivedInstrumentRow[];
	decisions: ArchivedDecisionRow[];
	events: ArchivedEventRow[];
};

/** 화면 행 */
export type ArchiveItem = {
	id: string;
	kind: ArchiveKind;
	kindLabel: string;
	origin: string;
	title: string;
	archivedAt: string;
	archivedLabel: string;
	/** 보관한 사람: '나' · 봇 이름 · '—'(모름) */
	archivedBy: string;
	/** DataTable 제네릭(Record<string, unknown>) 호환 */
	[key: string]: unknown;
};

export function positionTitle(p: ArchivedPositionRow): string {
	const name = p.instruments?.name ?? p.instruments?.ticker ?? '종목 없음';
	const status = STATUS_LABEL[p.status];
	return status ? `${name} (${status})` : name;
}

function titleOf(kind: ArchiveKind, row: Record<string, unknown>): string {
	switch (kind) {
		case 'positions':
			return positionTitle(row as ArchivedPositionRow);
		case 'instruments': {
			const r = row as ArchivedInstrumentRow;
			return r.name && r.name !== r.ticker ? `${r.name} (${r.ticker})` : r.ticker;
		}
		case 'reports': {
			const r = row as ArchivedReportRow;
			return `${r.report_date} ${r.title}`;
		}
		case 'journal_entries': {
			const r = row as ArchivedJournalRow;
			return `${r.entry_date} ${r.title}`;
		}
		case 'events': {
			const r = row as ArchivedEventRow;
			return `${r.event_date} ${r.title}`;
		}
		case 'decisions':
			return String((row as ArchivedDecisionRow).title);
	}
}

const KST_PARTS = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Seoul',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});

function kstParts(d: Date): Record<string, string> {
	const out: Record<string, string> = {};
	for (const p of KST_PARTS.formatToParts(d)) out[p.type] = p.value;
	return out;
}

/** 보관한 날(KST). 올해면 `MM/DD HH:mm`, 아니면 `YYYY/MM/DD HH:mm`. 읽을 수 없으면 '—'. */
export function formatArchivedAt(iso: string, now: Date = new Date()): string {
	const d = new Date(iso);
	if (!iso || Number.isNaN(d.getTime())) return '—';
	const p = kstParts(d);
	const thisYear = kstParts(now).year;
	const md = `${p.month}/${p.day} ${p.hour}:${p.minute}`;
	return p.year === thisYear ? md : `${p.year}/${md}`;
}

/** 서버 행 → 화면 행. 유형 순서(ARCHIVE_KINDS) → 보관한 시각 최신순으로 묶는다. */
export function toArchiveItems(rows: ArchivedRowsByKind, now: Date = new Date()): ArchiveItem[] {
	const out: ArchiveItem[] = [];
	for (const kind of ARCHIVE_KINDS) {
		const list = [...(rows[kind] as Array<Record<string, unknown>>)].sort((a, b) =>
			String(b.archived_at).localeCompare(String(a.archived_at))
		);
		for (const row of list) {
			const archivedAt = String(row.archived_at ?? '');
			out.push({
				id: String(row.id),
				kind,
				kindLabel: ARCHIVE_KIND_LABEL[kind],
				origin: ARCHIVE_KIND_ORIGIN[kind],
				title: titleOf(kind, row),
				archivedAt,
				archivedLabel: formatArchivedAt(archivedAt, now),
				archivedBy: ARCHIVED_BY_UNKNOWN
			});
		}
	}
	return out;
}

/* ── 보관한 사람(봇 보관 활동 기록과 맞추기) ── */

/** 봇이 쓰는 보관 도구(MCP). 보유 종목·종목은 봇 보관 도구가 없다. */
export const BOT_ARCHIVE_TOOL: Partial<Record<ArchiveKind, string>> = {
	reports: 'archive_report',
	journal_entries: 'archive_journal_entry',
	decisions: 'archive_decision',
	events: 'archive_event'
};

export const ARCHIVED_BY_ME = '나';
export const ARCHIVED_BY_BOT = '봇';
export const ARCHIVED_BY_UNKNOWN = '—';
/** 보관 시각(archived_at)과 활동 기록 시각이 이만큼 안이면 같은 보관으로 본다 */
export const ARCHIVE_AUDIT_TOLERANCE_MS = 2 * 60 * 1000;

export type BotArchiveAudit = {
	bot_client_id: string | null;
	tool: string;
	affected_ids: unknown;
	created_at: string;
};

function touches(a: BotArchiveAudit, kind: ArchiveKind, id: string): boolean {
	if (!Array.isArray(a.affected_ids)) return false;
	return a.affected_ids.some(
		(x) =>
			x != null &&
			typeof x === 'object' &&
			(x as { table?: unknown }).table === kind &&
			(x as { id?: unknown }).id === id
	);
}

/**
 * 봇 보관 활동 기록을 읽은 결과.
 * - complete: since부터 지금까지 빠짐없이 읽었다(상한에 걸리지 않음).
 * - 상한에 걸렸으면(complete=false) 최신순으로 읽었으므로 oldestScanned(읽은 것 중 가장 오래된 시각)
 *   이후만 다 봤다. 그보다 오래된 구간은 보지 못했다.
 */
export type BotArchiveAuditScan = {
	rows: readonly BotArchiveAudit[];
	complete: boolean;
	oldestScanned: string | null;
};

/**
 * 한 행의 '보관한 사람'(실패 닫힘, fail-closed).
 * 1. 봇 보관 도구가 없는 유형(보유 종목·종목)은 항상 '나'(활동 기록을 못 읽어도).
 * 2. 활동 기록을 못 읽었으면(scan=null) '—'.
 * 3. 확정 매칭(도구 + affected_ids의 table·id + 보관 시각 ±2분)이면 봇 이름(없으면 '봇').
 * 4. 매칭이 없어도, 이 행의 매칭 구간(보관 시각 −2분 이후)을 빠짐없이 보지 못했으면 '—'.
 *    구간을 다 본 뒤에도 매칭이 없을 때만 '나'.
 */
export function archivedByOf(
	item: Pick<ArchiveItem, 'id' | 'kind' | 'archivedAt'>,
	scan: BotArchiveAuditScan | null,
	botNames: ReadonlyMap<string, string>
): string {
	const tool = BOT_ARCHIVE_TOOL[item.kind];
	if (!tool) return ARCHIVED_BY_ME;
	if (scan == null) return ARCHIVED_BY_UNKNOWN;
	const at = Date.parse(item.archivedAt);
	if (Number.isNaN(at)) return ARCHIVED_BY_UNKNOWN;
	const hit = scan.rows.find(
		(a) =>
			a.tool === tool &&
			touches(a, item.kind, item.id) &&
			Math.abs(Date.parse(a.created_at) - at) <= ARCHIVE_AUDIT_TOLERANCE_MS
	);
	if (hit) return (hit.bot_client_id && botNames.get(hit.bot_client_id)) || ARCHIVED_BY_BOT;
	if (!windowScanned(at, scan)) return ARCHIVED_BY_UNKNOWN;
	return ARCHIVED_BY_ME;
}

/** 이 행의 매칭 구간 [at−오차, at+오차]를 빠짐없이 읽었는가. */
function windowScanned(at: number, scan: BotArchiveAuditScan): boolean {
	if (scan.complete) return true;
	if (scan.oldestScanned == null) return false;
	const oldest = Date.parse(scan.oldestScanned);
	if (Number.isNaN(oldest)) return false;
	// 같은 시각의 기록이 잘렸을 수 있으므로 경계는 포함하지 않는다(엄격히 더 새로워야 다 본 것).
	return at - ARCHIVE_AUDIT_TOLERANCE_MS > oldest;
}

/** 봇 보관 기록을 찾을 범위의 시작(가장 오래된 보관 시각 − 허용 오차). 봇 보관 가능 유형이 없으면 null. */
export function auditWindowStart(items: readonly ArchiveItem[]): string | null {
	let min = Infinity;
	for (const it of items) {
		if (!BOT_ARCHIVE_TOOL[it.kind]) continue;
		const t = Date.parse(it.archivedAt);
		if (!Number.isNaN(t) && t < min) min = t;
	}
	return Number.isFinite(min) ? new Date(min - ARCHIVE_AUDIT_TOLERANCE_MS).toISOString() : null;
}

export type ArchiveCounts = Record<ArchiveKind | 'all', number>;

export function countArchive(items: readonly ArchiveItem[]): ArchiveCounts {
	const c = { all: items.length } as ArchiveCounts;
	for (const k of ARCHIVE_KINDS) c[k] = 0;
	for (const it of items) c[it.kind] += 1;
	return c;
}

/** 유형 칩 + 제목 검색(대소문자 무시). kind ''는 전체. */
export function filterArchive(
	items: readonly ArchiveItem[],
	kind: ArchiveKind | '',
	q: string
): ArchiveItem[] {
	const needle = q.trim().toLowerCase();
	return items.filter(
		(it) => (!kind || it.kind === kind) && (!needle || it.title.toLowerCase().includes(needle))
	);
}
