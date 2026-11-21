/**
 * FE-10 Low-1: 검색 입력창 ↔ URL `?q=` 동기화 규칙.
 *
 * URL(load 결과)의 q를 입력창에 다시 넣는 것은 사용자가 입력을 확정한 뒤에만 한다.
 * - 디바운스가 대기 중이면(입력 중) 넣지 않는다.
 * - 우리가 보낸 q의 이동이 아직 끝나지 않았으면(이전 load가 먼저 도착) 넣지 않는다.
 * - 뒤로 가기·링크처럼 다른 경로의 이동이면 기다리던 q를 버리고 URL 값을 따른다.
 *
 * 화면 밖에서 단위 테스트할 수 있도록 Svelte·$app 의존 없이 순수 상태만 둔다.
 */
import { cleanText } from './listQuery';

export type SearchSync = {
	/** 이 q로 이동을 시작했다(디바운스 이동·칩·필터 초기화 등 우리가 만든 이동). */
	sent(q: string): void;
	/** 그 이동이 끝났다(성공·실패·대체 모두). 아직 같은 q를 기다리고 있으면 기다림을 푼다. */
	settled(q: string): void;
	/** 다른 경로의 이동(뒤로 가기·링크): 기다리던 q를 버린다. */
	reset(): void;
	/**
	 * load가 끝나 URL q가 들어왔을 때 입력창에 넣을 값. 그대로 두면 null.
	 * @param typing 디바운스 대기 중(아직 보내지 않은 입력이 있음)
	 */
	next(urlQ: string, input: string, typing: boolean): string | null;
};

export function createSearchSync(): SearchSync {
	let awaiting: string | null = null;
	return {
		sent(q) {
			awaiting = cleanText(q);
		},
		settled(q) {
			if (awaiting === cleanText(q)) awaiting = null;
		},
		reset() {
			awaiting = null;
		},
		next(urlQ, input, typing) {
			if (typing) return null;
			if (awaiting !== null) {
				if (urlQ !== awaiting) return null;
				awaiting = null;
			}
			// 정규화해서 같으면 입력 그대로(끝 공백 등)를 지킨다.
			return cleanText(input) === urlQ ? null : urlQ;
		}
	};
}
