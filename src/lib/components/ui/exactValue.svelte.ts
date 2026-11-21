/**
 * 축약 금액의 '정확한 금액' 하단 시트 상태 (FE-02, DS §3-1, handoff v1.1 §12 '모바일 축약 금액 시트').
 * 640px 미만에서 Money(kind=amount)를 탭하면 열린다. PC는 title/aria-label 툴팁만. 시트는 ExactValueSheet가 앱에 하나만 렌더한다.
 */
export const EXACT_SHEET_MQ = '(max-width: 639px)';

class ExactValueState {
	open = $state(false);
	label = $state('');
	exact = $state('');

	show(label: string, exact: string) {
		this.label = label;
		this.exact = exact;
		this.open = true;
	}
	close() {
		this.open = false;
	}
}

export const exactValue = new ExactValueState();
