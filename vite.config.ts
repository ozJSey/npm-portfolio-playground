import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * The library table.
 *
 * Two names per library, and they are NOT the same thing:
 *
 *   `dir`        the folder on disk. The source of truth for resolution.
 *   the key      the specifier a demo imports — the package's npm name, which
 *                for a scoped package is `@ozjsey/…` and never matches `dir`.
 *
 * PG-15: `distEntry()` used to read `../<specifier>/package.json`, so
 * `@ozjsey/v-fit-children` resolved to `../@ozjsey/v-fit-children/package.json`,
 * which does not exist — and the lookup failed *silently* back to source. The
 * one published package in this portfolio was therefore never covered by
 * `smoke:dist` or `interactions:dist`. Keeping the two columns apart is what
 * stops that returning as more packages move under the scope.
 */
const LIBRARIES = {
  '@ozjsey/v-copy': { dir: 'v-copy', entry: 'vCopy.ts' },
  'v-dropzone': { dir: 'v-dropzone', entry: 'vDropzone.ts' },
  '@ozjsey/v-fit-children': { dir: 'v-fit-children', entry: 'vFitChildren.ts' },
  'v-keyboard-navigation': { dir: 'v-keyboard-navigation', entry: 'vKeyboardNavigation.ts' },
  'v-observe': { dir: 'v-observe', entry: 'vObserve.ts' },
  'v-scroll-into-view': { dir: 'v-scroll-into-view', entry: 'vScrollIntoView.ts' },
  'v-select-text': { dir: 'v-select-text', entry: 'vSelectText.ts' },
  'v-teleport-to': { dir: 'v-teleport-to', entry: 'vTeleportTo.ts' },
} as const

/**
 * Bare-specifier → source-file map.
 *
 * By default every library is aliased to its TypeScript SOURCE, not `dist/`.
 * Editing `../v-copy/vCopy.ts` hot-reloads the playground — no build step, no
 * stale bundle, and the playground doubles as a smoke test of the real source.
 */
export const LIBRARY_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(LIBRARIES).map(([specifier, { dir, entry }]) => {
    const abs = pkg(`../${dir}/${entry}`)
    // Same rule as dist mode: a table entry that does not resolve is a mistake
    // to report here, by name, not a module-not-found three imports deep.
    if (!existsSync(abs)) {
      throw new Error(`[playground] ${specifier}: source entry ${abs} is not on disk.`)
    }
    return [specifier, abs]
  }),
)

/**
 * `PLAYGROUND_TARGET=dist` (scripts: `dev:dist`, `smoke:dist`) switches every
 * alias to the package's BUILT entry — whatever its package.json `module` /
 * `main` points at — i.e. the consumer's view. `v-copy-test` proves the
 * packed-tarball path for one package; this flag does the same for all of them
 * at once, and immediately exposes a stale `dist/`.
 *
 * It throws. There is no fallback to source: a dist run that quietly tests
 * source is worse than no dist run, because it reports green. `CLAUDE.md`
 * records `dist/` going stale silently three times — this gate is the answer to
 * that, and it only works if it can fail.
 */
const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'src'

function distEntry(specifier: string, dir: string): string {
  const where = `${specifier} (../${dir})`
  const manifestPath = pkg(`../${dir}/package.json`)

  if (!existsSync(manifestPath)) {
    throw new Error(
      `[playground] PLAYGROUND_TARGET=dist: ${where} has no package.json at ${manifestPath}.`,
    )
  }

  let manifest: { module?: string; main?: string }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as typeof manifest
  } catch (err) {
    throw new Error(
      `[playground] PLAYGROUND_TARGET=dist: ${where} has an unreadable package.json — ` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const rel = manifest.module ?? manifest.main
  if (!rel) {
    throw new Error(
      `[playground] PLAYGROUND_TARGET=dist: ${where} declares neither \`module\` nor \`main\`, ` +
        `so there is no built entry to test.`,
    )
  }

  const abs = pkg(`../${dir}/${rel}`)
  if (!existsSync(abs)) {
    throw new Error(
      `[playground] PLAYGROUND_TARGET=dist: ${where} points at "${rel}", which is not on disk ` +
        `(${abs}). Run \`npm run build\` in ${dir}/ — the dist gate will not fall back to source.`,
    )
  }
  return abs
}

const LIBRARY_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(LIBRARIES).map(([specifier, { dir }]) => [
    specifier,
    TARGET === 'dist' ? distEntry(specifier, dir) : LIBRARY_SOURCES[specifier],
  ]),
)

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
  plugins: [vue(), uploadMockPlugin()],
  define: {
    __PLAYGROUND_TARGET__: JSON.stringify(TARGET),
  },
  resolve: {
    alias: [
      // Exact match only — a string alias would also rewrite `vue/compiler-sfc`.
      { find: /^vue$/, replacement: pkg('./node_modules/vue/dist/vue.runtime.esm-bundler.js') },
      ...Object.entries(LIBRARY_ALIASES).map(([find, replacement]) => ({
        find: new RegExp(`^${find}$`),
        replacement,
      })),
      { find: '@', replacement: pkg('./src') },
    ],
    // The sibling packages each carry their own node_modules/vue. Without this
    // they'd each get a private Vue instance and reactivity would break.
    dedupe: ['vue', ...CODEMIRROR_FAMILY],
  },
  optimizeDeps: {
    exclude: Object.keys(LIBRARY_SOURCES),
    // `vue/compiler-sfc` (1.7 MB) and `sucrase` are the in-browser SFC compiler.
    // Prebundled up front rather than discovered on the first edit: a
    // mid-session re-optimize forces a full page reload, which would land in
    // the middle of a smoke or interaction run.
    include: [...CODEMIRROR_FAMILY, 'vue/compiler-sfc', 'sucrase'],
  },
  server: {
    // Library sources live one level up from the playground root.
    fs: { allow: ['..'] },
  },
})
