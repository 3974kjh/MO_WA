# 티켓·PR 진행 (초안)

배정표 공통 규칙과 저장소 관례를 티켓·PR 템플릿과 맞춰 둔 짧은 진행 문서다.

## 브랜치·PR

- 티켓마다 브랜치 `cursor/<ticket>-…`와 PR 1개.
- force-push·rebase 금지, `main` 직접 푸시 금지, 시크릿 커밋 금지.
- `/workspace/mo_wa`를 통째로 덮어쓰지 않는다. 해당 하위 경로만 수정한다.
- `wrangler.jsonc`에 vars를 추가하지 않는다.
- PR #8과 advisor 하드닝 마이그레이션은 PM 담당이므로 건드리지 않는다.

## 템플릿

- 이슈: [`.github/ISSUE_TEMPLATE/ticket.md`](../.github/ISSUE_TEMPLATE/ticket.md)
- PR: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md)

규칙 ID(`R-VAL-*`, `R-PERM-*`, `R-SYS-*`)는 티켓·PR·MCP 오류 봉투에 같은 문자열로 적는다. 표기 세부는 [`docs/mcp-tools.md`](./mcp-tools.md) §4를 따른다.

## 머지

리뷰 PASS + 테스트 PASS(`pnpm check`, 단위·DB 테스트 등) 뒤에 PM에게 머지를 요청한다. 배포·운영 환경 변수·운영 키 발급은 PM 지시와 사용자 승인이 있을 때만 한다.
