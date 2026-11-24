## 티켓

- 티켓 ID:
- 브랜치: `cursor/<ticket>-…` (예: `cursor/be-14-mcp-tools-skeleton`)
- 관련 문서:

## 요약

이 PR에서 바꾸는 것과 바꾸지 않는 것을 적는다.

## 규칙 ID

건드린 동작이 있으면 `R-VAL-*` / `R-PERM-*` / `R-SYS-*` ID를 나열하고, 각 ID와 코드·테스트가 어떻게 대응하는지 적는다. 해당 없으면 `없음`.

## 테스트

로컬에서 실행한 명령을 적고, 결과를 붙인다. CI는 Pages 빌드뿐이므로 아래를 근거로 삼는다.

- [ ] `pnpm check`
- [ ] `pnpm lint` (있으면)
- [ ] `pnpm test:unit`
- [ ] `pnpm test:db` (DB 변경이 있을 때)
- [ ] 기타:

## 체크

- [ ] force-push·rebase 하지 않았다
- [ ] `main`에 직접 푸시하지 않았다
- [ ] 시크릿·키·`.env`를 커밋하지 않았다
- [ ] `/workspace/mo_wa`를 통째로 덮어쓰지 않았다
- [ ] `wrangler.jsonc`에 vars를 추가하지 않았다
- [ ] PR #8 및 advisor 하드닝 마이그레이션을 건드리지 않았다 (PM 담당)

## 머지

리뷰 PASS + 위 테스트 PASS 뒤에만 PM에게 머지를 요청한다. 작성자가 머지하지 않는다.
