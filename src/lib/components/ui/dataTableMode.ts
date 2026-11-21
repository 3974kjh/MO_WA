/**
 * DataTable 모바일(<640) 표시 방식 결정 (DS §7-3, FE-02 수용 기준)
 * 열 ≥5이고 행 ≤10이면 카드형, 아니면 가로 스크롤 + 첫 열 고정 + 우측 스크롤 힌트.
 */
export type MobileMode = 'cards' | 'scroll';

export function resolveMobileMode(
	mobile: MobileMode | 'auto',
	columnCount: number,
	rowCount: number
): MobileMode {
	if (mobile !== 'auto') return mobile;
	return columnCount >= 5 && rowCount <= 10 ? 'cards' : 'scroll';
}
