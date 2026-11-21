import { describe, expect, it } from 'vitest';
import { DARK_VARIANT_RE } from '../../../eslint-rules/no-dark-variant.js';

// 테스트 문자열 자체가 검사에 걸리지 않도록 변형 이름을 조립한다.
const D = 'dark' + ':';
const hit = (s: string) => [...s.matchAll(DARK_VARIANT_RE)].length > 0;

describe('G-14 dark: 변형 검사 정규식', () => {
	it('Tailwind dark: 변형을 잡는다', () => {
		expect(hit(`class="bg-surface ${D}bg-black"`)).toBe(true);
		expect(hit(`class="${D}hover:text-text"`)).toBe(true);
		expect(hit(`cls = 'p-2 ${D}[color:red]'`)).toBe(true);
		expect(hit(`@apply ${D}text-muted;`)).toBe(true);
	});
	it('객체 키·속성 선택자·custom-variant 선언은 잡지 않는다', () => {
		expect(hit("{ dark: 'system' }")).toBe(false);
		expect(hit("{system:'light',light:'dark',dark:'system'}")).toBe(false);
		expect(hit(':root[data-theme="dark"] {')).toBe(false);
		expect(hit('@custom-variant dark (&:where([data-theme="dark"]));')).toBe(false);
		expect(hit('data-dark:foo')).toBe(false);
	});
});
