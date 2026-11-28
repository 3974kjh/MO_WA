/**
 * 네이버 지도 Client ID(공개 값)를 서버 load에서만 읽는다(PLAN §3-3·§4-2).
 * `$env/dynamic/public`을 클라이언트 코드에서 import하면 SvelteKit이 모든 페이지 HTML(로그인 포함)에
 * 공개 env 전체를 싣는다(`uses_env_dynamic_public`). 그래서 이 파일은 `$lib/server` 아래에 두고,
 * 값은 로그인 뒤 `/realestate` load 결과로만 내려준다. 비었거나 모양이 이상하면 null → 화면은 폴백.
 * Client Secret은 읽지 않는다.
 */
import { env as publicEnv } from '$env/dynamic/public';
import { normalizeKeyId } from '$lib/maps/naverLoader';

export const NAVER_MAP_KEY_ENV = 'PUBLIC_NAVER_MAP_KEY_ID';

export function readNaverMapKeyId(
	env: Record<string, string | undefined> = publicEnv
): string | null {
	return normalizeKeyId(env[NAVER_MAP_KEY_ENV]);
}
