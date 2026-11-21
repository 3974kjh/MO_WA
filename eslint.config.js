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
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// BE-03 / ADR-001: service-role admin only via repo (and mcp/auth).
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '$lib/supabase/admin',
							message:
								'Import createSupabaseAdminClient only from src/lib/server/repo/** or src/lib/server/mcp/auth.ts (R-SYS-01).'
						}
					],
					patterns: [
						{
							group: ['**/supabase/admin', '**/supabase/admin.*'],
							message:
								'Import createSupabaseAdminClient only from src/lib/server/repo/** or src/lib/server/mcp/auth.ts (R-SYS-01).'
						}
					]
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
		// Override: admin import allowed only in repo + mcp auth (design ADR-001).
		files: ['src/lib/server/repo/**/*.{js,ts}', 'src/lib/server/mcp/auth.ts'],
		rules: {
			'no-restricted-imports': 'off'
		}
	}
);
