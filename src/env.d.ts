/// <reference types="vite/client" />

/** Injected by vite.config.ts `define` — which alias target the server runs. */
declare const __PLAYGROUND_TARGET__: 'src' | 'dist'

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
}
