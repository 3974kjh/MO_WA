/** 포트폴리오 표가 다루는 포지션 상태(서버 조회 필터와 화면 필터가 같이 쓴다). 값·순서 고정. */
export const PORTFOLIO_STATUSES = ['holding', 'planned', 'closed'] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];
