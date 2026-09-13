import { createApp } from 'vue'
import App from './App.vue'
import { installLibraries } from './libraries'
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

// 2. Every v-* package must have loaded a usable directive (and its documented
//    plugin). Registered app-wide, so demo templates read exactly like an app
//    that installed the plugins in `main.ts`.
try {
  installLibraries(app)
} catch (err) {
  fatal(err)
}

app.mount('#app')
