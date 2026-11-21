/** 로컬 개발 전용 쇼케이스 경로(`/dev`, `/dev/...`)만 참. `/devices`·`/developer/x` 등은 거짓. */
export function isDevPath(pathname: string): boolean {
	return pathname === '/dev' || pathname.startsWith('/dev/');
}
