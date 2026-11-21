/**
 * 승인 대기 건수 (FE-01 대기 pill). G-1 확정: pending만 센다. on_hold(보류)는 큐에 남지만 pill에서는 빠진다.
 * BE-11 load가 같은 규칙으로 pendingCount를 내려주면 이 함수는 픽스처·테스트용으로만 남는다.
 */
export type ProposalStatus =
	| 'pending'
	| 'on_hold'
	| 'approved'
	| 'rejected'
	| 'superseded'
	| 'cancelled'
	| 'expired'
	| 'conflict';

export function countPending(items: readonly { status: ProposalStatus }[]): number {
	return items.filter((p) => p.status === 'pending').length;
}
