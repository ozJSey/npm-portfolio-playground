import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * npm specifier → where that package lives on disk.
 *
 *   dir    the sibling folder, which is also the playground tab id
 *   entry  the source entry, relative to `dir`
 *   dist   the built entry, when it is not `dist/<entry with .min.js>`
 *
 * `dist` exists because not every package puts its entry at the top level:
 * `bigdecimal-string` is `src/index.ts` → `dist/index.min.js`, and deriving
 * one from the other would ask for `dist/src/index.min.js`.
 */
interface LibraryLocation {
  dir: string
  entry: string
  dist?: string
}

const LIBRARIES: Record<string, LibraryLocation> = {
  // Not a directive and not even Vue — a plain TypeScript class. It is aliased
  // exactly like the others so its tab compiles the local source, and it has no
  // entry in `src/libraries.ts` INSTALLS because there is nothing to register.
  '@ozjsey/bigdecimal-string': {
    dir: 'bigdecimal-string',
    entry: 'src/index.ts',
    dist: 'dist/index.min.mjs',
  },
  '@ozjsey/v-copy': { dir: 'v-copy', entry: 'vCopy.ts' },
  '@ozjsey/v-dropzone': { dir: 'v-dropzone', entry: 'vDropzone.ts' },
  '@ozjsey/v-fit-children': { dir: 'v-fit-children', entry: 'vFitChildren.ts' },
  '@ozjsey/v-keyboard-navigation': { dir: 'v-keyboard-navigation', entry: 'vKeyboardNavigation.ts' },
  '@ozjsey/v-observe': { dir: 'v-observe', entry: 'vObserve.ts' },
  '@ozjsey/v-scroll-into-view': { dir: 'v-scroll-into-view', entry: 'vScrollIntoView.ts' },
  '@ozjsey/v-select-text': { dir: 'v-select-text', entry: 'vSelectText.ts' },
  '@ozjsey/v-teleport-to': { dir: 'v-teleport-to', entry: 'vTeleportTo.ts' },
  // Composable, not a directive — the alias mechanism does not care, but
  // `src/libraries.ts` does: it has no entry in INSTALLS. See the note there.
  '@ozjsey/vue-write-behind': { dir: 'vue-write-behind', entry: 'vueWriteBehind.ts' },
  // No tab of its own yet (WBC-5). It is aliased because `@ozjsey/vue-write-behind`
  // is a thin adapter over it and imports it by bare specifier: without this the
  // write-behind tab would fail to resolve the engine.
  '@ozjsey/write-behind': { dir: 'write-behind', entry: 'writeBehind.ts' },
}

const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'src'
const entryFor = (library: LibraryLocation) =>
  TARGET === 'dist'
    ? (library.dist ?? `dist/${library.entry.replace('.ts', '.min.js')}`)
    : library.entry
/**
 * `PLAYGROUND_UNALIAS=v-teleport-to,v-observe` — resolve those to the installed
 * npm package instead of the sibling source.
 *
 * Added as a workaround when `src/libraries.ts` imported every library at module
 * scope, so **one package whose source did not parse took the whole app down**,
 * every tab with it. That part is fixed: since PG-22 each library loads through
 * its own `import()` and a broken one renders an error card on its own tab while
 * the other nine keep working.
 *
 * This stays, because it answers the case the isolation does not: when the
 * package you need to verify *is* the broken one, or when a sibling is being
 * rewritten right now and you want the last published build under your tab
 * instead of a moving target. Several agents edit sibling packages here at once,
 * so that is routine rather than exceptional. Name the package, verify yours,
 * and leave its source exactly as you found it.
 *
 * It is deliberately not the default. A tab silently reading the last published
 * build instead of the working tree is precisely the rot the source aliases
 * exist to prevent, so it has to be asked for by name, per run — and the server
 * logs which packages it applied to, so a run can never be quietly reading one.
 */
const UNALIASED = new Set(
  (process.env.PLAYGROUND_UNALIAS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
)
const LIBRARY_ALIASES = Object.entries(LIBRARIES)
  .filter(
    ([, library]) =>
      !process.env.GITHUB_ACTIONS &&
      !UNALIASED.has(library.dir) &&
      existsSync(pkg(`../${library.dir}`)),
  )
  .map(([specifier, library]) => ({
  find: new RegExp(`^${specifier.replace('/', '\\/')}$`),
  replacement: pkg(`../${library.dir}/${entryFor(library)}`),
  }))
if (UNALIASED.size) {
  console.log(`[playground] resolving from node_modules, not source: ${[...UNALIASED].join(', ')}`)
}

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
      // @ozjsey/bigdecimal-string@1.1.0 was published without an `import`
      // condition; point Vite at its published ESM file until the next patch.
      ...(process.env.GITHUB_ACTIONS
        ? [{ find: /^@ozjsey\/bigdecimal-string$/, replacement: pkg('./node_modules/@ozjsey/bigdecimal-string/dist/index.min.js') }]
        : []),
      ...LIBRARY_ALIASES,
    ],
    dedupe: ['vue', ...CODEMIRROR_FAMILY],
  },
  optimizeDeps: {
    exclude: Object.keys(LIBRARIES),
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
