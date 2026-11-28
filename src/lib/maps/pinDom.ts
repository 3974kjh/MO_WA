/**
 * 지도 마커 DOM(시안 v1.7.8 shared/realestate-map.js pinSvg·cluster): 등급별 SVG 핀과 묶음 버튼.
 * createElement(NS) + textContent로만 만든다(innerHTML 없음). 색은 .rm 범위의 --pin-* 변수가 정한다.
 * 모양+글자로도 구분된다: 최우선 물방울+별, 일반 물방울, 후보 마름모 '후', 참고 원 '참'.
 */
import { STAR_D } from './shapes';
import { TIER_LABEL, type ComplexTier, type LocatedItem } from './points';

const SVG = 'http://www.w3.org/2000/svg';
const TEAR =
	'M20 48.5C20 48.5 3.5 31.5 3.5 18.5A16.5 16.5 0 0 1 36.5 18.5C36.5 31.5 20 48.5 20 48.5Z';

/** 버튼 크기(터치 44px 보장)와 SVG 크기, 기준점(물방울은 아래 끝, 그 밖은 중심) */
export const PIN_SIZE: Record<
	ComplexTier,
	{ w: number; h: number; sw: number; sh: number; tear: boolean }
> = {
	top: { w: 44, h: 52, sw: 40, sh: 50, tear: true },
	target: { w: 44, h: 48, sw: 34, sh: 43, tear: true },
	cand: { w: 44, h: 44, sw: 30, sh: 30, tear: false },
	ref: { w: 44, h: 44, sw: 26, sh: 26, tear: false }
};

const nf = new Intl.NumberFormat('ko-KR');
export const scoreText = (s: number) => nf.format(Math.round(s));

function el<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string>,
	text?: string
): SVGElementTagNameMap[K] {
	const e = document.createElementNS(SVG, tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
	if (text != null) e.textContent = text;
	return e;
}

function shape(it: LocatedItem): SVGSVGElement {
	const z = PIN_SIZE[it.tier];
	const svg = el('svg', {
		class: 'sh',
		width: String(z.sw),
		height: String(z.sh),
		viewBox: it.tier === 'top' || it.tier === 'target' ? '0 0 40 50' : '0 0 30 30',
		'aria-hidden': 'true',
		focusable: 'false'
	});
	const num = it.score != null ? scoreText(it.score) : '';
	if (it.tier === 'top' || it.tier === 'target') {
		svg.append(el('path', { class: 'fl', d: TEAR }));
		svg.append(
			el(
				'text',
				{
					class: 'nm',
					x: '20',
					y: it.tier === 'top' ? '24' : '23.5',
					'text-anchor': 'middle',
					'font-size': it.tier === 'top' ? '15' : '15.5',
					'font-weight': '800'
				},
				num
			)
		);
		if (it.tier === 'top') {
			svg.append(el('circle', { class: 'sd', cx: '33.5', cy: '6.5', r: '7.2' }));
			svg.append(
				el('path', { class: 'sp', d: STAR_D, transform: 'translate(28.6 1.6) scale(.41)' })
			);
		}
	} else if (it.tier === 'cand') {
		svg.append(
			el('rect', {
				class: 'fl',
				x: '7',
				y: '7',
				width: '16',
				height: '16',
				rx: '3',
				transform: 'rotate(45 15 15)'
			})
		);
		svg.append(
			el(
				'text',
				{
					class: 'nm',
					x: '15',
					y: '19.4',
					'text-anchor': 'middle',
					'font-size': '13',
					'font-weight': '800'
				},
				'후'
			)
		);
	} else {
		svg.append(el('circle', { class: 'fl', cx: '15', cy: '15', r: '10.5' }));
		svg.append(
			el(
				'text',
				{
					class: 'nm',
					x: '15',
					y: '19.2',
					'text-anchor': 'middle',
					'font-size': '12.5',
					'font-weight': '800'
				},
				'참'
			)
		);
	}
	return svg;
}

/** 스크린리더 이름: 단지명, 등급[, 총점](최우선·관심만), 지역 */
export function pinLabel(it: LocatedItem): string {
	return [
		it.name,
		TIER_LABEL[it.tier],
		(it.tier === 'top' || it.tier === 'target') && it.score != null
			? `총점 ${scoreText(it.score)}점`
			: null,
		it.region || null
	]
		.filter(Boolean)
		.join(', ');
}

export function createPinEl(it: LocatedItem, selected: boolean): HTMLButtonElement {
	const z = PIN_SIZE[it.tier];
	const b = document.createElement('button');
	b.type = 'button';
	b.className = `rm-pin g-${it.tier}${selected ? ' sel' : ''}`;
	b.dataset.id = it.id;
	b.dataset.key = it.id;
	b.style.width = `${z.w}px`;
	b.style.height = `${z.h}px`;
	b.tabIndex = -1;
	b.setAttribute('aria-pressed', String(selected));
	b.setAttribute('aria-label', pinLabel(it));
	b.append(shape(it));
	if (selected) {
		const l = document.createElement('span');
		l.className = 'rm-lab';
		l.setAttribute('aria-hidden', 'true');
		l.textContent = it.name;
		b.append(l);
	}
	return b;
}

/**
 * 묶음 버튼. `stack`이면 더 확대할 수 없는 최대 확대 묶음: 누르면 '겹친 단지 n곳' 목록을 연다(aria-expanded).
 */
export function createClusterEl(ids: string[], topCount: number, stack = false): HTMLButtonElement {
	const n = ids.length;
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'rm-cl';
	b.dataset.key = ids.join(',');
	b.dataset.ids = ids.join(',');
	b.tabIndex = -1;
	b.setAttribute(
		'aria-label',
		`단지 ${n}곳 묶음${topCount ? `, 최우선 ${topCount}곳 포함` : ''}. ${
			stack ? '누르면 겹친 단지 목록을 열어요' : '누르면 확대해요'
		}`
	);
	if (stack) {
		b.dataset.stack = '1';
		b.setAttribute('aria-expanded', 'false');
	}
	const d = document.createElement('span');
	d.className = n >= 10 ? 'd big' : 'd';
	d.setAttribute('aria-hidden', 'true');
	d.textContent = String(n);
	b.append(d);
	if (topCount) {
		const svg = el('svg', {
			class: 'star',
			width: '18',
			height: '18',
			viewBox: '0 0 18 18',
			'aria-hidden': 'true',
			focusable: 'false'
		});
		svg.append(el('circle', { cx: '9', cy: '9', r: '8' }));
		svg.append(el('path', { d: STAR_D, transform: 'translate(4.2 4) scale(.4)' }));
		b.append(svg);
	}
	return b;
}
