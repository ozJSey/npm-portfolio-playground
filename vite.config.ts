import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const LIBRARIES = {
  '@ozjsey/v-copy': { dir: 'v-copy', entry: 'vCopy.ts' },
  '@ozjsey/v-dropzone': { dir: 'v-dropzone', entry: 'vDropzone.ts' },
  '@ozjsey/v-fit-children': { dir: 'v-fit-children', entry: 'vFitChildren.ts' },
  '@ozjsey/v-keyboard-navigation': { dir: 'v-keyboard-navigation', entry: 'vKeyboardNavigation.ts' },
  '@ozjsey/v-observe': { dir: 'v-observe', entry: 'vObserve.ts' },
  '@ozjsey/v-scroll-into-view': { dir: 'v-scroll-into-view', entry: 'vScrollIntoView.ts' },
  '@ozjsey/v-select-text': { dir: 'v-select-text', entry: 'vSelectText.ts' },
  '@ozjsey/v-teleport-to': { dir: 'v-teleport-to', entry: 'vTeleportTo.ts' },
} as const

const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'src'

/**
 * Upload endpoints for the `v-dropzone` tab. XHR progress events only fire
 * against a real HTTP endpoint, so the dev server grows three: one that
 * succeeds slowly (progress stays visible), one that 500s, one that hangs
 * long enough to cancel.
 */
function uploadMockPlugin(): Plugin {
  const drain = (req: import('node:http').IncomingMessage) =>
    new Promise<number>((resolve) => {
      let bytes = 0
      req.on('data', (c: Buffer) => (bytes += c.length))
      req.on('end', () => resolve(bytes))
    })

  return {
    name: 'playground-upload-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (!url.startsWith('/api/upload')) return next()

        const bytes = await drain(req)
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

        if (url === '/api/upload-fail') {
          await wait(400)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Simulated server failure' }))
          return
        }

        if (url === '/api/upload-slow') await wait(4000)
        else await wait(700)

        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: true, bytes, id: `file_${bytes.toString(36)}`, at: Date.now() }))
      })
    },
  }
}

/**
 * The whole CodeMirror family must resolve to ONE copy each — a second
 * instance of @codemirror/state breaks the `instanceof` checks inside the
 * extension resolver ("Unrecognized extension value in extension set").
 * Deduped at resolution AND prebundled together in a single optimizer pass so
 * a late-discovered entry can never pull in its own copy.
 */
const CODEMIRROR_FAMILY = [
  'codemirror',
  '@codemirror/state',
  '@codemirror/view',
  '@codemirror/language',
  '@codemirror/commands',
  '@codemirror/autocomplete',
  '@codemirror/search',
  '@codemirror/lint',
  '@codemirror/lang-vue',
  '@codemirror/theme-one-dark',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
]

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/npm-portfolio-playground/' : '/',
  plugins: [vue(), uploadMockPlugin()],
  define: {
    __PLAYGROUND_TARGET__: JSON.stringify(TARGET),
  },
  resolve: {
    alias: [
      // Exact match only — a string alias would also rewrite `vue/compiler-sfc`.
      { find: /^vue$/, replacement: pkg('./node_modules/vue/dist/vue.runtime.esm-bundler.js') },
      { find: '@', replacement: pkg('./src') },
    ],
    dedupe: ['vue', ...CODEMIRROR_FAMILY],
  },
  optimizeDeps: {
    exclude: [...LIBRARIES],
    // `vue/compiler-sfc` (1.7 MB) and `sucrase` are the in-browser SFC compiler.
    // Prebundled up front rather than discovered on the first edit: a
    // mid-session re-optimize forces a full page reload, which would land in
    // the middle of a smoke or interaction run.
    include: [...CODEMIRROR_FAMILY, 'vue/compiler-sfc', 'sucrase'],
  },
  server: {
    fs: { allow: ['.'] },
  },
})
