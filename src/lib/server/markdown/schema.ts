/**
 * 리포트 본문 sanitize 허용 목록 (FE-15, H §4 '필수', rules R-VAL-S03, plan §7).
 * GitHub 기본 스키마를 늘리지 않고 처음부터 좁게 쓴다. 여기 없는 태그는 벗겨지고(글자만 남음),
 * STRIP_TAGS는 내용째 지운다. class는 렌더러가 만드는 값만 허용하고, id·style·on*·data-* 는 전부 버린다.
 * (헤딩 id·표 래퍼·외부 링크 rel/target·용어 풀이 span은 sanitize **뒤에** 렌더러가 고정 값으로 붙인다.)
 */
import type { Schema } from 'hast-util-sanitize';

export const ALLOWED_TAGS = [
	'h2',
	'h3',
	'h4',
	'p',
	'ul',
	'ol',
	'li',
	'strong',
	'em',
	'del',
	'blockquote',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
	'code',
	'pre',
	'a',
	'hr',
	'br',
	'img',
	'figure',
	'figcaption',
	'span',
	'details',
	'summary',
	'div',
	'b'
] as const;

/** 내용째 지우는 태그(벗기면 스크립트·스타일 본문이 글자로 남는 것들) */
export const STRIP_TAGS = [
	'script',
	'style',
	'iframe',
	'frame',
	'frameset',
	'object',
	'embed',
	'applet',
	'noscript',
	'noembed',
	'template',
	'textarea',
	'title',
	'xmp',
	'plaintext',
	'svg',
	'math',
	'form',
	'select',
	'button',
	'input',
	'link',
	'meta',
	'base'
];

/** 링크·이미지에 허용하는 프로토콜. 상대 경로·#앵커는 프로토콜이 없어 그대로 통과한다. */
export const LINK_PROTOCOLS = ['http', 'https', 'mailto'];
export const IMAGE_PROTOCOLS = ['https'];

export const reportSchema: Schema = {
	tagNames: [...ALLOWED_TAGS],
	strip: STRIP_TAGS,
	allowComments: false,
	allowDoctypes: false,
	// id/name 을 받지 않으므로 clobber 접두사는 의미가 없지만, 혹시 들어오면 접두사를 붙여 전역 이름을 덮지 못하게 한다.
	clobber: ['id', 'name'],
	clobberPrefix: 'x-',
	attributes: {
		a: ['href', 'title'],
		img: ['src', 'alt', 'title'],
		th: [['align', 'left', 'center', 'right']],
		td: [['align', 'left', 'center', 'right']],
		ol: ['start'],
		code: [['className', /^language-[a-z0-9-]+$/]],
		div: [['className', 'callout', 'warn', 'err', 'info', 'callout-body', 'h1-marker']],
		b: [['className', 'ic']],
		details: [['className', 'details']],
		'*': []
	},
	protocols: {
		href: LINK_PROTOCOLS,
		src: IMAGE_PROTOCOLS
	},
	required: {},
	ancestors: {
		thead: ['table'],
		tbody: ['table'],
		tr: ['table'],
		th: ['table'],
		td: ['table'],
		li: ['ul', 'ol'],
		summary: ['details'],
		figcaption: ['figure']
	}
};
