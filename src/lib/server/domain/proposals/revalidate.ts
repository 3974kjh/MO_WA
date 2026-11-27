/**
 * 승인 시점 재검증 (approve-time re-validation).
 *
 * approve_proposal 은 `proposed_values || overrides` 를 그대로 positions 에 쓴다. 그런데 앱의 validateOverrides 는
 * 사용자가 보낸 overrides 만 검사하므로, 고치지 않고 그대로 승인하면 봇이 보낸 proposed_values 는 DB 의 INSERT 트리거
 * (키 허용목록·필수값·수량 M03)와 positions CHECK 만 거친다. 소수 자릿수(R-FMT-13)는 어디에서도 검사하지 않아
 * numeric(20,6) 이 조용히 반올림한다. 이 함수는 *합친 값* 을 propose 시점과 같은 규칙으로 다시 검사한다.
 *
 * proposed_values 는 INSERT 후 DB 트리거가 못 바꾸게 막아 두므로(immutable) 이 검사는 경쟁 조건이 없다.
 * 보유(positions) 상태가 바뀌었는지는 여기서 보지 않는다 — approve_proposal 이 base_version 으로 원자적으로 본다.
 */
import { parseQty, type AssetType } from '$lib/schemas/qty';
import {
	allowedOverrideKeys,
	DIRECT_WRITE_OVERRIDE_KEYS,
	hasAtMostNDecimals,
	type ProposalChangeType,
	type ProposedByType
} from './overrides';

export type RevalidateRuleId =
	| 'R-VAL-P07'
	| 'R-PERM-13'
	| 'R-VAL-P04'
	| 'R-VAL-M01'
	| 'R-VAL-M02'
	| 'R-VAL-M03'
	| 'R-FMT-13';

export type RevalidateErr = {
	ok: false;
	ruleId: RevalidateRuleId;
	message: string;
	/** 문제가 된 값의 키 (`proposed_values` 자체면 'proposed_values') */
	key: string;
	/** 문제 값이 봇이 보낸 값(proposed)인지 사용자가 고친 값(override)인지. 화면 문구가 달라진다 */
	source: 'proposed' | 'override';
};
export type RevalidateOk = { ok: true; merged: Record<string, unknown> };

const CURRENCIES = ['KRW', 'USD'];
const has = (o: Record<string, unknown>, k: string) => Object.hasOwn(o, k) && o[k] !== undefined;

export function revalidateMergedForApprove(input: {
	changeType: ProposalChangeType;
	proposedByType?: ProposedByType;
	proposedValues: unknown;
	/** validateOverrides 를 통과한 값 */
	overrides: Record<string, unknown>;
	assetType?: AssetType | null;
}): RevalidateOk | RevalidateErr {
	const { proposedValues, overrides } = input;
	const fail = (ruleId: RevalidateRuleId, key: string, message: string): RevalidateErr => ({
		ok: false,
		ruleId,
		key,
		message,
		source: Object.hasOwn(overrides, key) ? 'override' : 'proposed'
	});

	if (
		proposedValues === null ||
		typeof proposedValues !== 'object' ||
		Array.isArray(proposedValues)
	) {
		return fail('R-VAL-P07', 'proposed_values', '[R-VAL-P07] proposed_values must be an object');
	}
	const merged: Record<string, unknown> = {
		...(proposedValues as Record<string, unknown>),
		...overrides
	};

	// 키 허용목록 (DB INSERT 트리거와 같은 목록). 직접 쓰기 필드는 P07, 그 밖은 R-PERM-13.
	const allowed = new Set<string>(
		allowedOverrideKeys(input.changeType, input.proposedByType ?? 'bot')
	);
	for (const key of Object.keys(merged)) {
		if ((DIRECT_WRITE_OVERRIDE_KEYS as readonly string[]).includes(key)) {
			return fail(
				'R-VAL-P07',
				key,
				`[R-VAL-P07] ${key} is a direct-write field and cannot be applied`
			);
		}
		if (!allowed.has(key)) {
			return fail('R-PERM-13', key, `[R-PERM-13] field ${key} not allowed for ${input.changeType}`);
		}
	}

	if (input.changeType === 'open_holding' && !(has(merged, 'qty') && has(merged, 'avg_price'))) {
		return fail('R-VAL-P04', 'proposed_values', '[R-VAL-P04] open_holding needs qty and avg_price');
	}
	if (input.changeType === 'set_qty_avg' && !has(merged, 'qty') && !has(merged, 'avg_price')) {
		return fail(
			'R-VAL-P07',
			'proposed_values',
			'[R-VAL-P07] set_qty_avg needs qty and/or avg_price'
		);
	}

	if (has(merged, 'qty')) {
		const qty = merged.qty;
		if (typeof qty !== 'number' || !Number.isFinite(qty)) {
			return fail('R-VAL-M03', 'qty', '[R-VAL-M03] qty must be a finite number');
		}
		if (qty <= 0) return fail('R-VAL-P04', 'qty', '[R-VAL-P04] qty must be greater than 0');
		if (input.assetType) {
			const parsed = parseQty(input.assetType, qty, 'holding');
			if (!parsed.success) return fail('R-VAL-M03', 'qty', parsed.message);
		}
	}
	if (has(merged, 'avg_price')) {
		const price = merged.avg_price;
		if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
			return fail('R-VAL-M02', 'avg_price', '[R-VAL-M02] avg_price must be a positive number');
		}
		if (!hasAtMostNDecimals(price, 4)) {
			return fail(
				'R-FMT-13',
				'avg_price',
				'[R-FMT-13] USD/KRW unit prices keep at most 4 decimals on write'
			);
		}
	}
	if (has(merged, 'currency') && !CURRENCIES.includes(merged.currency as string)) {
		return fail('R-VAL-M01', 'currency', "[R-VAL-M01] currency must be 'KRW' or 'USD'");
	}
	return { ok: true, merged };
}
