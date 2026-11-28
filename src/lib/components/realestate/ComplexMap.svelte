<script lang="ts" module>
	import type { FallbackReason } from './MapFallback.svelte';

	export type MapStatus = 'idle' | 'loading' | 'ready' | FallbackReason;

	/** 휠 안내를 보이는 시간(ms, 시안 1.6초) */
	export const WHEEL_HINT_MS = 1600;
</script>

<script lang="ts">
	/**
	 * FE-12 ⑤ 네이버 지도(dynamic import 대상 — /realestate 동기 클로저에 넣지 않는다, PLAN §3-2·§4-5).
	 * 시안 v1.7.8(design/realestate-map-spec.md, handoff §24)을 따른다.
	 * - SDK는 이 컴포넌트가 화면 가까이 올 때(IntersectionObserver 200px)만 요청한다. 키가 없으면 페이지가
	 *   이 컴포넌트를 불러오지 않는다. 상태: idle → loading → ready | auth-failed | load-failed | timeout |
	 *   offline | error. 첫 타일(tilesloaded)이 8초 안에 안 오면 timeout, 인증 실패는 언제 와도 폴백.
	 * - 마커 = SVG 핀 버튼(등급 4종, 최소 44×44)과 묶음 버튼. 거리 기반 묶음(반경 40·34·28px), 고른 단지는
	 *   묶지 않는다. 마커 DOM은 createElement(NS)+textContent로만 만든다(innerHTML 없음).
	 * - 정보창은 우리 카드: PC(≥1024)는 핀에 붙는 카드(+자동 이동), 태블릿은 지도 칸 아래 카드, 모바일은 페이지의
	 *   시트(이 컴포넌트는 카드를 그리지 않는다). 네이버 InfoWindow·기본 마커·MarkerClustering 없음.
	 * - 휠은 페이지가 스크롤(scrollWheel:false), 확대는 Ctrl/⌘+휠·+/−·버튼. 키보드: 핀 영역 탭 정지 1개(roving),
	 *   방향키 = 가까운 이웃, Home/End, Enter/Space, Esc = 닫고 같은 핀으로 복귀, Shift+방향키 이동.
	 * - 검증용 상태는 data-state·data-markers 속성으로만 둔다(화면 문구에 코드·키 이름 없음).
	 */
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MapPinOff from '@lucide/svelte/icons/map-pin-off';
	import { CLUSTER_MAX_ZOOM, clusterByDistance, worldPixel } from '$lib/maps/cluster';
	import {
		autoPanDy,
		isDir,
		nearestInDirection,
		panDelta,
		placeCard,
		type CardPlace,
		type PinGeom
	} from '$lib/maps/geometry';
	import {
		failReason,
		LOAD_TIMEOUT_MS,
		naverLoader,
		type NaverLoader,
		type NaverMapsNs
	} from '$lib/maps/naverLoader';
	import { createClusterEl, createPinEl, PIN_SIZE } from '$lib/maps/pinDom';
	import type { ComplexTier, LocatedItem } from '$lib/maps/points';
	import ComplexInfo from './ComplexInfo.svelte';
	import ComplexList from './ComplexList.svelte';
	import MapFallback from './MapFallback.svelte';

	/** 지도 줌 범위(네이버 줌 레벨) */
	const MIN_ZOOM = 7;
	const MAX_ZOOM = 19;

	let {
		items,
		keyId,
		selectedId,
		hidden = [],
		asOfText = '',
		onselect,
		ondeselect,
		onstatus,
		onlist,
		onallon,
		onsay,
		stackIds = null,
		onstack,
		onbackstack,
		watchHref,
		loader,
		tileTimeoutMs = LOAD_TIMEOUT_MS,
		observe = true,
		reloadPage = () => location.reload()
	}: {
		items: LocatedItem[];
		keyId: string;
		selectedId: string | null;
		/** 꺼 둔 등급(범례) */
		hidden?: ComplexTier[];
		asOfText?: string;
		onselect: (id: string, o: { focus: boolean }) => void;
		ondeselect?: (restoreFocus: boolean) => void;
		onstatus?: (s: MapStatus) => void;
		/** 모바일 로딩 중 '목록 먼저 보기' */
		onlist?: () => void;
		onallon?: () => void;
		onsay?: (msg: string) => void;
		/** 최대 확대에서도 남는 묶음의 '겹친 단지 n곳' 목록(열려 있으면 그 단지 id들). 목록은 PC·태블릿에선 카드, 모바일에선 페이지 시트 */
		stackIds?: string[] | null;
		onstack?: (ids: string[] | null) => void;
		/** 정보 카드의 [겹친 단지 n곳으로] */
		onbackstack?: () => void;
		/** 카드의 '점수 근거 보기' 이동 주소 */
		watchHref?: (id: string) => string;
		/** 시험용 주입. 기본은 페이지 공용 로더 */
		loader?: NaverLoader;
		tileTimeoutMs?: number;
		/** false면 보일 때를 기다리지 않고 바로 시작(시험용) */
		observe?: boolean;
		/** 인증 실패 '다시 시도하기': SDK 인증 실패는 이 페이지 안에서 풀리지 않아 페이지를 다시 불러온다 */
		reloadPage?: () => void;
	} = $props();

	let mapState = $state<MapStatus>('idle');
	let markerCount = $state(0);
	let inView = $state(0);
	let zoomLevel = $state(9);
	let hintOn = $state(false);
	let root: HTMLDivElement;
	let box: HTMLDivElement;
	let canvas: HTMLDivElement;
	let iwEl = $state<HTMLDivElement>();
	let cardPos = $state<CardPlace | null>(null);

	const isMobile = new MediaQuery('max-width: 639px', false);
	const isPc = new MediaQuery('min-width: 1024px', false);

	/* eslint-disable @typescript-eslint/no-explicit-any -- SDK 객체(타입 정의 미도입) */
	let ns: NaverMapsNs | null = null;
	let map: any = null;
	let listeners: any[] = [];
	/* eslint-enable @typescript-eslint/no-explicit-any */
	interface Ent {
		key: string;
		el: HTMLButtonElement;
		marker: { setMap: (m: unknown) => void };
		order: number;
	}
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- 마커 DOM 보관용(비반응: effect 안에서 갱신)
	let ents = new Map<string, Ent>();
	let stopKey: string | null = null;
	let tileTimer: ReturnType<typeof setTimeout> | undefined;
	let hintTimer: ReturnType<typeof setTimeout> | undefined;
	let offAuth: (() => void) | undefined;
	let lastWheel = 0;

	let isFallback = $derived(mapState !== 'idle' && mapState !== 'loading' && mapState !== 'ready');
	let visible = $derived(items.filter((it) => !hidden.includes(it.tier)));
	let selected = $derived(items.find((it) => it.id === selectedId) ?? null);
	let cardItem = $derived(
		mapState === 'ready' && !isMobile.current && selected && !hidden.includes(selected.tier)
			? selected
			: null
	);
	let stackItems = $derived(
		stackIds ? items.filter((it) => stackIds.includes(it.id)) : ([] as LocatedItem[])
	);
	// 겹친 단지 목록 카드: 정보 카드가 없을 때, 모바일이 아닐 때만(모바일은 시트)
	let stackCard = $derived(
		mapState === 'ready' && !isMobile.current && !cardItem && stackItems.length > 1
	);
	let hasCard = $derived(!!cardItem || stackCard);
	const nf = new Intl.NumberFormat('ko-KR');

	function setStatus(s: MapStatus) {
		mapState = s;
		onstatus?.(s);
	}

	function teardown() {
		clearTimeout(tileTimer);
		clearMarkers();
		if (ns && listeners.length) ns.Event.removeListener(listeners);
		listeners = [];
		try {
			map?.destroy?.();
		} catch {
			/* 이미 정리됨 */
		}
		map = null;
		cardPos = null;
	}

	function fail(reason: FallbackReason) {
		teardown();
		setStatus(reason);
	}

	function start() {
		teardown();
		setStatus('loading');
		const l = loader ?? naverLoader();
		offAuth?.();
		offAuth = l.onAuthFailure(() => fail('auth-failed'));
		l.load(keyId).then(
			(n) => {
				if (mapState === 'loading') init(n);
			},
			(e) => {
				if (mapState === 'loading') fail(failReason(e));
			}
		);
	}

	/** 다시 시도하기: 인증 실패는 SDK가 이 페이지에서 되살아나지 않아 새로 불러오고, 그 밖에는 SDK만 다시 요청한다. */
	function retry() {
		if (mapState === 'auth-failed') reloadPage();
		else start();
	}

	/* eslint-disable @typescript-eslint/no-explicit-any */
	const latLng = (lat: number, lng: number): any => new ns!.LatLng(lat, lng);
	/* eslint-enable @typescript-eslint/no-explicit-any */

	function fitAll() {
		if (!map) return;
		const set = visible.length ? visible : items;
		if (!set.length) return;
		if (set.length === 1) {
			map.setCenter(latLng(set[0].lat, set[0].lng));
			map.setZoom(CLUSTER_MAX_ZOOM);
			return;
		}
		const lats = set.map((i) => i.lat);
		const lngs = set.map((i) => i.lng);
		map.fitBounds(
			new ns!.LatLngBounds(
				latLng(Math.min(...lats), Math.min(...lngs)),
				latLng(Math.max(...lats), Math.max(...lngs))
			),
			{ top: 70, right: 64, bottom: 60, left: 64 }
		);
	}

	function init(n: NaverMapsNs) {
		ns = n;
		try {
			map = new n.Map(canvas, {
				center: latLng(37.45, 127.0),
				zoom: 9,
				minZoom: MIN_ZOOM,
				maxZoom: MAX_ZOOM,
				// 휠은 페이지가 스크롤한다(Ctrl/⌘+휠만 확대). 키보드는 우리가 처리한다(+/−·Shift+방향키).
				scrollWheel: false,
				keyboardShortcuts: false,
				zoomControl: false,
				scaleControl: true,
				scaleControlOptions: { position: n.Position?.BOTTOM_RIGHT },
				logoControl: true,
				logoControlOptions: { position: n.Position?.BOTTOM_LEFT },
				mapDataControl: false
			});
			zoomLevel = map.getZoom();
			fitAll();
			tileTimer = setTimeout(() => {
				if (mapState === 'loading') fail('timeout');
			}, tileTimeoutMs);
			listeners.push(
				n.Event.once(map, 'tilesloaded', () => {
					clearTimeout(tileTimer);
					if (mapState === 'loading') setStatus('ready');
				}),
				n.Event.addListener(map, 'zoom_changed', () => {
					zoomLevel = map.getZoom();
					// 더 이상 최대 확대가 아니면 겹친 단지 목록은 닫는다
					if (stackIds && zoomLevel < CLUSTER_MAX_ZOOM) onstack?.(null);
					render();
				}),
				n.Event.addListener(map, 'idle', () => {
					render();
					placeCardSoon();
				})
			);
			render();
		} catch (e) {
			console.error('[realestate.map] render failed', e instanceof Error ? e.message : String(e));
			fail('error');
		}
	}

	/* ── 마커 ── */
	function clearMarkers() {
		for (const e of ents.values()) e.marker.setMap(null);
		ents = new Map();
		markerCount = 0;
	}

	/** 줌별 화면 픽셀(거리 계산용). SDK 투영이 있으면 그것을, 없으면 웹 메르카토르 */
	function project(p: { lat: number; lng: number }): { x: number; y: number } {
		try {
			const o = map.getProjection?.()?.fromCoordToOffset?.(latLng(p.lat, p.lng));
			if (o && Number.isFinite(o.x) && Number.isFinite(o.y)) return { x: o.x, y: o.y };
		} catch {
			/* 아래 대체 계산 */
		}
		return worldPixel(p.lat, p.lng, map.getZoom());
	}

	const Z: Record<ComplexTier, number> = { top: 600, target: 500, cand: 400, ref: 300 };

	function addEnt(
		key: string,
		el: HTMLButtonElement,
		lat: number,
		lng: number,
		anchor: [number, number],
		z: number,
		order: number,
		fresh: Map<string, Ent>
	) {
		el.dataset.key = key;
		const marker = new ns!.Marker({
			position: latLng(lat, lng),
			map,
			icon: { content: el, anchor: new ns!.Point(anchor[0], anchor[1]) },
			zIndex: z,
			clickable: true
		});
		fresh.set(key, { key, el, marker, order });
	}

	function render() {
		if (!ns || !map) return;
		const activeId = box.contains(document.activeElement)
			? ((document.activeElement as HTMLElement).dataset?.id ?? null)
			: null;
		const keep = visible.some((i) => i.id === selectedId) ? selectedId : null;
		const clusters = clusterByDistance(visible, project, map.getZoom(), { keepId: keep });
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- 위와 같음
		const fresh = new Map<string, Ent>();
		const reuse = (key: string) => {
			const e = ents.get(key);
			if (e) {
				ents.delete(key);
				fresh.set(key, e);
			}
			return e;
		};
		for (const c of clusters) {
			if (c.items.length === 1) {
				const it = c.items[0];
				const sel = it.id === keep;
				const key = `p:${it.id}:${sel ? 1 : 0}`;
				if (reuse(key)) continue;
				const z = PIN_SIZE[it.tier];
				addEnt(
					key,
					createPinEl(it, sel),
					it.lat,
					it.lng,
					[z.w / 2, z.tear ? z.h : z.h / 2],
					sel ? 1000 : Z[it.tier] + (it.score ?? 0),
					c.order,
					fresh
				);
			} else {
				const atMax = map.getZoom() >= CLUSTER_MAX_ZOOM;
				const key = `c:${c.key}:${atMax ? 's' : 'z'}`;
				if (reuse(key)) continue;
				const el = createClusterEl(
					c.items.map((i) => i.id),
					c.items.filter((i) => i.tier === 'top').length,
					atMax
				);
				el.addEventListener('click', (ev) =>
					zoomCluster(
						c.items.map((i) => i.id),
						ev.detail === 0
					)
				);
				addEnt(key, el, c.lat, c.lng, [24, 24], 700 + c.items.length, c.order, fresh);
			}
		}
		for (const e of ents.values()) e.marker.setMap(null);
		ents = fresh;
		for (const e of ents.values()) {
			if (e.el.dataset.id && !e.el.dataset.bound) {
				e.el.dataset.bound = '1';
				const id = e.el.dataset.id;
				e.el.addEventListener('click', (ev) => onPin(id, ev));
			}
		}
		markerCount = ents.size;
		syncExpanded();
		syncStops();
		if (activeId && !box.contains(document.activeElement)) focusPin(activeId);
		try {
			const b = map.getBounds?.();
			inView = b?.hasLatLng
				? visible.filter((it) => b.hasLatLng(latLng(it.lat, it.lng))).length
				: visible.length;
		} catch {
			inView = visible.length;
		}
	}

	function ordered(): Ent[] {
		return [...ents.values()].sort((a, b) => a.order - b.order);
	}

	/** 탭 정지는 하나: 기억해 둔 핀 → 선택 핀 → 목록 첫 마커 */
	function syncStops() {
		const list = ordered();
		const sel = list.find((e) => e.el.dataset.id && e.el.dataset.id === selectedId);
		const cur = (stopKey && ents.get(stopKey)) || sel || list[0] || undefined;
		for (const e of list) e.el.tabIndex = e === cur ? 0 : -1;
		stopKey = cur?.key ?? null;
	}

	function focusEnt(e: Ent | undefined) {
		if (!e) return;
		for (const o of ents.values()) o.el.tabIndex = o === e ? 0 : -1;
		stopKey = e.key;
		e.el.focus();
	}

	export function focusPin(id: string) {
		focusEnt([...ents.values()].find((e) => e.el.dataset.id === id));
	}

	/** 묶음 버튼의 aria-expanded: 열려 있는 겹친 단지 목록의 묶음만 true */
	function syncExpanded() {
		for (const e of ents.values()) {
			if (!e.el.dataset.stack) continue;
			const first = e.el.dataset.ids?.split(',')[0] ?? '';
			e.el.setAttribute('aria-expanded', String(!!stackIds && stackIds.includes(first)));
		}
	}

	/** 열려 있는 겹친 단지 목록에 해당하는 마커(묶음, 하나만 남았으면 그 핀) */
	function stackEnt(ids: string[] | null = stackIds): Ent | undefined {
		if (!ids?.length) return undefined;
		const all = [...ents.values()];
		return (
			all.find((e) => e.el.dataset.ids && ids.includes(e.el.dataset.ids.split(',')[0])) ??
			all.find((e) => e.el.dataset.id && ids.includes(e.el.dataset.id))
		);
	}

	function focusCardTitle() {
		void tick().then(() =>
			requestAnimationFrame(() =>
				(box.querySelector('[data-card-title]') as HTMLElement | null)?.focus()
			)
		);
	}

	/** 겹친 단지 목록을 닫고 그 묶음으로 포커스를 돌려 준다(모바일 시트의 Esc·끌어 닫기도 쓴다) */
	export async function closeStack(restoreFocus: boolean) {
		const ids = stackIds;
		onstack?.(null);
		if (restoreFocus && ids) {
			await tick();
			focusEnt(stackEnt(ids));
		}
	}

	export function focusStack(ids: string[]) {
		focusEnt(stackEnt(ids));
	}

	function zoomCluster(ids: string[], viaKey = false) {
		if (!map) return;
		const its = items.filter((i) => ids.includes(i.id));
		if (map.getZoom() >= CLUSTER_MAX_ZOOM || !its.length) {
			// 더 확대해도 갈라지지 않는 묶음(같은 위치): '겹친 단지 n곳' 목록을 연다
			if (its.length > 1) {
				onstack?.(its.map((i) => i.id));
				if (viaKey && !isMobile.current) focusCardTitle();
			} else if (its[0]) onselect(its[0].id, { focus: false });
			return;
		}
		const lats = its.map((i) => i.lat);
		const lngs = its.map((i) => i.lng);
		map.fitBounds(
			new ns!.LatLngBounds(
				latLng(Math.min(...lats), Math.min(...lngs)),
				latLng(Math.max(...lats), Math.max(...lngs))
			),
			{ top: 48, right: 48, bottom: 48, left: 48 }
		);
		onsay?.(`지도를 확대했어요. 이 화면 안 단지 ${its.length}곳.`);
	}

	function onPin(id: string, ev: MouseEvent) {
		if (selectedId === id && isPc.current) {
			void deselect(false);
			return;
		}
		const focus = ev.detail === 0 && isPc.current;
		onselect(id, { focus });
		// 키보드로 열면 카드 제목으로 포커스(Esc로 닫으면 같은 핀으로 돌아온다)
		if (focus) focusCardTitle();
	}

	/** 겹친 단지 목록의 행 */
	function onStackRow(id: string) {
		onselect(id, { focus: true });
		focusCardTitle();
	}

	async function deselect(restore: boolean) {
		const id = selectedId;
		ondeselect?.(restore);
		if (stackIds) {
			// 겹친 목록에서 연 정보 → 목록으로 돌아간다
			if (restore) focusCardTitle();
			return;
		}
		if (restore && id) {
			await tick();
			focusPin(id);
		}
	}

	/* ── 카드 자리·자동 이동 ── */
	function pinGeom(id: string): PinGeom | null {
		const e = [...ents.values()].find((x) => x.el.dataset.id === id);
		const it = items.find((i) => i.id === id);
		if (!e || !it) return null;
		const r = e.el.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		const z = PIN_SIZE[it.tier];
		return {
			x: r.left + r.width / 2 - b.left,
			y: (z.tear ? r.bottom : r.top + r.height / 2) - b.top,
			tear: z.tear,
			pinH: z.tear ? z.sh : 0
		};
	}

	/** 겹친 단지 목록 카드가 붙는 자리: 묶음(또는 남은 핀)의 가운데 */
	function stackGeom(): PinGeom | null {
		const e = stackEnt();
		if (!e) return null;
		const r = e.el.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		return {
			x: r.left + r.width / 2 - b.left,
			y: r.top + r.height / 2 - b.top,
			tear: false,
			pinH: 0
		};
	}

	const anchorGeom = () => (cardItem ? pinGeom(cardItem.id) : stackGeom());

	function placeCardNow() {
		if (!map) return;
		if (!hasCard || !iwEl) {
			cardPos = null;
			return;
		}
		const g = anchorGeom();
		const b = box.getBoundingClientRect();
		if (!g || g.x < 0 || g.x > b.width || g.y < 0 || g.y > b.height) {
			cardPos = null;
			return;
		}
		cardPos = isPc.current
			? placeCard(g, { h: iwEl.offsetHeight }, { w: b.width, h: b.height })
			: { cls: 'down', left: 0, top: 0 };
	}

	function placeCardSoon() {
		if (!hasCard) return;
		void tick().then(() => requestAnimationFrame(placeCardNow));
	}

	function autoPan() {
		if (!hasCard || !iwEl || !map) return;
		const g = anchorGeom();
		if (!g) return;
		const b = box.getBoundingClientRect();
		const dy = autoPanDy(g, { h: iwEl.offsetHeight }, { w: b.width, h: b.height }, isPc.current);
		// 핀을 dy만큼 내리려면 지도 중심을 반대로 민다
		if (dy) map.panBy(new ns!.Point(0, -dy));
	}

	// 고른 단지가 바뀌면(또는 카드가 열리면) 다시 그리고 카드를 놓는다
	$effect(() => {
		void hidden.length;
		void selectedId;
		if (!map || !ns) return;
		render();
	});
	$effect(() => {
		void stackIds;
		syncExpanded();
	});
	$effect(() => {
		const it = hasCard ? (cardItem?.id ?? 'stack') : null;
		if (!it || !iwEl) return;
		void tick().then(() =>
			requestAnimationFrame(() => {
				autoPan();
				placeCardNow();
			})
		);
	});

	/* ── 입력 ── */
	function say(msg: string) {
		onsay?.(msg);
	}

	function zoomBy(d: number) {
		if (!map) return;
		const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, map.getZoom() + d));
		if (z === map.getZoom()) return;
		map.setZoom(z, true);
		say(`지도를 ${d > 0 ? '확대' : '축소'}했어요.`);
	}

	function onWheel(e: WheelEvent) {
		if (mapState !== 'ready') return;
		if (e.ctrlKey || e.metaKey) {
			// 브라우저 확대(트랙패드 핀치 포함)를 막고 지도만 확대
			e.preventDefault();
			const now = Date.now();
			if (now - lastWheel < 120) return;
			lastWheel = now;
			zoomBy(e.deltaY < 0 ? 1 : -1);
			return;
		}
		if (!isPc.current) return;
		hintOn = true;
		clearTimeout(hintTimer);
		hintTimer = setTimeout(() => (hintOn = false), WHEEL_HINT_MS);
	}

	/** 배경 탭: 겹친 단지 목록을 닫고 묶음으로 포커스 */
	function onBoxClick(e: MouseEvent) {
		if (!stackIds || selectedId || isMobile.current) return;
		if ((e.target as HTMLElement).closest?.('.iw,.rm-cl,.rm-pin,.ctls')) return;
		void closeStack(true);
	}

	function onKey(e: KeyboardEvent) {
		if (mapState !== 'ready') return;
		const k = e.key;
		if (k === 'Escape') {
			// 정보 → 겹친 단지 목록 → 묶음 순으로 한 단계씩 돌아간다
			if (selectedId) {
				e.stopPropagation();
				void deselect(true);
			} else if (stackIds && !isMobile.current) {
				e.stopPropagation();
				void closeStack(true);
			}
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (k === '+' || k === '=') return zoomBy(1);
		if (k === '-' || k === '_') return zoomBy(-1);
		const t = (e.target as HTMLElement).closest?.('.rm-pin,.rm-cl') as HTMLButtonElement | null;
		if (!t) return;
		const list = [...ents.values()];
		const cur = list.find((x) => x.el === t);
		if (isDir(k)) {
			e.preventDefault();
			if (e.shiftKey) {
				const d = panDelta(k);
				map.panBy(new ns!.Point(d.x, d.y));
				return;
			}
			const boxes = list.map((x) => x.el.getBoundingClientRect());
			const i = nearestInDirection(boxes, cur ? list.indexOf(cur) : 0, k);
			if (i >= 0) focusEnt(list[i]);
			return;
		}
		if (k === 'Home' || k === 'End') {
			e.preventDefault();
			const o = ordered();
			focusEnt(k === 'Home' ? o[0] : o[o.length - 1]);
		}
	}

	export function centerOn(id: string) {
		const it = items.find((i) => i.id === id);
		if (!map || !it) return;
		map.setCenter(latLng(it.lat, it.lng));
		if (map.getZoom() < 13) map.setZoom(13);
		render();
		placeCardSoon();
	}

	/** 숨겨 둔 지도가 다시 보일 때(모바일 목록→지도) 크기를 다시 재게 한다 */
	export function refresh() {
		if (!map || !ns) return;
		ns.Event.trigger?.(map, 'resize');
		render();
		placeCardSoon();
	}

	function fit() {
		fitAll();
		void deselect(false);
		say('전체 보기로 돌아왔어요.');
	}

	onMount(() => {
		box.addEventListener('wheel', onWheel, { passive: false });
		box.addEventListener('click', onBoxClick);
		let io: IntersectionObserver | undefined;
		if (observe && typeof IntersectionObserver !== 'undefined') {
			io = new IntersectionObserver(
				(entries) => {
					if (entries.some((e) => e.isIntersecting)) {
						io?.disconnect();
						start();
					}
				},
				{ rootMargin: '200px' }
			);
			io.observe(root);
		} else {
			start();
		}
		return () => {
			box.removeEventListener('wheel', onWheel);
			box.removeEventListener('click', onBoxClick);
			clearTimeout(hintTimer);
			io?.disconnect();
			offAuth?.();
			teardown();
		};
	});

	let countText = $derived(
		visible.length ? `단지 ${nf.format(visible.length)}곳` : '표시할 단지 없음'
	);
	let sub = $derived(
		[visible.length ? `이 화면 안 ${nf.format(inView)}곳` : null, asOfText || null]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div
	class="rm-map"
	class:fb={isFallback}
	bind:this={root}
	data-testid="complex-map"
	data-state={mapState}
	data-markers={markerCount}
>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="box"
		role="group"
		aria-label="단지 위치 지도. 같은 정보가 단지 목록에 있어요"
		aria-busy={mapState === 'idle' || mapState === 'loading'}
		bind:this={box}
		onkeydown={onKey}
	>
		<div class="canvas" bind:this={canvas}></div>
		{#if mapState === 'idle' || mapState === 'loading' || mapState === 'ready'}
			<div class="count" data-testid="map-count">
				<b>{countText}</b>{#if mapState === 'ready'}{#if visible.length}
						표시 중{/if}{:else}
					준비 중{/if}
				{#if sub && mapState === 'ready'}<small>{sub}</small>{/if}
			</div>
			<div class="ctls" class:dim={mapState !== 'ready'}>
				<div class="zoom" role="group" aria-label="지도 확대·축소">
					<button
						type="button"
						class="ctl"
						aria-label="확대"
						disabled={mapState !== 'ready' || zoomLevel >= MAX_ZOOM}
						onclick={() => zoomBy(1)}><Plus size={20} aria-hidden="true" /></button
					>
					<button
						type="button"
						class="ctl"
						aria-label="축소"
						disabled={mapState !== 'ready' || zoomLevel <= MIN_ZOOM}
						onclick={() => zoomBy(-1)}><Minus size={20} aria-hidden="true" /></button
					>
				</div>
				<button
					type="button"
					class="ctl fit"
					aria-label="전체 보기"
					disabled={mapState !== 'ready'}
					onclick={fit}><Maximize size={20} aria-hidden="true" /></button
				>
			</div>
		{/if}
		{#if hintOn}
			<div class="hint" data-testid="wheel-hint">
				지도를 확대·축소하려면 Ctrl 키를 누른 채 스크롤하세요
			</div>
		{/if}
		{#if cardItem}
			<div
				class="iw {cardPos?.cls ?? ''}"
				class:pending={!cardPos}
				role="group"
				aria-labelledby="rm-iw-t"
				data-testid="complex-card"
				bind:this={iwEl}
				style={cardPos && isPc.current
					? `left:${cardPos.left}px;top:${cardPos.top}px;--ax:${cardPos.ax ?? 50}px;--ay:${cardPos.ay ?? 50}px`
					: undefined}
			>
				<div class="hd">
					<h3 id="rm-iw-t" tabindex="-1" data-card-title>{cardItem.name}</h3>
					<button type="button" class="x" aria-label="닫기" onclick={() => deselect(true)}
						><X size={20} aria-hidden="true" /></button
					>
				</div>
				<ComplexInfo item={cardItem} />
				{#if watchHref || (stackIds && onbackstack)}
					<div class="acts">
						{#if watchHref}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 주소는 page의 href()가 resolve('/(app)/realestate')에 ?tab을 붙여 만든 것 -->
							<a class="pri btn" href={watchHref(cardItem.id)}>점수 근거 보기</a>
						{/if}
						{#if stackIds && onbackstack}
							<button type="button" class="back btn" data-testid="stack-back" onclick={onbackstack}
								>겹친 단지 {stackIds.length}곳으로</button
							>
						{/if}
					</div>
				{/if}
			</div>
		{:else if stackCard}
			<div
				class="iw stack {cardPos?.cls ?? ''}"
				class:pending={!cardPos}
				role="dialog"
				aria-labelledby="rm-iw-t"
				data-testid="stack-card"
				bind:this={iwEl}
				style={cardPos && isPc.current
					? `left:${cardPos.left}px;top:${cardPos.top}px;--ax:${cardPos.ax ?? 50}px;--ay:${cardPos.ay ?? 50}px`
					: undefined}
			>
				<div class="hd">
					<h3 id="rm-iw-t" tabindex="-1" data-card-title>겹친 단지 {stackItems.length}곳</h3>
					<button type="button" class="x" aria-label="닫기" onclick={() => closeStack(true)}
						><X size={20} aria-hidden="true" /></button
					>
				</div>
				<p class="sd">같은 자리에 겹쳐 있어요. 단지를 고르면 정보가 열려요.</p>
				<div class="sl">
					<ComplexList
						items={stackItems}
						selectedId={null}
						onselect={onStackRow}
						hint="정보를 열려면 누르세요"
					/>
				</div>
			</div>
		{/if}
		{#if mapState === 'idle' || mapState === 'loading'}
			<div class="ov load" role="status">
				<div class="in">
					<div class="ico"><LoaderCircle class="spin" size={24} aria-hidden="true" /></div>
					<h3>지도를 불러오는 중이에요</h3>
					<p>단지 목록은 지금도 볼 수 있어요.</p>
					{#if onlist}
						<button type="button" class="only-m btn" onclick={onlist}>목록 먼저 보기</button>
					{/if}
				</div>
			</div>
		{:else if isFallback}
			<MapFallback reason={mapState as FallbackReason} onretry={retry} inline />
		{:else if mapState === 'ready' && visible.length === 0}
			<div class="ov" role="status">
				<div class="in">
					<div class="ico"><MapPinOff size={24} aria-hidden="true" /></div>
					<h3>보이는 단지가 없어요</h3>
					<p>위쪽에서 켜 둔 등급이 없어요. 하나 이상 켜면 단지가 나타나요.</p>
					{#if onallon}<button type="button" class="btn" onclick={onallon}>모든 등급 켜기</button
						>{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* 핀 고정색(시안 --pin-*, spec §8). 다크 모드에서도 바뀌지 않는다(1차 타일이 라이트). 새 전역 토큰 없음. */
	.rm-map {
		--pin-top: #d98a00;
		--pin-top-edge: #8f5200;
		--pin-top-ink: #1b1100;
		--pin-int: #0b6e67;
		--pin-int-edge: #095a54;
		--pin-int-ink: #ffffff;
		--pin-ref: #5d6676;
		--pin-ref-edge: #454e5c;
		--pin-ref-ink: #ffffff;
		--pin-cand: #ffffff;
		--pin-cand-edge: #3f4c99;
		--pin-cand-ink: #3f4c99;
		--pin-ink: #12161d;
		--pin-halo: #ffffff;
		position: relative;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		border-radius: inherit;
		isolation: isolate;
	}
	.rm-map.fb {
		height: auto;
	}
	.box {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: inherit;
		overflow: hidden;
		background: #eeebe3;
		touch-action: pan-y;
	}
	.rm-map.fb .box {
		height: auto;
		background: var(--color-surface-2);
	}
	@media (max-width: 639px) {
		.box {
			touch-action: none;
		}
	}
	.canvas {
		position: absolute;
		inset: 0;
	}
	.rm-map.fb .canvas,
	.rm-map.fb .count,
	.rm-map.fb .ctls {
		display: none;
	}

	/* ── 핀·묶음 (SDK가 마커 DOM을 옮겨 붙이므로 :global) ── */
	.rm-map :global(.rm-pin),
	.rm-map :global(.rm-cl) {
		position: relative;
		display: grid;
		place-items: center;
		background: none;
		border: 0;
		padding: 0;
		margin: 0;
		cursor: pointer;
		color: inherit;
		font: inherit;
		-webkit-tap-highlight-color: transparent;
	}
	.rm-map :global(svg.sh) {
		display: block;
		overflow: visible;
		filter: drop-shadow(0 1px 2px rgb(16 24 40 / 0.42));
	}
	.rm-map :global(.rm-pin.g-top) {
		--c: var(--pin-top);
		--e: var(--pin-top-edge);
		--i: var(--pin-top-ink);
		align-content: end;
	}
	.rm-map :global(.rm-pin.g-target) {
		--c: var(--pin-int);
		--e: var(--pin-int-edge);
		--i: var(--pin-int-ink);
		align-content: end;
	}
	.rm-map :global(.rm-pin.g-ref) {
		--c: var(--pin-ref);
		--e: var(--pin-ref-edge);
		--i: var(--pin-ref-ink);
	}
	.rm-map :global(.rm-pin.g-cand) {
		--c: var(--pin-cand);
		--e: var(--pin-cand-edge);
		--i: var(--pin-cand-ink);
	}
	.rm-map :global(.rm-pin svg .fl) {
		fill: var(--c);
		stroke: var(--pin-halo);
		stroke-width: 2.5;
		paint-order: stroke;
	}
	.rm-map :global(.rm-pin.g-cand svg .fl),
	.rm-map :global(.rm-pin.g-top svg .fl) {
		stroke: var(--e);
	}
	.rm-map :global(.rm-pin svg .nm) {
		fill: var(--i);
		font-family: inherit;
		font-variant-numeric: tabular-nums;
	}
	.rm-map :global(.rm-pin svg .sd) {
		fill: var(--pin-ink);
		stroke: var(--pin-halo);
		stroke-width: 2;
	}
	.rm-map :global(.rm-pin svg .sp) {
		fill: #ffe7a8;
		stroke: #ffe7a8;
		stroke-width: 2;
	}
	.rm-map :global(.rm-pin.sel svg.sh) {
		transform: scale(1.14);
		transform-origin: 50% 100%;
	}
	.rm-map :global(.rm-pin.g-ref.sel svg.sh),
	.rm-map :global(.rm-pin.g-cand.sel svg.sh) {
		transform-origin: 50% 50%;
	}
	.rm-map :global(.rm-pin.sel svg .fl),
	.rm-map :global(.rm-pin.sel.g-cand svg .fl),
	.rm-map :global(.rm-pin.sel.g-top svg .fl) {
		stroke: var(--pin-ink);
		stroke-width: 3;
	}
	.rm-map :global(.rm-pin:hover svg.sh) {
		transform: scale(1.06);
	}
	.rm-map :global(.rm-pin.sel:hover svg.sh) {
		transform: scale(1.14);
	}
	@media (prefers-reduced-motion: no-preference) {
		.rm-map :global(svg.sh) {
			transition: transform 0.12s;
		}
	}
	.rm-map :global(.rm-pin::before),
	.rm-map :global(.rm-cl::before) {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 12px;
		pointer-events: none;
	}
	.rm-map :global(.rm-pin:focus-visible),
	.rm-map :global(.rm-cl:focus-visible) {
		outline: 0;
	}
	.rm-map :global(.rm-pin:focus-visible::before),
	.rm-map :global(.rm-cl:focus-visible::before) {
		box-shadow:
			0 0 0 2px var(--pin-halo),
			0 0 0 5px var(--pin-ink);
	}
	.rm-map :global(.rm-lab) {
		position: absolute;
		left: 50%;
		top: calc(100% + 1px);
		transform: translateX(-50%);
		white-space: nowrap;
		background: #fff;
		color: var(--pin-ink);
		border-radius: var(--radius-xs);
		padding: 2px 7px;
		font-size: var(--text-sm);
		font-weight: 700;
		box-shadow: 0 1px 4px rgb(16 24 40 / 0.3);
		pointer-events: none;
		z-index: 2;
	}
	.rm-map :global(.rm-cl) {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		--s: 40px;
	}
	.rm-map :global(.rm-cl .d) {
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		background: var(--pin-halo);
		color: var(--pin-ink);
		border: 2.5px solid var(--pin-ink);
		box-shadow: 0 1px 3px rgb(16 24 40 / 0.35);
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	.rm-map :global(.rm-cl .d.big) {
		--s: 48px;
		width: 48px;
		height: 48px;
	}
	.rm-map :global(.rm-cl .star) {
		position: absolute;
		right: 2px;
		top: 2px;
	}
	.rm-map :global(.rm-cl .star circle) {
		fill: var(--pin-top);
		stroke: var(--pin-halo);
		stroke-width: 1.6;
	}
	.rm-map :global(.rm-cl .star path) {
		fill: var(--pin-top-ink);
		stroke: var(--pin-top-ink);
		stroke-width: 1.6;
	}

	/* ── 지도 위 컨트롤·카운트 ── */
	.ctls {
		position: absolute;
		right: 12px;
		top: 12px;
		z-index: 5;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ctls.dim {
		opacity: 0.55;
	}
	.zoom {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		box-shadow: var(--shadow-pop);
		overflow: hidden;
	}
	.zoom .ctl + .ctl {
		border-top: 1px solid var(--color-line);
	}
	.ctl {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		background: var(--color-surface);
		border: 0;
		color: var(--color-text);
		cursor: pointer;
		padding: 0;
	}
	.ctl:hover {
		background: var(--color-surface-2);
	}
	.ctl:disabled {
		color: var(--color-subtle);
		cursor: not-allowed;
		background: var(--color-surface-2);
	}
	.ctl:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	.fit {
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-pop);
	}
	@media (min-width: 1024px) {
		.ctl {
			width: 40px;
			height: 40px;
		}
	}
	.count {
		position: absolute;
		left: 12px;
		top: 12px;
		z-index: 5;
		max-width: calc(100% - 84px);
		background: var(--color-surface);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		padding: 8px 12px;
		font-size: var(--text-sm);
		font-weight: 600;
		box-shadow: var(--shadow-pop);
		line-height: 1.25rem;
	}
	.count b {
		font-variant-numeric: tabular-nums;
		font-weight: 800;
	}
	.count small {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-subtle);
		font-weight: 500;
	}
	.hint {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 8;
		background: rgb(18 22 29 / 0.88);
		color: #fff;
		font-weight: 600;
		font-size: var(--text-base);
		padding: 12px 18px;
		border-radius: var(--radius-md);
		text-align: center;
		pointer-events: none;
		max-width: 80%;
	}

	/* ── 정보 카드(PC 앵커 · 태블릿 지도 칸 아래) ── */
	.iw {
		position: absolute;
		z-index: 10;
		width: 328px;
		background: var(--color-surface);
		border: 1px solid var(--color-card-line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-pop);
		padding: 14px 16px 16px;
		color: var(--color-text);
		text-align: left;
	}
	.iw.pending {
		visibility: hidden;
	}
	.iw::after {
		content: '';
		position: absolute;
		left: var(--ax, 50%);
		width: 14px;
		height: 14px;
		background: var(--color-surface);
		transform: translateX(-50%) rotate(45deg);
		box-shadow: 2px 2px 3px rgb(16 24 40 / 0.1);
	}
	.iw.up::after {
		bottom: -7px;
	}
	.iw.down::after {
		top: -7px;
		box-shadow: -2px -2px 3px rgb(16 24 40 / 0.08);
	}
	.iw.r::after {
		left: -7px;
		top: var(--ay, 50%);
		transform: translateY(-50%) rotate(45deg);
		box-shadow: -2px 2px 3px rgb(16 24 40 / 0.1);
	}
	.iw.l::after {
		left: auto;
		right: -14px;
		top: var(--ay, 50%);
		transform: translateY(-50%) rotate(45deg);
		box-shadow: 2px -2px 3px rgb(16 24 40 / 0.1);
	}
	.hd {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	h3 {
		font-size: var(--text-lg);
		line-height: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 4px 0 6px;
	}
	h3:focus {
		outline: 0;
	}
	h3:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
		border-radius: var(--radius-xs);
	}
	.x {
		width: 40px;
		height: 40px;
		margin: -8px -10px 0 0;
		flex: none;
		border: 0;
		background: transparent;
		border-radius: var(--radius-sm);
		display: grid;
		place-items: center;
		color: var(--color-muted);
		cursor: pointer;
	}
	.x:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
	}
	.x:focus-visible {
		outline: 2px solid var(--color-focus);
	}
	@media (min-width: 640px) and (max-width: 1023px) {
		.iw {
			left: 12px !important;
			right: 12px;
			top: auto !important;
			bottom: 34px;
			width: auto;
		}
		.iw::after {
			display: none;
		}
	}

	/* ── 상태 덮개 ── */
	.ov {
		position: absolute;
		inset: 0;
		z-index: 9;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--color-surface-2);
		text-align: center;
	}
	.in {
		max-width: 30rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: var(--color-muted);
	}
	.ico {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--color-surface);
		display: grid;
		place-items: center;
		box-shadow: var(--shadow-card);
	}
	.ov h3 {
		color: var(--color-text);
		margin: 4px 0 0;
	}
	.ov p {
		font-size: var(--text-base);
		line-height: 1.5rem;
		margin: 0;
	}
	.btn {
		min-height: 44px;
		padding: 0 16px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-line-strong);
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: 600;
		cursor: pointer;
		margin-top: 8px;
	}
	.sd {
		font-size: var(--text-sm);
		color: var(--color-muted);
		margin: 0 0 8px;
	}
	.sl {
		max-height: 248px;
		overflow-y: auto;
		margin: 0 -8px;
	}
	.btn.back {
		min-height: 40px;
	}
	.acts {
		display: flex;
		gap: 8px;
		margin-top: 12px;
		flex-wrap: wrap;
	}
	a.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		text-decoration: none;
		margin-top: 0;
	}
	a.btn.pri {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent, #fff);
	}
	.only-m {
		display: none;
	}
	@media (max-width: 639px) {
		.only-m {
			display: inline-flex;
			align-items: center;
		}
	}
	.ov :global(.spin) {
		animation: rm-spin 1s linear infinite;
	}
	@keyframes rm-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ov :global(.spin) {
			animation: none;
		}
	}
</style>
