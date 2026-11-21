import type { Snippet } from 'svelte';

export type BadgeTone = 'default' | 'up' | 'down' | 'warn' | 'info' | 'ok' | 'accent';
export type CardTone = 'default' | 'accent' | 'warn';
export type BannerTone = 'info' | 'warn' | 'err';
export type SheetVariant = 'bottom' | 'full' | 'center';

/** DataTable 열 정의 (H §3: Col = {key, label, align?, render?, hideOnMobile?}) */
export interface Col<T> {
	key: string;
	label: string;
	align?: 'left' | 'right' | 'center';
	/** 셀 렌더. 없으면 row[key]를 문자열로 */
	render?: Snippet<[T]>;
	/** 모바일 카드형에서 숨김 */
	hideOnMobile?: boolean;
	/** 모바일 카드형에서 제목 줄로 쓰는 열(라벨 없이 크게) */
	title?: boolean;
	/** 숫자 열(tabular-nums) — align 'right'면 자동 */
	num?: boolean;
}
