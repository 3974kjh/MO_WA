import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

const adminImportMessage =
	'Import createSupabaseAdminClient only from src/lib/server/repo/** or src/lib/server/mcp/auth.ts (R-SYS-01).';

const repoClientMessage =
	'Import repo APIs from $lib/server/repo (index), not repo/client, repo/db, or botIdentityBrand (M-4).';

const brandMessage =
	'Mint BotRepoIdentity only inside src/lib/server/mcp/auth.ts after mcp_authenticate (BE-04). Do not re-export mint.';

const dynamicImportBanMessage =
	'Dynamic imports with interpolated templates or string concatenation are blocked for admin/repo bypass paths (L6).';

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
	}
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
	}
];

/** L6 dynamic-import blocks (global + preserved under supabase/**). */
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
	}
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
		// repo internals + mcp/auth.ts only (not other mcp/* files).
		files: ['src/lib/server/repo/**/*.{js,ts}', 'src/lib/server/mcp/auth.ts'],
		rules: {
			'no-restricted-imports': 'off',
			'no-restricted-syntax': 'off'
		}
	},
	{
		// L6: supabase/ — keep global bans + add static ./admin (do not drop globals).
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
					selector: "ImportDeclaration[source.value=/^\\.\\/?admin(\\.ts)?$/]",
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
	}
);
