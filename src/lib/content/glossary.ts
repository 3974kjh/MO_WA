/**
 * 리포트 본문 용어 풀이 사전(FE-04, FE-15 렌더러 `RenderOptions.glossary`에 넘긴다).
 * 코드 안 정적 사전이다. 별도 DB 테이블이나 사전 페이지는 만들지 않는다.
 * 항목이 바뀌면 렌더 옵션 지문이 바뀌어 캐시 키가 자동으로 달라진다(cache.ts optionsFingerprint).
 * 화면 용어는 확정 용어 v1.3을 따른다.
 */
export const GLOSSARY: Readonly<Record<string, string>> = Object.freeze({
	사이드카: '선물 가격이 5% 넘게 움직이면 프로그램 매매 주문을 5분간 멈추는 장치',
	LOC: '장 마감 가격으로 체결되는 지정가 주문(Limit On Close)'
});
