/**
 * 네이버 지도 JS v3 SDK 로더(PLAN §3-2, 약점 W4·W8 개선).
 * - 키(Client ID)가 없거나 모양이 이상하면 네트워크 요청 없이 'nokey'로 실패한다.
 * - 한 페이지에서 한 번만 받는다(진행 중 약속 공유, 이미 받은 `naver.maps` 재사용, 중복 태그 없음).
 * - `window.navermap_authFailure`를 스크립트를 붙이기 **전에** 건다. 인증 실패는 로드 뒤에도 올 수 있어
 *   onAuthFailure로 구독하게 한다.
 * - 시간 제한(기본 8초) · 스크립트 오류 · 오프라인은 태그를 지우고 실패한다 → 다음 load()가 다시 시도한다.
 * - 새 Maps 파라미터 `ncpKeyId` 하나만 쓴다(구 `ncpClientId` 없음). 서브모듈·callback 없음.
 * Client Secret은 다루지 않는다(지도 표시에 필요 없음).
 */

export const NAVER_MAPS_SRC = 'https://oapi.map.naver.com/openapi/v3/maps.js';
export const LOAD_TIMEOUT_MS = 8000;
/** SDK 요청 시점에만 붙이는 미리 연결 호스트(app.html 전역에는 넣지 않는다) */
export const PRECONNECT_HOSTS = ['https://nrbe.pstatic.net', 'https://map.pstatic.net'] as const;
const TAG_ATTR = 'data-mowa-naver-maps';

export type MapFailReason = 'nokey' | 'auth-failed' | 'load-failed' | 'timeout' | 'offline';

export class MapLoadError extends Error {
	readonly reason: MapFailReason;
	constructor(reason: MapFailReason) {
		super(`naver maps: ${reason}`);
		this.name = 'MapLoadError';
		this.reason = reason;
	}
}

export function failReason(err: unknown): MapFailReason {
	return err instanceof MapLoadError ? err.reason : 'load-failed';
}

/** Client ID 모양(영숫자·_·-, 4~64자). 공백만 있거나 비면 null. */
export function normalizeKeyId(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const t = v.trim();
	return /^[A-Za-z0-9_-]{4,64}$/.test(t) ? t : null;
}

export function mapsScriptUrl(keyId: string): string {
	return `${NAVER_MAPS_SRC}?ncpKeyId=${encodeURIComponent(keyId)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- SDK 전역은 타입 정의를 들이지 않는다(번들·의존성 최소) */
export type NaverMapsNs = any;
type NaverWindow = {
	naver?: { maps?: NaverMapsNs };
	navermap_authFailure?: () => void;
	navigator?: { onLine?: boolean };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface LoaderEnv {
	doc: Document;
	win: NaverWindow;
	timeoutMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (t: unknown) => void;
}

export interface NaverLoader {
	load(keyId: string | null | undefined): Promise<NaverMapsNs>;
	/** 인증 실패 구독(이미 실패했으면 바로 부른다). 해제 함수를 돌려준다 */
	onAuthFailure(cb: () => void): () => void;
	readonly authFailed: boolean;
}

export function createNaverLoader(env: LoaderEnv): NaverLoader {
	const timeoutMs = env.timeoutMs ?? LOAD_TIMEOUT_MS;
	const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = env.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
	let pending: Promise<NaverMapsNs> | null = null;
	let authFailed = false;
	let hooked = false;
	const listeners = new Set<() => void>();

	function hookAuth() {
		if (hooked) return;
		hooked = true;
		const prev = env.win.navermap_authFailure;
		env.win.navermap_authFailure = () => {
			authFailed = true;
			for (const l of [...listeners]) l();
			if (typeof prev === 'function') prev();
		};
	}

	function preconnect() {
		for (const href of PRECONNECT_HOSTS) {
			if (env.doc.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
			const l = env.doc.createElement('link');
			l.rel = 'preconnect';
			l.href = href;
			l.crossOrigin = 'anonymous';
			env.doc.head.appendChild(l);
		}
	}

	function load(keyIdRaw: string | null | undefined): Promise<NaverMapsNs> {
		const keyId = normalizeKeyId(keyIdRaw);
		if (!keyId) return Promise.reject(new MapLoadError('nokey'));
		if (authFailed) return Promise.reject(new MapLoadError('auth-failed'));
		const ready = env.win.naver?.maps;
		if (ready) return Promise.resolve(ready);
		if (pending) return pending;
		if (env.win.navigator?.onLine === false) return Promise.reject(new MapLoadError('offline'));

		hookAuth();
		preconnect();
		// 앞선 실패에서 남은 태그가 있으면 지운다(중복 태그 방지)
		env.doc.head.querySelectorAll(`script[${TAG_ATTR}]`).forEach((n) => n.remove());
		const s = env.doc.createElement('script');
		s.src = mapsScriptUrl(keyId);
		s.async = true;
		s.setAttribute(TAG_ATTR, '');

		const p = new Promise<NaverMapsNs>((resolve, reject) => {
			let done = false;
			const finish = (err: MapLoadError | null) => {
				if (done) return;
				done = true;
				clearTimer(timer);
				listeners.delete(onAuth);
				s.onload = null;
				s.onerror = null;
				if (err) {
					s.remove();
					if (pending === p) pending = null;
					reject(err);
				} else {
					resolve(env.win.naver!.maps);
				}
			};
			const onAuth = () => finish(new MapLoadError('auth-failed'));
			listeners.add(onAuth);
			const timer = setTimer(() => finish(new MapLoadError('timeout')), timeoutMs);
			s.onload = () => {
				if (authFailed) finish(new MapLoadError('auth-failed'));
				else if (env.win.naver?.maps) finish(null);
				else finish(new MapLoadError('load-failed'));
			};
			s.onerror = () =>
				finish(new MapLoadError(env.win.navigator?.onLine === false ? 'offline' : 'load-failed'));
		});
		pending = p;
		env.doc.head.appendChild(s);
		return p;
	}

	return {
		load,
		onAuthFailure(cb) {
			if (authFailed) {
				cb();
				return () => {};
			}
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		get authFailed() {
			return authFailed;
		}
	};
}

let shared: NaverLoader | null = null;

/** 브라우저 한 페이지에 하나(모든 지도 컴포넌트가 같은 로더를 쓴다). */
export function naverLoader(): NaverLoader {
	shared ??= createNaverLoader({ doc: document, win: window as unknown as NaverWindow });
	return shared;
}
