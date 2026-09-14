import { createApp } from 'vue'
import App from './App.vue'
import { cardIndex } from './registry'
import { compileDocSample } from './doc-sample'
import type { LibraryFailure } from './libraries'
import { describeLibraryFailures, installLibraries } from './libraries'
import { assertCompilerMatchesRuntime, versions } from './sfc/versions'
import './styles.css'

// Readable from a harness, so "the versions match" is something a test can
// assert rather than something a human has to remember to check. On the
// document element as well as on `window`, because `smoke` only ever sees a
// `--dump-dom` snapshot and has no way to evaluate script.
window.__PLAYGROUND_VERSIONS__ = versions
document.documentElement.dataset.playgroundCompiler = versions.compiler
document.documentElement.dataset.playgroundRuntime = versions.runtime

/**
 * `scripts/docs.mjs` compiles every fenced code block in every package README
 * through this, from inside the running page — so the samples go through the
 * playground's own compiler, its own aliased packages (source or `dist`), and a
 * real `window`. `tickets/DOCS-3`. It never executes a sample; see
 * `src/doc-sample.ts`.
 */
window.__PLAYGROUND_DOC_SAMPLE__ = compileDocSample

/**
 * Every card deep link this build answers to (`tickets/DOCS-4`).
 *
 * Published before the app mounts, and derived from the same registry that
 * resolves the hash, so `scripts/docs/links.mjs` can check a README's card
 * links and `scripts/deeplinks.mjs` can drive all of them without either one
 * re-deriving the slug rule from the filenames. A published README link is only
 * as good as the agreement between the writer and the router; this is that
 * agreement, readable from outside.
 */
window.__PLAYGROUND_CARDS__ = cardIndex

/**
 * Boot failures are fatal and visible.
 *
 * Both of tonight's P0s (PG-14, PG-15) were infrastructure that degraded
 * quietly: a compiler a minor version behind the runtime, and a dist alias that
 * fell back to source. Everything downstream stayed green. So the two things
 * this app cannot function without are asserted here, before anything mounts,
 * and a failure paints the reason over the whole page instead of leaving a
 * blank one with a line in the console.
 */
function fatal(err: unknown): never {
  const pre = document.createElement('pre')
  pre.className = 'pg-fatal'
  pre.textContent = err instanceof Error ? err.message : String(err)
  document.querySelector('#app')?.replaceChildren(pre)
  throw err
}

// 1. The in-browser SFC compiler must be the same Vue as the runtime. If it is
//    not, codegen diverges and a directive inside a `v-for` silently stops
//    receiving `updated` — nothing verified here would count.
try {
  assertCompilerMatchesRuntime()
} catch (err) {
  fatal(err)
}

const app = createApp(App)

/**
 * 2. Every v-* package must have loaded a usable directive (and its documented
 *    plugin). Registered app-wide, so demo templates read exactly like an app
 *    that installed the plugins in `main.ts`.
 *
 * PG-22: a package that fails is no longer fatal for the other nine. Each is
 * loaded through its own `import()` in `src/libraries.ts`, and a failure comes
 * back as data instead of an exception — rendered as an error card on that
 * library's tab, painted as a banner on every tab, stamped on `<html>` and
 * published on `window`, so `smoke`, `interactions` and `geometry` all fail the
 * run by name. Scoped, not softened: nothing about this makes a broken build
 * survivable.
 *
 * An async IIFE rather than top-level `await`: `vite build` targets whatever
 * `build.target` says, and a boot file that only works in dev is its own
 * PG-14.
 */
void (async () => {
  let failures: LibraryFailure[]
  try {
    failures = await installLibraries(app)
  } catch (err) {
    // Not a library failing — `installLibraries` catches those one at a time.
    // This is the loader itself breaking, which really is fatal.
    fatal(err)
  }

  window.__PLAYGROUND_LIBRARY_FAILURES__ = failures
  document.documentElement.dataset.playgroundLibraryFailures = String(failures.length)
  if (failures.length) console.error(describeLibraryFailures(failures))

  app.mount('#app')

  /**
   * One marker, written once, and only after the app is on screen.
   *
   * The two facts a harness needs used to be published separately:
   * `__PLAYGROUND_VERSIONS__` at module scope, which is synchronous, and the
   * library-failure list, which is not — it lands after ten dynamic `import()`s
   * settle. A guard that read them in the same breath raced, saw the second one
   * missing on a cold module graph, and aborted the run with a message that read
   * like "a package failed". That is precisely the confusion PG-14/15/18/21/22
   * are about: two unrelated causes producing one indistinguishable message.
   *
   * `__PLAYGROUND_BOOT__` cannot be half-there. Absent means boot has not
   * finished — a retryable condition, and every runner says so in those words.
   * Present means it has, and `libraryFailures` is then the whole answer.
   */
  window.__PLAYGROUND_BOOT__ = {
    versions,
    target: __PLAYGROUND_TARGET__,
    libraryFailures: failures,
  }
  document.documentElement.dataset.playgroundBoot = 'complete'
})()
