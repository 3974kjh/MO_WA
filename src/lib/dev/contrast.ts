/** WCAG 대비비 계산(/dev/components 색 절에서 현재 테마 토큰으로 실시간 계산) */
function channel(c: number) {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseColor(input: string): [number, number, number] | null {
	const v = input.trim();
	const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
		return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
	}
	const rgb = v.match(/rgba?\(([^)]+)\)/);
	if (rgb) {
		const p = rgb[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.slice(0, 3)
			.map(Number);
		if (p.length === 3 && p.every((n) => !Number.isNaN(n))) return p as [number, number, number];
	}
	return null;
}

export function contrastRatio(fg: string, bg: string): number | null {
	const a = parseColor(fg);
	const b = parseColor(bg);
	if (!a || !b) return null;
	const L = (c: [number, number, number]) =>
		0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
	const [l1, l2] = [L(a), L(b)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}
