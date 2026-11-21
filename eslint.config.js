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
			'no-undef': 'off'
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
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	},
	{
		// mcp/testing.ts is test/dev only — block production imports (BE-05 Low / M-4).
		files: ['src/**/*.{ts,js}'],
		ignores: [
			'src/**/*.{test,spec}.{ts,js}',
			'src/**/*.svelte.{test,spec}.{ts,js}',
			'src/lib/server/mcp/testing.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: './testing',
							message: 'mcp/testing.ts is test/dev only — do not import from production code'
						},
						{
							name: '../testing',
							message: 'mcp/testing.ts is test/dev only — do not import from production code'
						},
						{
							name: '../mcp/testing',
							message: 'mcp/testing.ts is test/dev only — do not import from production code'
						},
						{
							name: '$lib/server/mcp/testing',
							message: 'mcp/testing.ts is test/dev only — do not import from production code'
						}
					],
					patterns: [
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
							message:
								'mcp/testing.ts is test/dev only — do not import from production code'
						}
					]
				}
			],
			'no-restricted-syntax': [
				'error',
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
					selector:
						"ImportExpression[source.value=/mcp\\/testing|\\/testing(\\.ts|\\.js)?$/]",
					message: 'Do not dynamically import mcp/testing.ts from production code'
				}
			]
		}
	}
);
