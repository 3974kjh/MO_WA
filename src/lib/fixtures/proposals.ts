/**
 * 승인 큐 픽스처 (BE-11 전까지 FE 개발용, work-breakdown "FE는 BE-11 전까지 src/lib/fixtures/*").
 * design/shared/data.js 시안 샘플(2026-11-20 기록 참고)의 상태 구성: 대기 2 · 보류 1 · 승인 1. 서비스 데이터가 아니다.
 */
import type { ProposalStatus } from '$lib/approvals/pending';

export interface FixtureProposal {
	id: string;
	ticker: string;
	title: string;
	status: ProposalStatus;
}

export const fixtureProposals: FixtureProposal[] = [
	{ id: 'P-0412', ticker: 'GOOGL', title: '알파벳 A 수량·평균 단가 반영 제안', status: 'pending' },
	{
		id: 'P-0411',
		ticker: 'NAVER',
		title: 'NAVER 5주 트랜치 추가 반영 제안 (예시)',
		status: 'pending'
	},
	{ id: 'P-0409', ticker: 'KT', title: 'KT 평균 단가 기록 수정 (예시)', status: 'on_hold' },
	{ id: 'P-0398', ticker: 'UST_30Y', title: '미국 30년 국채 전량 매도 반영', status: 'approved' }
];
