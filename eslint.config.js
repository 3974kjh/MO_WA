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
	'Import repo APIs from $lib/server/repo (index), not repo/client or botIdentityBrand (M-4).';

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
					paths: [
						{
							name: '$lib/supabase/admin',
							message: adminImportMessage
						},
						{
							name: '$lib/server/repo/client',
							message: repoClientMessage
						},
						{
							name: '$lib/server/repo/botIdentityBrand',
							message:
								'Mint BotRepoIdentity only from $lib/server/mcp/auth (BE-04 brand gate).'
						}
					],
					patterns: [
						{
							group: [
								'**/supabase/admin',
								'**/supabase/admin.*',
								'**/supabase/admin.ts'
							],
							message: adminImportMessage
						},
						{
							group: [
								'**/server/repo/client',
								'**/server/repo/client.*',
								'**/repo/client',
								'**/repo/client.*'
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
							message:
								'Mint BotRepoIdentity only from $lib/server/mcp/auth (BE-04 brand gate).'
						}
					]
				}
			],
			// L6: block dynamic / template-literal admin & repo/client bypasses.
			'no-restricted-syntax': [
				'error',
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
						'ImportExpression[source.type=Literal][source.value=/repo\\/client|\\$lib\\/server\\/repo\\/client/]',
					message: repoClientMessage
				},
				{
					selector:
						'ImportExpression[source.type=TemplateLiteral][source.quasis.0.value.raw=/repo\\/client|\\$lib\\/server\\/repo\\/client/]',
					message: repoClientMessage
				}
			]
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
		// repo internals + mcp auth may import admin / brand helpers.
		files: [
			'src/lib/server/repo/**/*.{js,ts}',
			'src/lib/server/mcp/auth.ts',
			'src/lib/server/mcp/**/*.{js,ts}'
		],
		rules: {
			'no-restricted-imports': 'off',
			'no-restricted-syntax': 'off'
		}
	},
	{
		// L6: even inside supabase/, block relative ./admin dynamic imports from siblings.
		files: ['src/lib/supabase/**/*.{js,ts}'],
		ignores: ['src/lib/supabase/admin.ts', 'src/lib/supabase/**/*.spec.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						'ImportExpression[source.type=Literal][source.value=/^\\.\\/?admin(\\.ts)?$/]',
					message: adminImportMessage
				},
				{
					selector:
						'ImportExpression[source.type=TemplateLiteral][source.quasis.0.value.raw=/admin/]',
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
