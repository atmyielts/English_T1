import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../../workers/proctor-live/src/index.ts',import.meta.url))],bundle:true,platform:'browser',format:'esm',target:'es2022',external:['cloudflare:workers'],outfile:fileURLToPath(new URL('../../workers/proctor-live/dist/index.js',import.meta.url))});
