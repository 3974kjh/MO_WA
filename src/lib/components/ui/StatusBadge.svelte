<script lang="ts" module>
	/** 변경 요청 상태 8종 (DS §7-6, G-1). 배지 글자·기호는 색과 함께 항상 표시한다. */
	export type ProposalBadgeStatus =
		| 'pending'
		| 'on_hold'
		| 'approved'
		| 'rejected'
		| 'superseded'
		| 'cancelled'
		| 'conflict'
		| 'expired';

	export const STATUS_BADGE: Record<ProposalBadgeStatus, { label: string; icon: string }> = {
		pending: { label: '확인 대기', icon: '●' },
		on_hold: { label: '보류', icon: '⏸' },
		approved: { label: '반영됨', icon: '✓' },
		rejected: { label: '거절', icon: '✕' },
		superseded: { label: '새 요청으로 바뀜', icon: '⇄' },
		cancelled: { label: '봇이 취소', icon: '⊘' },
		conflict: { label: '반영 안 됨(기록 달라짐)', icon: '⚠' },
		expired: { label: '기한 지남', icon: '⏱' }
	};
</script>

<script lang="ts">
	let { status, class: className = '' }: { status: ProposalBadgeStatus; class?: string } = $props();
	let b = $derived(STATUS_BADGE[status]);
</script>

<span class="sb {status} {className}"><span aria-hidden="true">{b.icon}</span>{b.label}</span>

<style>
	.sb {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 22px;
		padding: 0 8px;
		border-radius: var(--radius-xs);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		border: 1px solid transparent;
	}
	.pending {
		background: var(--color-warn-soft);
		color: var(--color-warn);
	}
	.on_hold {
		background: var(--color-surface-2);
		color: var(--color-muted);
	}
	.approved {
		background: var(--color-ok-soft);
		color: var(--color-ok);
	}
	.rejected {
		background: transparent;
		color: var(--color-up);
		border-color: var(--color-up);
	}
	.superseded,
	.cancelled {
		background: transparent;
		color: var(--color-muted);
		border: 1px dashed var(--color-line-strong);
	}
	.conflict,
	.expired {
		background: var(--color-warn-fill);
		color: var(--color-on-warn);
	}
</style>
