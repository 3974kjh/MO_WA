/**
 * BE-11 conflict detection helpers.
 * Server sets status=conflict when approval_version ≠ base_version (approve_proposal).
 * List/detail expose base_version + approval_version (or would_conflict) for client-side blocking only.
 */

export function wouldConflict(
	baseVersion: number | null | undefined,
	approvalVersion: number | null | undefined
): boolean {
	if (baseVersion == null || approvalVersion == null) return false;
	return baseVersion !== approvalVersion;
}

export type VersionFields = {
	base_version: number | null;
	approval_version: number | null;
	would_conflict: boolean;
};

export function versionFieldsForClient(
	baseVersion: number | null | undefined,
	approvalVersion: number | null | undefined
): VersionFields {
	const base_version = baseVersion ?? null;
	const approval_version = approvalVersion ?? null;
	return {
		base_version,
		approval_version,
		would_conflict: wouldConflict(base_version, approval_version)
	};
}
