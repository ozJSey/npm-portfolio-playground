/// <reference types="vite/client" />

/** Injected by vite.config.ts `define` — which alias target the server runs. */
declare const __PLAYGROUND_TARGET__: 'src' | 'dist'
/**
 * Injected by vite.config.ts `define` — where the libraries on this page came
 * from, in words fit to print. `__PLAYGROUND_TARGET__` answers a narrower
 * question (which sibling entry an alias points at) and says nothing about
 * whether any alias was installed, which is how the deployed site spent its
 * life claiming to run sources it had never seen. See DOCS-6.
 */
declare const __PLAYGROUND_ORIGIN__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  /**
   * Set by `src/main.ts` before the app mounts. `smoke` asserts on it: the
   * in-browser SFC compiler and the Vue runtime must be one version (PG-14).
   */
  __PLAYGROUND_VERSIONS__: import('./sfc/versions').CompilerRuntimeVersions
  /**
   * Set by `src/main.ts`. The documentation gate (`scripts/docs.mjs`) calls it
   * once per fenced block in every package README — see `tickets/DOCS-3`.
   */
  __PLAYGROUND_DOC_SAMPLE__: typeof import('./doc-sample').compileDocSample
  /**
   * Set by `src/main.ts` after the libraries load. One entry per package that
   * did not load a usable public API (PG-22). Every harness script fails the
   * run when this is non-empty, and names the packages; `<html
   * data-playground-library-failures>` carries the count for `--dump-dom`.
   */
  __PLAYGROUND_LIBRARY_FAILURES__: import('./libraries').LibraryFailure[]
  /**
   * Set by `src/main.ts` AFTER the app has mounted — the one thing a harness
   * should wait on. Absent means boot has not finished (retryable); present
   * means it has, and `libraryFailures` is the verdict. The separate stamps
   * above are kept because they are readable from a `--dump-dom` snapshot,
   * which cannot evaluate script.
   */
  __PLAYGROUND_BOOT__: {
    versions: import('./sfc/versions').CompilerRuntimeVersions
    target: 'src' | 'dist'
    libraryFailures: import('./libraries').LibraryFailure[]
  }
  /**
   * Set by `src/main.ts`. Tab id → the card deep-link ids that tab answers to
   * (DOCS-4). `scripts/docs/links.mjs` validates every README card link against
   * this, and `scripts/deeplinks.mjs` drives every entry in it, so neither owns
   * a second copy of the slug rule.
   */
  __PLAYGROUND_CARDS__: Record<string, import('./registry').CardIndexEntry[]>
}
