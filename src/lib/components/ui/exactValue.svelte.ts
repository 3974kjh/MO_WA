/**
 * 축약 금액의 '정확한 금액' 하단 시트 상태 (FE-02, DS §3-1, handoff v1.1 §12 '모바일 축약 금액 시트').
 * 640px 미만에서 Money(kind=amount)를 탭하면 열린다. PC는 ExactPopover(팝오버). 시트는 ExactValueSheet가 앱에 하나만 렌더한다.
 */
export const EXACT_SHEET_MQ = '(max-width: 639px)';
/** ≥640(PC·태블릿): 클릭·포커스·Enter/Space로 여는 정확값 팝오버(role=tooltip). 앱에 하나만 렌더한다(ExactPopover). */
export const EXACT_POPOVER_ID = 'exact-popover';

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

class ExactPopoverState {
	anchor = $state<HTMLElement | null>(null);
	label = $state('');
	exact = $state('');

	get open() {
		return this.anchor !== null;
	}
	show(anchor: HTMLElement, label: string, exact: string) {
		this.hide();
		this.anchor = anchor;
		this.label = label;
		this.exact = exact;
		anchor.setAttribute('aria-describedby', EXACT_POPOVER_ID);
	}
	toggle(anchor: HTMLElement, label: string, exact: string) {
		if (this.anchor === anchor) this.hide();
		else this.show(anchor, label, exact);
	}
	hide() {
		this.anchor?.removeAttribute('aria-describedby');
		this.anchor = null;
	}
}

export const exactValue = new ExactValueState();
export const exactPopover = new ExactPopoverState();
