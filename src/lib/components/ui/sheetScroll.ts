/**
 * 모달 본문 스크롤 판정 (DS v1.7.6 §7-11-0, handoff §22) — 순수 함수(단위 테스트용)
 * 본문(.sheet-body)만 스크롤하고, 머리·꼬리·목차는 그 자리. 스크롤바는 숨기니 '더 있음' 단서와 목차 점으로 알린다.
 */
export const overflows = (clientH: number, scrollH: number) => scrollH > clientH + 1;

/** 위·아래로 더 볼 내용이 있는지(머리 아래·꼬리 위 선·그림자) */
export function moreEdges(top: number, clientH: number, scrollH: number) {
	return { up: top > 1, down: top + clientH < scrollH - 1 };
}

/**
 * 현재 구역 = 본문 위쪽 24px 선을 지난 마지막 머리글. 맨 위=첫째, 맨 아래=마지막.
 * offsets: 각 머리글의 위쪽이 본문 위쪽에서 떨어진 거리(px)
 */
export function currentSection(top: number, clientH: number, scrollH: number, offsets: number[]) {
	if (top <= 1) return 0;
	if (top + clientH >= scrollH - 2) return offsets.length - 1;
	let c = 0;
	offsets.forEach((o, i) => {
		if (o <= 24) c = i;
	});
	return c;
}

/** 점 높이: 먼저 32까지 압축(PC 40·모바일 44가 상한), 그래도 모자라면 목차 안에서 스크롤 */
export function dotHeight(avail: number, n: number, base: number) {
	return Math.max(32, Math.min(base, Math.floor(avail / n)));
}
