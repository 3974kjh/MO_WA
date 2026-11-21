// G-14: ESLint가 보지 않는 CSS 파일까지 `dark:` 변형 사용을 검사한다. `pnpm lint`에서 실행.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DARK_VARIANT_RE } from '../eslint-rules/no-dark-variant.js';

const root = new URL('..', import.meta.url).pathname;
const exts = ['.css', '.svelte', '.ts', '.js', '.html'];
const hits = [];

function walk(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p);
		else if (exts.some((e) => p.endsWith(e))) {
			const lines = readFileSync(p, 'utf8').split('\n');
			lines.forEach((line, i) => {
				if (line.match(DARK_VARIANT_RE)) hits.push(`${relative(root, p)}:${i + 1}: ${line.trim()}`);
			});
		}
	}
}
walk(join(root, 'src'));

if (hits.length) {
	console.error(
		'G-14 위반: `dark:` 유틸리티는 금지입니다. 디자인 토큰만 쓰세요.\n' + hits.join('\n')
	);
	process.exit(1);
}
console.log('G-14 OK: dark: 변형 사용 없음');
