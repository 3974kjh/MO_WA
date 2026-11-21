/**
 * FE-09 설정 화면의 순수 로직(서버·클라이언트 공용). 규칙 ID 비노출 문구, 권한 범위 선택,
 * 활동 기록 필터 파싱을 모았다.
 */

export const ACTION_FALLBACK_MESSAGE = '요청을 처리하지 못했어요.';

/** 제안 권한은 finance-manager 프로필에서만 켤 수 있다(BE-12 계약, R-PERM-10). */
export const PROPOSE_SCOPES = ['positions:propose', 'principles:propose'] as const;
export const FINANCE_MANAGER_PROFILE = 'finance-manager';

export const PROFILE_LABEL: Record<string, string> = {
	'finance-manager': '재무 관리 봇',
	'equity-analyst': '종목 분석 봇',
	'house-signal': '부동산 신호 봇',
	importer: '가져오기 봇',
	custom: '직접 구성'
};

export function profileLabel(profile: string): string {
	return PROFILE_LABEL[profile] ?? profile;
}

/** importer 프로필은 만료일이 필수. */
export function expiryRequired(profile: string): boolean {
	return profile === 'importer';
}

/** 해당 프로필에서 고를 수 있는 권한 범위(제안 권한은 finance-manager 밖에서는 제외). */
export function selectableScopes(profile: string, defaults: readonly string[]): string[] {
	if (profile === FINANCE_MANAGER_PROFILE) return [...defaults];
	return defaults.filter((s) => !(PROPOSE_SCOPES as readonly string[]).includes(s));
}

/** 서버가 주는 영문 안내를 한글로 바꾼다. 규칙 ID 태그(`[R-XXX-00]`)는 지운다. */
const MESSAGE_MAP: Array<[RegExp, string]> = [
	[/name is required/i, '이름을 입력해 주세요.'],
	[/profile is invalid/i, '프로필을 다시 골라 주세요.'],
	[/importer keys require an expiry/i, '가져오기 봇 키는 만료일을 꼭 정해야 해요.'],
	[/expires_at must be a valid/i, '만료 시각 형식이 올바르지 않아요.'],
	[/rate_limit_per_min/i, '분당 한도는 1~600 사이 정수로 입력해 주세요.'],
	[/scopes must be/i, '권한 범위 형식이 올바르지 않아요.'],
	[
		/positions:propose and principles:propose require/i,
		'제안 권한(포지션·원칙)은 재무 관리 봇에만 줄 수 있어요.'
	],
	[/finance-manager must not receive/i, '재무 관리 봇에는 평가·원칙 쓰기 권한을 줄 수 없어요.'],
	[/not found or already revoked/i, '이미 폐기됐거나 찾을 수 없는 키예요.'],
	[/bot client not found/i, '키를 찾을 수 없어요.'],
	[/id is required/i, '대상 키를 찾을 수 없어요.'],
	[/server_misconfigured/i, '서버 설정 문제로 키를 발급하지 못했어요.'],
	[/could not allocate/i, '키를 만들지 못했어요. 잠시 후 다시 시도해 주세요.']
];

const RULE_TAG = /\[R-[A-Z0-9-]+\]\s*/g;

export function settingsErrorMessage(raw: unknown): string {
	if (typeof raw !== 'string' || raw.trim() === '') return ACTION_FALLBACK_MESSAGE;
	for (const [re, ko] of MESSAGE_MAP) if (re.test(raw)) return ko;
	const cleaned = raw.replace(RULE_TAG, '').trim();
	// 한글이 없는 원문(영문 시스템 문구)은 그대로 내보내지 않는다.
	return /[가-힣]/.test(cleaned) && !/\bR-[A-Z]+-\d+/.test(cleaned)
		? cleaned
		: ACTION_FALLBACK_MESSAGE;
}

// ——— 활동 기록 ———

export const AUDIT_RESULTS = ['ok', 'error', 'denied', 'rate_limited'] as const;
export type AuditResultValue = (typeof AUDIT_RESULTS)[number];

export const AUDIT_RESULT_LABEL: Record<AuditResultValue, string> = {
	ok: '성공',
	error: '오류',
	denied: '거부됨',
	rate_limited: '한도 초과'
};

export function auditResultLabel(result: string): string {
	return AUDIT_RESULT_LABEL[result as AuditResultValue] ?? result;
}

export type AuditFilter = {
	bot: string;
	tool: string;
	result: AuditResultValue | '';
	warn: boolean;
	rule: string;
};

export const EMPTY_AUDIT_FILTER: AuditFilter = {
	bot: '',
	tool: '',
	result: '',
	warn: false,
	rule: ''
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOOL_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const RULE_RE = /^R-[A-Z0-9]+-[A-Z0-9]+$/;

/** URL 쿼리 → 필터. 형식이 맞지 않는 값은 조용히 버린다(쿼리로 필터 문법을 주입할 수 없게). */
export function parseAuditFilter(sp: URLSearchParams): AuditFilter {
	const bot = sp.get('bot') ?? '';
	const tool = (sp.get('tool') ?? '').trim();
	const result = sp.get('result') ?? '';
	const rule = (sp.get('rule') ?? '').trim();
	return {
		bot: UUID_RE.test(bot) ? bot : '',
		tool: TOOL_RE.test(tool) ? tool : '',
		result: (AUDIT_RESULTS as readonly string[]).includes(result)
			? (result as AuditResultValue)
			: '',
		warn: sp.get('warn') === '1',
		rule: RULE_RE.test(rule) ? rule : ''
	};
}

export function auditFilterActive(f: AuditFilter): boolean {
	return f.bot !== '' || f.tool !== '' || f.result !== '' || f.warn || f.rule !== '';
}

export const ARGS_PREVIEW_MAX = 2000;

/** args_preview를 상세 시트에 보여 줄 문자열로(길면 자른다). */
export function formatArgsPreview(v: unknown): string {
	if (v == null) return '';
	let s: string;
	try {
		s = JSON.stringify(v, null, 2) ?? '';
	} catch {
		return '';
	}
	return s.length > ARGS_PREVIEW_MAX ? `${s.slice(0, ARGS_PREVIEW_MAX)}…` : s;
}
