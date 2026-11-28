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

/** 만료 입력(datetime-local)은 KST 벽시계 시각. 오프셋 없는 값 형태(초·소수 초 선택). */
const NAIVE_LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
export const KST_OFFSET = '+09:00';

/**
 * QA Low-1: datetime-local 값에 항상 `+09:00`을 붙인다(브라우저 시간대는 쓰지 않는다).
 * 빈 값은 그대로, 이미 오프셋이 있거나 형식이 다른 값도 그대로 둔다(서버가 판단).
 */
export function withKstOffset(value: string): string {
	return NAIVE_LOCAL_DATETIME_RE.test(value) ? `${value}${KST_OFFSET}` : value;
}

/** 제출 직전 FormData의 만료 값을 KST 오프셋이 붙은 값으로 바꾼다. 화면의 입력값은 건드리지 않는다. */
export function applyKstOffset(formData: FormData, key = 'expires_at'): void {
	const v = formData.get(key);
	if (typeof v !== 'string') return;
	const next = withKstOffset(v.trim());
	if (next !== v) formData.set(key, next);
}

/**
 * Info-2: importer가 아닌 키에 만료가 있는데 빈 값으로 '만료 설정'을 누르면 만료가 해제된다.
 * 이때만 확인을 거친다(importer는 만료 필수라 빈 값 제출 자체가 막힌다).
 */
export function needsExpiryClearConfirm(
	profile: string,
	currentExpiresAt: string | null | undefined,
	posted: FormDataEntryValue | null
): boolean {
	// posted === null(값이 아예 오지 않음)도 확인 대상으로 본다. 보수적 선택: 값이 빠졌을 때
	// 확인 시트를 건너뛰면 만료가 조용히 해제될 수 있으므로, 확실히 값이 있을 때만 통과시킨다.
	return (
		!expiryRequired(profile) &&
		!!currentExpiresAt &&
		(posted === null || (typeof posted === 'string' && posted.trim() === ''))
	);
}

/** 해당 프로필에서 고를 수 있는 권한 범위(제안 권한은 finance-manager 밖에서는 제외). */
export function selectableScopes(profile: string, defaults: readonly string[]): string[] {
	if (profile === FINANCE_MANAGER_PROFILE) return [...defaults];
	return defaults.filter((s) => !(PROPOSE_SCOPES as readonly string[]).includes(s));
}

/**
 * 기본 권한에 넣지 않고 발급할 때 직접 체크해야만 켜지는 권한(체크 상태로 시작하지 않는다).
 * `market:feed` = 일일 시세 적재 전용(재무 관리 봇만). 서버 목록(botProfiles OPT_IN_SCOPES)과 같아야 한다.
 */
export const OPT_IN_SCOPES = ['market:feed'] as const;
export const OPT_IN_SCOPE_LABEL: Record<string, string> = {
	'market:feed': '일일 시세 적재 전용 (market:feed)'
};

/** 해당 프로필에서 직접 골라야만 켜지는 권한. 기본값에는 절대 들어가지 않는다. */
export function optInScopes(profile: string): string[] {
	return profile === FINANCE_MANAGER_PROFILE ? [...OPT_IN_SCOPES] : [];
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
	[/unknown scope/i, '알 수 없는 권한 범위예요.'],
	[/market:feed must be the only scope/i, '시세 적재 권한은 다른 권한과 함께 줄 수 없어요.'],
	[/market:feed requires finance-manager/i, '시세 적재 권한은 재무 관리 봇에만 줄 수 있어요.'],
	[/finance-manager must not receive/i, '재무 관리 봇에는 평가·원칙 쓰기 권한을 줄 수 없어요.'],
	[/not found or already revoked/i, '이미 사용 중지됐거나 찾을 수 없는 키예요.'],
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

/** args_preview를 상세 시트에 보여 줄 문자열과 잘림 여부(길면 ARGS_PREVIEW_MAX자에서 자른다). */
export function argsPreview(v: unknown): { text: string; truncated: boolean } {
	if (v == null) return { text: '', truncated: false };
	let s: string;
	try {
		s = JSON.stringify(v, null, 2) ?? '';
	} catch {
		return { text: '', truncated: false };
	}
	return s.length > ARGS_PREVIEW_MAX
		? { text: `${s.slice(0, ARGS_PREVIEW_MAX)}…`, truncated: true }
		: { text: s, truncated: false };
}
