import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';
import mowa from './eslint-rules/no-dark-variant.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

const adminImportMessage =
	'Import createSupabaseAdminClient only from src/lib/server/repo/** or src/lib/server/mcp/auth.ts (R-SYS-01).';

const repoClientMessage =
	'Import repo APIs from $lib/server/repo (index), not repo/client, repo/db, or botIdentityBrand (M-4).';

const brandMessage =
	'Mint BotRepoIdentity only inside src/lib/server/mcp/auth.ts after mcp_authenticate (BE-04). Do not re-export mint.';

const dynamicImportBanMessage =
	'Dynamic imports with interpolated templates or string concatenation are blocked for admin/repo bypass paths (L6).';

const testingImportMessage = 'mcp/testing.ts is test/dev only — do not import from production code';

/** Shared testing-ban paths (BE-05 Low / M-4) — spread into global, supabase, and lifted overrides. */
const testingImportPaths = [
	{
		name: './testing',
		message: testingImportMessage
	},
	{
		name: '../testing',
		message: testingImportMessage
	},
	{
		name: '../mcp/testing',
		message: testingImportMessage
	},
	{
		name: '$lib/server/mcp/testing',
		message: testingImportMessage
	}
];

/** Shared testing-ban patterns. */
const testingImportPatterns = [
	{
		group: [
			'**/mcp/testing',
			'**/mcp/testing.js',
			'**/mcp/testing.ts',
			'**/server/mcp/testing',
			'**/server/mcp/testing.js',
			'**/server/mcp/testing.ts',
			'$lib/server/mcp/testing',
			'$lib/server/mcp/testing.js',
			'$lib/server/mcp/testing.ts'
		],
		message: testingImportMessage
	}
];

/** Shared testing-ban syntax (re-export + dynamic import). */
const testingRestrictedSyntax = [
	{
		selector:
			"ExportAllDeclaration[source.value='./testing'], ExportAllDeclaration[source.value='./testing.ts'], ExportAllDeclaration[source.value='./testing.js']",
		message: 'Do not re-export mcp/testing.ts from production barrels'
	},
	{
		selector:
			"ExportNamedDeclaration[source.value='./testing'], ExportNamedDeclaration[source.value='./testing.ts'], ExportNamedDeclaration[source.value='./testing.js']",
		message: 'Do not re-export mcp/testing.ts from production barrels'
	},
	{
		selector: 'ImportExpression[source.value=/mcp\\/testing|\\/testing(\\.ts|\\.js)?$/]',
		message: 'Do not dynamically import mcp/testing.ts from production code'
	}
];

/** Shared no-restricted-imports paths — spread into overrides so they are not dropped. */
const restrictedImportPaths = [
	{
		name: '$lib/supabase/admin',
		message: adminImportMessage
	},
	{
		name: '$lib/server/repo/client',
		message: repoClientMessage
	},
	{
		name: '$lib/server/repo/db',
		message: repoClientMessage
	},
	{
		name: '$lib/server/repo/botIdentityBrand',
		message: brandMessage
	},
	...testingImportPaths
];

/** Shared no-restricted-imports patterns — spread into overrides so they are not dropped. */
const restrictedImportPatterns = [
	{
		group: ['**/supabase/admin', '**/supabase/admin.*', '**/supabase/admin.ts'],
		message: adminImportMessage
	},
	{
		group: [
			'**/server/repo/client',
			'**/server/repo/client.*',
			'**/repo/client',
			'**/repo/client.*',
			'**/server/repo/db',
			'**/server/repo/db.*',
			'**/repo/db',
			'**/repo/db.*'
		],
		message: repoClientMessage
	},
	{
		group: [
			'**/server/repo/botIdentityBrand',
			'**/server/repo/botIdentityBrand.*',
			'**/repo/botIdentityBrand',
			'**/repo/botIdentityBrand.*'
		],
		message: brandMessage
	},
	...testingImportPatterns
];

/** L6 dynamic-import blocks (global + preserved under supabase/**) + testing ban. */
const dynamicImportRestrictedSyntax = [
	{
		selector:
			'ImportExpression[source.type=Literal][source.value=/supabase\\/admin|\\$lib\\/supabase\\/admin|\\.\\/admin(\\.ts)?$/]',
		message: adminImportMessage
	},
	{
		selector:
			'ImportExpression[source.type=TemplateLiteral][source.quasis.0.value.raw=/supabase\\/admin|\\$lib\\/supabase\\/admin|\\.\\/admin/]',
		message: adminImportMessage
	},
	{
		selector:
			'ImportExpression[source.type=Literal][source.value=/repo\\/(client|db|botIdentityBrand)|\\$lib\\/server\\/repo\\/(client|db|botIdentityBrand)/]',
		message: repoClientMessage
	},
	{
		selector:
			'ImportExpression[source.type=TemplateLiteral][source.quasis.0.value.raw=/repo\\/(client|db|botIdentityBrand)|\\$lib\\/server\\/repo\\/(client|db|botIdentityBrand)/]',
		message: repoClientMessage
	},
	// Interpolated templates + string concatenation — routes/supabase/anywhere
	{
		selector: 'ImportExpression[source.type=TemplateLiteral][source.expressions.length>0]',
		message: dynamicImportBanMessage
	},
	{
		selector: 'ImportExpression[source.type=BinaryExpression]',
		message: dynamicImportBanMessage
	},
	// Variable-only / .join() / .concat() / other non-literal sources
	{
		selector: 'ImportExpression:not([source.type=Literal]):not([source.type=TemplateLiteral])',
		message: dynamicImportBanMessage
	},
	...testingRestrictedSyntax
];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'no-undef': 'off',
			'no-restricted-imports': [
				'error',
				{
					paths: [...restrictedImportPaths],
					patterns: [...restrictedImportPatterns]
				}
			],
			'no-restricted-syntax': ['error', ...dynamicImportRestrictedSyntax]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// repo internals + mcp/auth.ts: lift admin/repo-client bans, keep testing ban.
		files: ['src/lib/server/repo/**/*.{js,ts}', 'src/lib/server/mcp/auth.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [...testingImportPaths],
					patterns: [...testingImportPatterns]
				}
			],
			'no-restricted-syntax': ['error', ...testingRestrictedSyntax]
		}
	},
	{
		// L6: supabase/ — keep global bans (incl. testing) + add static ./admin.
		files: ['src/lib/supabase/**/*.{js,ts}'],
		ignores: ['src/lib/supabase/admin.ts', 'src/lib/supabase/**/*.spec.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						...restrictedImportPaths,
						{ name: './admin', message: adminImportMessage },
						{ name: './admin.ts', message: adminImportMessage },
						{ name: './admin.js', message: adminImportMessage }
					],
					patterns: [
						...restrictedImportPatterns,
						{
							group: ['./**/admin', './admin', './admin.*'],
							message: adminImportMessage
						}
					]
				}
			],
			'no-restricted-syntax': [
				'error',
				...dynamicImportRestrictedSyntax,
				{
					selector: 'ImportDeclaration[source.value=/^\\.\\/?admin(\\.ts)?$/]',
					message: adminImportMessage
				}
			]
		}
	},
	{
		// Specs may dynamically import admin / restricted modules under test.
		files: ['**/*.{spec,test}.{js,ts}'],
		rules: {
			'no-restricted-imports': 'off',
			'no-restricted-syntax': 'off'
		}
	},
	{
		// G-14: Tailwind `dark:` 변형 금지(토큰만 사용). CSS 파일은 scripts/check-no-dark-variant.mjs가 검사한다.
		files: ['src/**/*.{svelte,ts,js}'],
		plugins: { mowa },
		rules: { 'mowa/no-dark-variant': 'error' }
	}
);
