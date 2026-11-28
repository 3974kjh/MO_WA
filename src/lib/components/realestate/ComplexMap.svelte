<script lang="ts">
	/**
	 * FE-12 ⑤ 네이버 지도(dynamic import 대상 — /realestate 동기 클로저에 넣지 않는다, PLAN §3-2·§4-5).
	 * - SDK는 이 컴포넌트가 화면 가까이 올 때(IntersectionObserver 200px)만 요청한다. 키가 없으면 페이지가
	 *   이 컴포넌트를 아예 불러오지 않는다.
	 * - 상태: idle → loading → ready | auth-failed | load-failed | timeout | offline | error. 지도를 만든 뒤에도
	 *   첫 타일(tilesloaded)이 시간 안에 안 오면 timeout(W4: 빈 회색 지도 방지), 인증 실패는 언제 와도 폴백.
	 *   검증용 상태는 data-state·data-markers 속성으로만 둔다(화면 문구에 코드 없음).
	 * - 마커: 버튼(aria-label·aria-pressed, Enter/Space). 구분은 모양+숫자(색만으로 구분하지 않음).
	 *   줌별 격자 클러스터(외부 라이브러리 없음), 클러스터를 누르면 그 영역으로 확대. 고른 단지는 묶지 않는다.
	 * - 마커 내용은 createElement + textContent로만 만든다(innerHTML·{@html} 없음).
	 * - 정보창 대신 목록·정보 카드와 선택 상태를 공유한다(onselect).
	 */
	import { onMount } from 'svelte';
	import { CLUSTER_MAX_ZOOM, clusterPoints, type Cluster } from '$lib/maps/cluster';
	import {
		failReason,
		LOAD_TIMEOUT_MS,
		naverLoader,
		type NaverLoader,
		type NaverMapsNs
	} from '$lib/maps/naverLoader';
	import { TIER_LABEL, TIER_ORDER, type ComplexTier, type LocatedItem } from '$lib/maps/points';
	import MapFallback, { type FallbackReason } from './MapFallback.svelte';

	let {
		items,
		keyId,
		selectedId,
		onselect,
		loader,
		tileTimeoutMs = LOAD_TIMEOUT_MS,
		observe = true
	}: {
		items: LocatedItem[];
		keyId: string;
		selectedId: string | null;
		onselect: (id: string) => void;
		/** 시험용 주입. 기본은 페이지 공용 로더 */
		loader?: NaverLoader;
		tileTimeoutMs?: number;
		/** false면 보일 때를 기다리지 않고 바로 시작(시험용) */
		observe?: boolean;
	} = $props();

	type MapState = 'idle' | 'loading' | 'ready' | FallbackReason;
	let mapState = $state<MapState>('idle');
	let hidden = $state<ComplexTier[]>([]);
	let markerCount = $state(0);
	let root: HTMLDivElement;
	let canvas: HTMLDivElement;

	/* eslint-disable @typescript-eslint/no-explicit-any -- SDK 객체(타입 정의 미도입) */
	let ns: NaverMapsNs | null = null;
	let map: any = null;
	let markers: any[] = [];
	let listeners: any[] = [];
	/* eslint-enable @typescript-eslint/no-explicit-any */
	let tileTimer: ReturnType<typeof setTimeout> | undefined;
	let offAuth: (() => void) | undefined;

	let isFallback = $derived(mapState !== 'idle' && mapState !== 'loading' && mapState !== 'ready');
	let tiers = $derived(
		TIER_ORDER.map((t) => ({ t, n: items.filter((i) => i.tier === t).length })).filter((x) => x.n)
	);

	const nf = new Intl.NumberFormat('ko-KR');
	const PIN_TIER = new Set<ComplexTier>(['top', 'target']);
	const LETTER: Partial<Record<ComplexTier, string>> = { cand: '후', ref: '참' };
	const scoreText = (s: number) => nf.format(Math.round(s));

	function clearMarkers() {
		for (const m of markers) m.setMap(null);
		markers = [];
		markerCount = 0;
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
	}

	function fail(reason: FallbackReason) {
		teardown();
		mapState = reason;
	}

	function start() {
		teardown();
		mapState = 'loading';
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

	function latLng(lat: number, lng: number) {
		return new ns.LatLng(lat, lng);
	}

	function fitAll() {
		if (!items.length) return;
		if (items.length === 1) {
			map.setCenter(latLng(items[0].lat, items[0].lng));
			map.setZoom(CLUSTER_MAX_ZOOM);
			return;
		}
		const lats = items.map((i) => i.lat);
		const lngs = items.map((i) => i.lng);
		map.fitBounds(
			new ns.LatLngBounds(
				latLng(Math.min(...lats), Math.min(...lngs)),
				latLng(Math.max(...lats), Math.max(...lngs))
			),
			{ top: 48, right: 40, bottom: 40, left: 40 }
		);
	}

	function init(n: NaverMapsNs) {
		ns = n;
		try {
			map = new n.Map(canvas, {
				center: latLng(37.45, 127.0),
				zoom: 9,
				zoomControl: true,
				zoomControlOptions: { position: n.Position.TOP_RIGHT },
				scaleControl: true,
				mapDataControl: false
			});
			fitAll();
			tileTimer = setTimeout(() => {
				if (mapState === 'loading') fail('timeout');
			}, tileTimeoutMs);
			listeners.push(
				n.Event.once(map, 'tilesloaded', () => {
					clearTimeout(tileTimer);
					if (mapState === 'loading') mapState = 'ready';
				}),
				n.Event.addListener(map, 'zoom_changed', () => render())
			);
			render();
		} catch (e) {
			console.error('[realestate.map] render failed', e instanceof Error ? e.message : String(e));
			fail('error');
		}
	}

	function pinLabel(it: LocatedItem, selected: boolean): string {
		return [
			`${it.rank}번 ${it.name}`,
			TIER_LABEL[it.tier],
			it.score == null ? null : `총점 ${scoreText(it.score)}점`,
			selected ? '선택됨' : null
		]
			.filter(Boolean)
			.join(', ');
	}

	function pinEl(it: LocatedItem, selected: boolean): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = `cm-pin cm-${it.tier}${selected ? ' is-sel' : ''}`;
		b.dataset.cx = it.id;
		b.setAttribute('aria-pressed', String(selected));
		b.setAttribute('aria-label', pinLabel(it, selected));
		const s = document.createElement('span');
		s.className = 'cm-shape';
		s.setAttribute('aria-hidden', 'true');
		// 색 외 구분(시안 v1.7.8): 최우선·관심은 점수, 후보 '후'·참고 '참'
		if (PIN_TIER.has(it.tier)) s.textContent = it.score != null ? scoreText(it.score) : '';
		else s.textContent = LETTER[it.tier] ?? '';
		b.append(s);
		b.addEventListener('click', (ev) => {
			ev.stopPropagation();
			onselect(it.id);
		});
		return b;
	}

	function clusterEl(c: Cluster<LocatedItem>): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'cm-cluster';
		b.setAttribute('aria-label', `단지 ${c.items.length}곳 묶음, 눌러서 확대`);
		const s = document.createElement('span');
		s.setAttribute('aria-hidden', 'true');
		s.textContent = String(c.items.length);
		b.append(s);
		b.addEventListener('click', (ev) => {
			ev.stopPropagation();
			zoomInto(c);
		});
		return b;
	}

	function zoomInto(c: Cluster<LocatedItem>) {
		const { south, west, north, east } = c.bounds;
		if (south === north && west === east) {
			map.setCenter(latLng(c.lat, c.lng));
			map.setZoom(CLUSTER_MAX_ZOOM);
		} else {
			map.fitBounds(new ns.LatLngBounds(latLng(south, west), latLng(north, east)), {
				top: 48,
				right: 48,
				bottom: 48,
				left: 48
			});
		}
	}

	const Z: Record<ComplexTier, number> = { top: 300, target: 200, ref: 100, cand: 50 };

	function addMarker(lat: number, lng: number, el: HTMLElement, pin: boolean, zIndex: number) {
		markers.push(
			new ns.Marker({
				position: latLng(lat, lng),
				map,
				icon: { content: el, anchor: new ns.Point(20, pin ? 44 : 20) },
				zIndex,
				clickable: true
			})
		);
	}

	function render() {
		if (!ns || !map) return;
		clearMarkers();
		const visible = items.filter((it) => !hidden.includes(it.tier));
		const sel = visible.find((it) => it.id === selectedId) ?? null;
		const rest = sel ? visible.filter((it) => it !== sel) : visible;
		for (const c of clusterPoints(rest, map.getZoom())) {
			if (c.items.length === 1) {
				const it = c.items[0];
				addMarker(
					it.lat,
					it.lng,
					pinEl(it, false),
					PIN_TIER.has(it.tier),
					Z[it.tier] + (it.score ?? 0)
				);
			} else {
				addMarker(c.lat, c.lng, clusterEl(c), false, 500);
			}
		}
		if (sel) addMarker(sel.lat, sel.lng, pinEl(sel, true), PIN_TIER.has(sel.tier), 10_000);
		markerCount = markers.length;
	}

	function toggleTier(t: ComplexTier) {
		hidden = hidden.includes(t) ? hidden.filter((x) => x !== t) : [...hidden, t];
	}

	// 선택·범례가 바뀌면 다시 그리고, 고른 단지로 옮긴다
	$effect(() => {
		void hidden.length;
		const id = selectedId;
		if (!map || !ns) return;
		render();
		const sel = items.find((it) => it.id === id);
		if (sel) map.panTo(latLng(sel.lat, sel.lng));
	});

	onMount(() => {
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
			io?.disconnect();
			offAuth?.();
			teardown();
		};
	});
</script>

<div
	class="cm"
	bind:this={root}
	data-testid="complex-map"
	data-state={mapState}
	data-markers={markerCount}
>
	<div
		class="box"
		role="group"
		aria-label="단지 위치 지도. 같은 정보가 단지 목록에 있어요"
		aria-busy={mapState === 'idle' || mapState === 'loading'}
	>
		<div class="canvas" bind:this={canvas}></div>
		{#if mapState === 'idle' || mapState === 'loading'}
			<div class="ld" role="status">지도를 불러오는 중…</div>
		{:else if isFallback}
			<MapFallback reason={mapState as FallbackReason} onretry={start} />
		{/if}
	</div>
	{#if mapState === 'ready' && tiers.length}
		<div class="lg" role="group" aria-label="범례. 눌러서 지도 표시를 켜고 꺼요">
			{#each tiers as { t, n } (t)}
				<button
					type="button"
					class="lgb"
					aria-pressed={!hidden.includes(t)}
					onclick={() => toggleTier(t)}
				>
					<span class="sw cm-{t}" aria-hidden="true"><span class="cm-shape"></span></span>
					{TIER_LABEL[t]} <span class="n">{n}곳</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.cm {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.box {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		max-height: 560px;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-surface-2);
	}
	@media (max-width: 639px) {
		.box {
			aspect-ratio: auto;
			height: 320px;
		}
	}
	.canvas {
		position: absolute;
		inset: 0;
	}
	.ld {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--color-muted);
		font-size: var(--text-sm);
		background: linear-gradient(
			90deg,
			var(--color-surface-2),
			var(--color-surface-3),
			var(--color-surface-2)
		);
		background-size: 200% 100%;
		animation: cm-sh 1.4s ease-in-out infinite;
	}
	@keyframes cm-sh {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: -100% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ld {
			animation: none;
		}
	}
	.lg {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.lgb {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-full);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.lgb[aria-pressed='false'] {
		color: var(--color-subtle);
		background: var(--color-surface-2);
		text-decoration: line-through;
	}
	.lgb:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	.n {
		color: var(--color-muted);
		font-variant-numeric: tabular-nums;
	}
	.sw {
		position: relative;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
	}
	.sw .cm-shape {
		min-width: 0 !important;
		width: 14px;
		height: 14px;
		padding: 0 !important;
	}

	/* 마커(지도 SDK가 만든 DOM 안에 들어가므로 :global, .cm 아래로 범위를 좁힌다) */
	.cm :global(.cm-pin),
	.cm :global(.cm-cluster) {
		width: 40px;
		height: 40px;
		padding: 0;
		border: 0;
		background: none;
		display: grid;
		place-items: center;
		cursor: pointer;
		font: inherit;
	}
	.cm :global(.cm-pin.cm-top),
	.cm :global(.cm-pin.cm-target) {
		height: 44px;
		align-items: start;
	}
	.cm :global(.cm-pin:focus-visible),
	.cm :global(.cm-cluster:focus-visible) {
		outline: 3px solid var(--color-focus);
		outline-offset: 0;
		border-radius: var(--radius-sm);
	}
	.cm :global(.cm-shape) {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		font-size: var(--text-xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		transition: transform 0.12s ease;
	}
	/* 최우선: 큰 핀(채움 경고색) + 점수 / 타깃: 핀(강조색) + 점수 — 아래 꼬리로 위치를 가리킨다 */
	.cm :global(.cm-top .cm-shape),
	.cm :global(.cm-target .cm-shape) {
		position: relative;
		min-width: 30px;
		height: 30px;
		padding: 0 6px;
		border-radius: var(--radius-full);
		border: 2px solid var(--color-surface);
		box-shadow: var(--shadow-card);
	}
	.cm :global(.cm-top .cm-shape) {
		min-width: 34px;
		height: 34px;
		background: var(--color-warn-fill);
		color: var(--color-on-warn);
	}
	.cm :global(.cm-target .cm-shape) {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}
	.cm :global(.cm-pin.cm-top .cm-shape::after),
	.cm :global(.cm-pin.cm-target .cm-shape::after) {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -8px;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-top: 6px solid var(--color-surface);
	}
	/* 참고: 테두리 원 / 후보: 마름모 */
	.cm :global(.cm-ref .cm-shape) {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--color-muted);
		color: var(--color-surface);
		border: 2px solid var(--color-surface);
		box-shadow: var(--shadow-card);
	}
	/* 후보: 마름모(기울인 바탕) + '후' */
	.cm :global(.cm-cand .cm-shape) {
		position: relative;
		isolation: isolate;
		width: 24px;
		height: 24px;
		color: var(--color-accent);
	}
	.cm :global(.cm-cand .cm-shape::before) {
		content: '';
		position: absolute;
		inset: 3px;
		z-index: -1;
		transform: rotate(45deg);
		border-radius: 3px;
		background: var(--color-surface);
		border: 2px solid var(--color-accent);
		box-shadow: var(--shadow-card);
	}
	.cm :global(.cm-pin.is-sel .cm-shape) {
		outline: 3px solid var(--color-focus);
		outline-offset: 1px;
		transform: scale(1.15);
	}
	.cm :global(.cm-cluster span) {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--color-text);
		color: var(--color-surface);
		border: 3px solid var(--color-surface);
		box-shadow: var(--shadow-card);
		font-size: var(--text-sm);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
