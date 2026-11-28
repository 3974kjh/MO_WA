<script lang="ts" module>
	import type { ComplexTier } from '$lib/maps/points';

	/** 처음에 꺼 둘 등급(시안 §9-1: '참고'까지 모두 켬). 바꾸려면 여기만 고친다. */
	export const DEFAULT_HIDDEN_TIERS: ComplexTier[] = [];
</script>

<script lang="ts">
	/**
	 * FE-12 ⑤ 지도 탭 본문(시안 design/screens/realestate-map.html, 명세 design/realestate-map-spec.md, handoff §24).
	 * - 지도 칸(ComplexMap)은 키가 있고 위치가 있는 단지가 있을 때만 import()한다 → 이 컴포넌트(동기)에는 지도 코드·SDK 없음.
	 * - 키 없음·인증 실패·로드 실패·8초 초과: 지도 칸이 안내 카드로 줄고(data-fallback) 목록이 넓게 이어지며 행마다 네이버 링크.
	 * - 모바일(<640): [목록|지도] 전환. 지도 모드는 탭 줄·전환 바 아래~하단 탭바 위를 고정 높이로 채우고 페이지 스크롤을 잠근다.
	 *   정보는 시트(Sheet bottom). PC는 핀 카드(ComplexMap), 태블릿은 지도 칸 아래 카드.
	 * - 표시 전용: 쓰기 액션 없음.
	 */
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import Layers from '@lucide/svelte/icons/layers';
	import List from '@lucide/svelte/icons/list';
	import MapIcon from '@lucide/svelte/icons/map';
	import Card from '$lib/components/ui/Card.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import { lazyImport } from '$lib/lazyImport';
	import { LOAD_TIMEOUT_MS } from '$lib/maps/naverLoader';
	import {
		TIER_LABEL,
		TIER_ORDER,
		isLocated,
		type ComplexItem,
		type LocatedItem
	} from '$lib/maps/points';
	import type { MapStatus } from './ComplexMap.svelte';
	import ComplexInfo from './ComplexInfo.svelte';
	import ComplexList from './ComplexList.svelte';
	import MapFallback from './MapFallback.svelte';
	import MapLegend from './MapLegend.svelte';
	import NoGeoList from './NoGeoList.svelte';

	const mapChunk = lazyImport(() => import('./ComplexMap.svelte'));
	type MapComponent = typeof import('./ComplexMap.svelte').default;
	type MapApi = ReturnType<typeof import('./ComplexMap.svelte').default>;

	let {
		items,
		mapKeyId,
		asOfText = '',
		initialId = null,
		watchHref,
		loadMapChunk,
		chunkTimeoutMs = LOAD_TIMEOUT_MS
	}: {
		items: ComplexItem[];
		mapKeyId: string | null;
		asOfText?: string;
		initialId?: string | null;
		watchHref: (id: string) => string;
		/** 시험용. 기본은 ComplexMap 청크를 lazyImport로 받는다 */
		loadMapChunk?: () => Promise<{ default: MapComponent }>;
		/** 청크 import() 한도(기본 8초). 넘기면 기존 로드 실패 폴백 */
		chunkTimeoutMs?: number;
	} = $props();

	const sep = ' · ';
	const FAIL: ReadonlySet<string> = new Set([
		'auth-failed',
		'load-failed',
		'timeout',
		'offline',
		'error'
	]);

	let located = $derived(items.filter(isLocated) as LocatedItem[]);
	let nogeo = $derived(items.filter((i) => !isLocated(i)));
	let hidden = $state<ComplexTier[]>([...DEFAULT_HIDDEN_TIERS]);
	// svelte-ignore state_referenced_locally
	let picked = $state<string | null>(
		initialId && items.some((i) => i.id === initialId) ? initialId : null
	);
	let view = $state<'list' | 'map'>('map');
	let legendOpen = $state(false);
	let sheetOpen = $state(false);
	let sheetFromList = $state(false);
	/** 최대 확대에서도 남는 묶음의 '겹친 단지 n곳' 목록(열려 있을 때 단지 id들) */
	let stack = $state<string[] | null>(null);
	let mapStatus = $state<MapStatus>('idle');
	let chunk = $state<MapComponent | null>(null);
	let chunkFailed = $state(false);
	let attempt = $state(0);
	let live = $state('');
	let mapApi = $state<MapApi>();
	let barEl = $state<HTMLDivElement>();

	const isMobile = new MediaQuery('max-width: 639px', false);

	let hasMap = $derived(!!mapKeyId && located.length > 0);
	let failReason = $derived(
		!mapKeyId
			? ('nokey' as const)
			: chunkFailed
				? ('load-failed' as const)
				: FAIL.has(mapStatus)
					? (mapStatus as 'auth-failed' | 'load-failed' | 'timeout' | 'offline' | 'error')
					: null
	);
	let fallback = $derived(located.length === 0 || failReason != null);
	let effView = $derived(fallback ? 'list' : view);
	let counts = $derived(
		Object.fromEntries(
			TIER_ORDER.map((t) => [t, located.filter((i) => i.tier === t).length])
		) as Record<ComplexTier, number>
	);
	let shown = $derived(located.filter((i) => !hidden.includes(i.tier)));
	let onTiers = $derived(TIER_ORDER.filter((t) => counts[t] > 0 && !hidden.includes(t)).length);
	let allTiers = $derived(TIER_ORDER.filter((t) => counts[t] > 0).length);
	let selected = $derived(items.find((i) => i.id === picked) ?? null);
	let stackItems = $derived(
		stack
			? stack
					.map((id) => items.find((i) => i.id === id))
					.filter((it): it is ComplexItem => !!it && !hidden.includes(it.tier))
			: []
	);

	function say(msg: string) {
		// 같은 문장이 연달아도 다시 읽히게 보이지 않는 글자를 번갈아 붙인다
		live = live === msg ? `${msg}\u200b` : msg;
	}

	// 지도 칸 코드는 지도 탭이 열려 있고(이 컴포넌트가 마운트됨) 키·좌표가 있을 때만 받는다.
	// import()가 멈추면 8초 뒤 기존 로드 실패 폴백('지도를 불러오지 못했어요')으로 넘긴다.
	$effect(() => {
		if (!hasMap) return;
		void attempt;
		chunkFailed = false;
		chunk = null;
		let cancelled = false;
		const timer = setTimeout(() => {
			if (!cancelled) {
				cancelled = true;
				chunkFailed = true;
			}
		}, chunkTimeoutMs);
		const load = loadMapChunk ?? (() => mapChunk.load());
		void load().then(
			(m) => {
				clearTimeout(timer);
				if (!cancelled) {
					chunkFailed = false;
					chunk = m.default;
				}
			},
			() => {
				clearTimeout(timer);
				if (!cancelled) chunkFailed = true;
			}
		);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	function toggleTier(t: ComplexTier) {
		hidden = hidden.includes(t) ? hidden.filter((x) => x !== t) : [...hidden, t];
		if (selected && hidden.includes(selected.tier)) picked = null;
		// 겹친 목록의 id는 그대로 두고, 표시·개수만 hidden으로 거른다(다시 켜면 복원).
		const on = !hidden.includes(t);
		const n = located.filter((i) => !hidden.includes(i.tier)).length;
		say(`${TIER_LABEL[t]} 단지 ${on ? '표시' : '숨김'}. 지금 ${n}곳이 보여요.`);
	}
	function allOn() {
		hidden = [];
		say(`모든 등급을 켰어요. ${located.length}곳이 보여요.`);
	}

	function statusLine(it: ComplexItem, where: '카드' | '시트') {
		const score =
			it.score != null && (it.tier === 'top' || it.tier === 'target')
				? `, 총점 ${Math.round(it.score)}점`
				: '';
		say(`${it.name}, ${TIER_LABEL[it.tier]}${score}. 정보 ${where}가 열렸어요.`);
	}

	/** 겹친 단지 목록이 열리거나(ids) 닫힘(null) */
	function onStack(ids: string[] | null) {
		stack = ids;
		if (ids) {
			picked = null;
			sheetOpen = false;
			say(`겹친 단지 ${ids.length}곳 목록이 열렸어요. 단지를 고르면 정보가 열려요.`);
		}
	}
	/** 정보 → 겹친 단지 목록으로 */
	function backToStack() {
		picked = null;
		sheetOpen = false;
		if (stackItems.length > 1) say(`겹친 단지 ${stackItems.length}곳 목록으로 돌아왔어요.`);
	}
	/** 모바일 시트의 겹친 단지 목록에서 행을 고름 */
	function onStackRow(id: string) {
		const it = items.find((i) => i.id === id);
		if (!it) return;
		picked = id;
		sheetFromList = false;
		sheetOpen = true;
		statusLine(it, '시트');
	}

	/** 지도 핀·묶음에서 고름 */
	function onMapSelect(id: string) {
		const it = items.find((i) => i.id === id);
		if (stack && !stack.includes(id)) stack = null;
		picked = id;
		if (!it) return;
		if (isMobile.current) {
			sheetFromList = false;
			sheetOpen = true;
			statusLine(it, '시트');
		} else statusLine(it, '카드');
	}
	function onDeselect() {
		picked = null;
	}

	/** 목록 행에서 고름 */
	function onRow(id: string) {
		const it = items.find((i) => i.id === id);
		if (!it) return;
		if (stack && !stack.includes(id)) stack = null;
		picked = id;
		if (!fallback && !isMobile.current && isLocated(it)) {
			mapApi?.centerOn(id);
			statusLine(it, '카드');
		} else {
			sheetFromList = true;
			sheetOpen = true;
			statusLine(it, '시트');
		}
	}

	function closeSheet() {
		// 겹친 단지 목록에서 연 정보: 시트가 닫히지 않고 목록으로 한 단계 돌아간다(Esc·끌어 닫기 같음)
		if (sheetOpen && stack && !sheetFromList) {
			backToStack();
			return;
		}
		const id = picked;
		const fromPin = !sheetFromList;
		const ids = stack;
		sheetOpen = false;
		if (ids) {
			stack = null;
			setTimeout(() => mapApi?.focusStack(ids), 0);
		} else if (fromPin && id) setTimeout(() => mapApi?.focusPin(id), 0);
	}

	async function showOnMap() {
		const id = picked;
		sheetOpen = false;
		view = 'map';
		await tick();
		mapApi?.refresh();
		if (id) mapApi?.centerOn(id);
	}

	async function setView(v: 'list' | 'map') {
		view = v;
		stack = null;
		legendOpen = false;
		say(v === 'map' ? '지도 보기' : '목록 보기');
		if (v === 'map') {
			await tick();
			requestAnimationFrame(() => mapApi?.refresh());
		}
	}

	// 모바일 지도 모드: 페이지 스크롤 잠금 + 탭 줄·전환 바 아래~하단 탭바 위를 채우는 좌표
	function measure() {
		const tb = document.querySelector('.tabbar');
		const de = document.documentElement;
		if (barEl && tb) {
			de.style.setProperty('--rm-top', `${Math.round(barEl.getBoundingClientRect().bottom + 8)}px`);
			de.style.setProperty(
				'--rm-bot',
				`${Math.round(window.innerHeight - tb.getBoundingClientRect().top)}px`
			);
		}
	}
	let locked = $derived(isMobile.current && effView === 'map' && !fallback);
	$effect(() => {
		const on = locked;
		document.documentElement.classList.toggle('rm-lock', on);
		if (on) {
			void tick().then(measure);
			window.addEventListener('resize', measure);
			return () => window.removeEventListener('resize', measure);
		}
	});
	onMount(() => () => {
		document.documentElement.classList.remove('rm-lock');
		document.documentElement.style.removeProperty('--rm-top');
		document.documentElement.style.removeProperty('--rm-bot');
	});

	const ComplexMapView = $derived(chunk);
	const openSheetItem = $derived(sheetOpen ? selected : null);
	/** 모바일 시트 내용: 정보 또는(정보가 없고 겹친 목록이 열려 있으면) 겹친 단지 목록 */
	const sheetKind = $derived(
		openSheetItem ? 'info' : isMobile.current && stackItems.length > 1 ? 'stack' : null
	);
</script>

<div
	class="rm"
	data-view={effView}
	data-fallback={fallback ? '1' : undefined}
	data-legend={legendOpen ? 'open' : undefined}
	data-state={failReason ?? mapStatus}
>
	<a class="skip" href="#re-list">지도 건너뛰고 단지 목록으로</a>
	<div class="re-top">
		<p class="asof" data-testid="re-asof" aria-label="데이터 기준 시각">
			<b>단지 위치</b> 지도 {located.length}곳{#if nogeo.length}
				{sep}위치 정보 없음 {nogeo.length}곳{/if}{#if asOfText}
				{sep}<b>가격</b> {asOfText}{/if}
		</p>
	</div>

	<div class="rm-bar" bind:this={barEl}>
		<div class="seg rm-seg" role="group" aria-label="보기 방식">
			<button type="button" aria-pressed={effView === 'list'} onclick={() => setView('list')}
				><List size={18} aria-hidden="true" />목록</button
			>
			<button type="button" aria-pressed={effView === 'map'} onclick={() => setView('map')}
				><MapIcon size={18} aria-hidden="true" />지도</button
			>
		</div>
		<button
			type="button"
			class="rm-legbtn"
			aria-expanded={legendOpen}
			aria-controls="rm-legend"
			onclick={() => (legendOpen = !legendOpen)}
			><Layers size={18} aria-hidden="true" />범례
			<span class="n">{onTiers}/{allTiers}</span></button
		>
		<div id="rm-legend" class="rm-legwrap">
			<MapLegend {counts} {hidden} ontoggle={toggleTier} />
		</div>
	</div>

	<div class="rm-grid">
		<div class="rm-mapcol">
			<div class="rm-mapbox" data-testid="map-box">
				{#if located.length === 0}
					<div class="empty" data-testid="complex-map" data-state="empty">
						<h3>지도에 표시할 단지가 없어요</h3>
						<p>
							단지에 위치 정보가 들어오면 지도와 목록에 함께 보여요. 위치가 없는 단지는 아래
							목록에서 이름으로 볼 수 있어요.
						</p>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 주소는 page의 href()가 resolve('/(app)/realestate')에 ?tab을 붙여 만든 것 -->
						<a class="lnk" href={watchHref('')}>관심 단지 보기</a>
					</div>
				{:else if !mapKeyId}
					<div data-testid="complex-map" data-state="nokey" data-markers="0">
						<MapFallback reason="nokey" inline />
					</div>
				{:else if chunkFailed}
					<div data-testid="complex-map" data-state="load-failed" data-markers="0">
						<MapFallback reason="load-failed" inline onretry={() => attempt++} />
					</div>
				{:else if ComplexMapView}
					<ComplexMapView
						bind:this={mapApi}
						items={located}
						keyId={mapKeyId}
						selectedId={picked}
						{hidden}
						{asOfText}
						{watchHref}
						onselect={onMapSelect}
						ondeselect={onDeselect}
						onstatus={(s: MapStatus) => (mapStatus = s)}
						onlist={() => setView('list')}
						onallon={allOn}
						onsay={say}
						stackIds={stack}
						onstack={onStack}
						onbackstack={backToStack}
					/>
				{:else}
					<div
						class="ld"
						role="status"
						data-testid="complex-map"
						data-state="init"
						data-markers="0"
					>
						<div class="sk"></div>
					</div>
				{/if}
			</div>
			{#if !fallback}
				<p class="rm-keys" id="rm-help">
					<b>키보드</b> 지도 핀에서 <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> 이웃 단지로
					이동 ·
					<kbd>Enter</kbd> 정보 열기(묶음은 확대) · <kbd>Esc</kbd> 닫기 · <kbd>+</kbd> <kbd>−</kbd>
					확대·축소 · <kbd>Shift</kbd>+방향키 지도 이동. 목록으로 바로 가려면 맨 위 ‘건너뛰기’
					링크를 쓰세요.
				</p>
			{/if}
		</div>
		<div class="rm-listcol">
			<Card flush>
				<div class="lh">
					<h2 id="re-list" tabindex="-1">단지 목록</h2>
					<span class="card-sub">등급·점수 높은 순 · {shown.length}곳</span>
				</div>
				<div class="lb">
					{#if shown.length}
						<ComplexList items={shown} selectedId={picked} onselect={onRow} {fallback} />
					{:else if located.length}
						<div class="none">
							<p>보이는 단지가 없어요</p>
							<button type="button" class="btn" onclick={allOn}>모든 등급 켜기</button>
						</div>
					{/if}
					<NoGeoList items={nogeo} open={located.length === 0} />
				</div>
			</Card>
		</div>
	</div>
	<div class="rm-live" role="status" aria-live="polite" aria-atomic="true">{live}</div>
</div>

{#snippet infoFooter()}
	{#if openSheetItem}
		<div class="sf">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 주소는 page의 href()가 resolve('/(app)/realestate')에 ?tab을 붙여 만든 것 -->
			<a class="pri btn" href={watchHref(openSheetItem.id)}>점수 근거 보기</a>
			{#if stackItems.length > 1 && !sheetFromList}
				<button type="button" class="btn" data-testid="stack-back" onclick={backToStack}
					>겹친 단지 {stackItems.length}곳으로</button
				>
			{/if}
			{#if sheetFromList && isLocated(openSheetItem) && !fallback}
				<button type="button" class="btn" onclick={showOnMap}>지도에서 위치 보기</button>
			{/if}
		</div>
	{/if}
{/snippet}

{#if sheetKind}
	<Sheet
		open
		onclose={closeSheet}
		title={openSheetItem ? openSheetItem.name : `겹친 단지 ${stackItems.length}곳`}
		variant="bottom"
		footer={openSheetItem ? infoFooter : undefined}
	>
		{#if openSheetItem}
			<ComplexInfo item={openSheetItem} />
		{:else}
			<div data-testid="stack-sheet">
				<ComplexList
					items={stackItems}
					selectedId={null}
					onselect={onStackRow}
					hint="정보를 열려면 누르세요"
				/>
				<p class="sd">같은 자리에 겹쳐 있어요. 한 곳을 고르면 정보를 봐요.</p>
			</div>
		{/if}
	</Sheet>
{/if}

<style>
	.sd {
		font-size: var(--text-sm);
		color: var(--color-muted);
		margin: 12px 0 0;
	}
	.rm {
		--rm-gap: 16px;
		position: relative;
	}
	.skip {
		position: absolute;
		left: -9999px;
	}
	.skip:focus {
		position: static;
		display: inline-block;
		margin-bottom: 8px;
		color: var(--color-accent);
		font-weight: 600;
	}
	.re-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.asof {
		margin: 8px 0 12px;
		font-size: var(--text-sm);
		color: var(--color-muted);
	}
	.asof b {
		color: var(--color-text);
		font-weight: 600;
	}
	.rm-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 12px;
		align-items: center;
		margin-bottom: 12px;
		position: relative;
	}
	.rm-seg,
	.rm-legbtn {
		display: none;
	}
	.rm-legwrap {
		min-width: 0;
		flex: 1 1 auto;
	}
	.rm-grid {
		display: grid;
		grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
		gap: var(--rm-gap);
		align-items: start;
	}
	.rm-mapcol {
		position: sticky;
		top: 76px;
		min-width: 0;
	}
	.rm-mapbox {
		position: relative;
		height: clamp(420px, calc(100dvh - 232px), 640px);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: #eeebe3;
		box-shadow: var(--shadow-card);
		isolation: isolate;
	}
	.rm-listcol {
		min-width: 0;
	}
	.lh {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 16px 16px 4px;
	}
	.lh h2 {
		font-size: var(--text-lg);
		font-weight: 700;
		margin: 0;
	}
	.lh h2:focus {
		outline: 0;
	}
	.lh h2:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	.card-sub {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.lb {
		padding: 0 10px 8px;
	}
	.none {
		text-align: center;
		padding: 24px 8px;
		color: var(--color-muted);
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}
	.btn.pri {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
	}
	.sf {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}
	.rm-keys {
		margin-top: 8px;
		font-size: var(--text-sm);
		color: var(--color-subtle);
		line-height: 1.2rem;
	}
	.rm-keys kbd {
		font: inherit;
		font-weight: 700;
		border: 1px solid var(--color-line-strong);
		border-bottom-width: 2px;
		border-radius: 4px;
		padding: 0 5px;
		background: var(--color-surface);
		color: var(--color-text);
	}
	.rm-live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.empty {
		padding: 28px 20px;
		text-align: center;
		color: var(--color-muted);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.empty h3 {
		color: var(--color-text);
		font-size: var(--text-lg);
		margin: 0;
	}
	.empty p {
		margin: 0;
		max-width: 30rem;
	}
	.lnk {
		color: var(--color-accent);
		font-weight: 600;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.sk {
		height: 100%;
		background: linear-gradient(
			90deg,
			var(--color-surface-2),
			var(--color-surface-3),
			var(--color-surface-2)
		);
		background-size: 200% 100%;
	}
	.ld {
		height: 100%;
	}

	/* 폴백(키 없음·실패·위치 0곳): 지도 칸을 접고 목록을 넓게 */
	.rm[data-fallback='1'] .rm-grid {
		grid-template-columns: minmax(0, 1fr);
	}
	.rm[data-fallback='1'] .rm-mapcol {
		position: static;
	}
	.rm[data-fallback='1'] .rm-mapbox {
		height: auto;
		background: var(--color-surface-2);
	}
	.rm[data-fallback='1'] .rm-seg {
		display: none;
	}

	/* 태블릿 640~1023: 진짜 2열(지도 | 목록) */
	@media (min-width: 640px) and (max-width: 1023px) {
		.rm-grid {
			grid-template-columns: minmax(0, 11fr) minmax(0, 9fr);
			gap: 12px;
		}
		.rm-mapcol {
			top: 68px;
		}
		.rm-mapbox {
			height: calc(100dvh - 224px);
			min-height: 520px;
		}
		.rm[data-fallback='1'] .rm-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.rm[data-fallback='1'] .rm-mapbox {
			min-height: 0;
			height: auto;
		}
	}
	/* 모바일 <640: 목록 | 지도 전환, 지도 모드는 고정 높이 + 페이지 스크롤 없음 */
	@media (max-width: 639px) {
		.rm-bar {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 8px;
			margin-bottom: 8px;
		}
		.rm-seg {
			display: inline-flex;
			width: 100%;
		}
		.rm-seg button {
			flex: 1 1 0;
			min-height: 44px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
		}
		.rm-legbtn {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			min-height: 44px;
			padding: 0 12px;
			border-radius: var(--radius-sm);
			border: 1px solid var(--color-line-strong);
			background: var(--color-surface);
			font-weight: 600;
			font-size: var(--text-base);
			color: var(--color-text);
			box-shadow: var(--shadow-card);
		}
		.rm-legbtn .n {
			font-variant-numeric: tabular-nums;
			color: var(--color-muted);
			font-weight: 700;
		}
		.rm-legbtn[aria-expanded='true'] {
			background: var(--color-accent-soft);
			border-color: var(--color-accent);
		}
		.rm-legwrap {
			grid-column: 1 / -1;
			flex: none;
		}
		.rm-grid {
			display: block;
		}
		.rm-mapcol {
			position: static;
		}
		.rm[data-view='list']:not([data-fallback='1']) .rm-mapcol {
			display: none;
		}
		.rm[data-view='map'] .rm-listcol,
		.rm[data-view='map'] .re-top {
			display: none;
		}
		.rm-mapbox {
			height: calc(100dvh - 330px);
			min-height: 300px;
		}
		.rm[data-view='map']:not([data-fallback='1']) .rm-mapcol {
			position: fixed;
			left: 0;
			right: 0;
			top: var(--rm-top, 200px);
			bottom: var(--rm-bot, 64px);
			z-index: 12;
		}
		.rm[data-view='map']:not([data-fallback='1']) .rm-mapbox {
			height: 100%;
			min-height: 0;
			border-radius: 0;
			box-shadow: none;
		}
		.rm[data-view='map'] .rm-bar {
			margin-bottom: 0;
		}
		.rm[data-fallback='1'] .rm-bar {
			grid-template-columns: minmax(0, 1fr);
		}
		.rm[data-fallback='1'] .rm-legbtn {
			justify-content: center;
		}
		.rm-keys {
			display: none;
		}
	}
	:global(html.rm-lock),
	:global(html.rm-lock body) {
		overflow: hidden;
		overscroll-behavior: none;
	}
	.seg {
		background: var(--color-surface-2);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 2px;
	}
	.seg button {
		border: 0;
		background: transparent;
		border-radius: var(--radius-xs);
		color: var(--color-muted);
		font-weight: 600;
	}
	.seg button[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-card);
	}
</style>
