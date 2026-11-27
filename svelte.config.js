import adapter from '@sveltejs/adapter-cloudflare';
import { installDevRouteOmit } from './scripts/prod-omit-dev-routes.mjs';

// CF_PAGES=1 only (Pages Git + `pnpm build`). No-op for dev/tests. See scripts/prod-omit-dev-routes.mjs.
installDevRouteOmit();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			platformProxy: {
				configPath: 'wrangler.jsonc'
			}
		})
	}
};

export default config;
