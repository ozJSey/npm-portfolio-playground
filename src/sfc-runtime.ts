/**
 * In-browser Single File Component compiler — thin entry.
 *
 * Every demo in this playground is a real `.vue` file on disk. It is imported
 * as raw text (what you see and edit) and fed through here, so the running page
 * reflects the text you just typed. `<script setup>`, `<style scoped>` and
 * imports of the v-* packages all behave exactly as they would in a normal Vite
 * app — because the pieces doing the work are the same ones Vite uses:
 * `vue/compiler-sfc`, at the version `vue` itself pins.
 *
 *   sfc/versions.ts     the boot assertion that compiler and runtime agree
 *   sfc/compile.ts      descriptor → function body + scoped styles
 *   sfc/esm-runtime.ts  import rewriting and evaluation
 *
 * Read `sfc/versions.ts` first if you are wondering why this is not
 * `vue3-sfc-loader` any more.
 */
import type { Component } from 'vue'
import { compileSfcToFunctionBody } from './sfc/compile'
import { runFunctionBody } from './sfc/esm-runtime'
import { assertCompilerMatchesRuntime } from './sfc/versions'

export type CompileResult =
  | { ok: true; component: Component; warnings: string[] }
  | { ok: false; error: string; warnings: string[] }

/** Style elements injected by a given compile, keyed by the handle we return. */
const styleOwners = new WeakMap<object, HTMLStyleElement[]>()

/** A token the caller keeps so its styles can be dropped on the next compile. */
export type StyleHandle = object

export function createStyleHandle(): StyleHandle {
  return {}
}

export function releaseStyles(handle: StyleHandle): void {
  for (const el of styleOwners.get(handle) ?? []) el.remove()
  styleOwners.delete(handle)
}

let compileCounter = 0

/**
 * Compiles SFC source text into a mountable component.
 *
 * @param source   the full `.vue` file text
 * @param demoId   stable id — used for compile errors and style ownership
 * @param handle   style ownership token; pass the same one across recompiles
 */
export async function compileSfc(
  source: string,
  demoId: string,
  handle: StyleHandle,
): Promise<CompileResult> {
  // Cheap, and the one thing that must never be skipped: a compiler that does
  // not match the runtime produces demos whose directives silently stop
  // updating. See sfc/versions.ts.
  assertCompilerMatchesRuntime()

  // A fresh filename per compile keeps `<style scoped>` scope-ids unique, so an
  // edited demo never inherits the previous revision's scoped rules.
  const filename = `/${demoId}.${++compileCounter}.vue`
  const injected: HTMLStyleElement[] = []

  try {
    const { body, styles, warnings } = compileSfcToFunctionBody(source, filename)

    for (const css of styles) {
      const el = document.createElement('style')
      el.textContent = css
      el.dataset.playgroundDemo = demoId
      document.head.appendChild(el)
      injected.push(el)
    }

    const component = runFunctionBody(body, demoId) as Component

    releaseStyles(handle)
    styleOwners.set(handle, injected)
    return { ok: true, component, warnings }
  } catch (err) {
    for (const el of injected) el.remove()
    return { ok: false, error: err instanceof Error ? err.message : String(err), warnings: [] }
  }
}
