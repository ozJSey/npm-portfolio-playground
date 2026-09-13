/**
 * PG-14 guard: the compiler that builds a demo must be the SAME Vue as the
 * runtime that mounts it.
 *
 * History. Until 2026-09-06 the playground compiled every demo with the
 * `@vue/compiler-sfc` **3.4.15** bundled inside `vue3-sfc-loader`, while the
 * app ran Vue **3.5.41**. The divergence was invisible in every gate we had —
 * `smoke`, `geometry`, `interactions` and `typecheck` were all green — and yet
 * it silently changed codegen:
 *
 *   3.4.15  _withDirectives(_createElementVNode("li", { key: n }, [...]), [...])
 *   3.5.41  _withDirectives((_openBlock(), _createElementBlock("li", { key: n }, [...])), [...])
 *
 * The 3.4.15 form is a plain vnode with patchFlag 0 inside a STABLE_FRAGMENT.
 * It is never collected into `dynamicChildren`, so it is never re-patched, so
 * **a directive inside a `v-for` never received `updated`** — and since every
 * directive in this portfolio is configured through its binding value, no
 * option change ever reached one. Three cards were dead because of the
 * playground rather than the library.
 *
 * The fix is structural: `sfc/compile.ts` compiles with `vue/compiler-sfc`,
 * which npm pins to the exact version of `vue` (`"@vue/compiler-sfc": "3.5.41"`
 * is a hard dependency of `vue@3.5.41`), so the two cannot drift.
 *
 * This module is the assertion that would have caught the original bug, kept
 * because "cannot drift" is a claim about a lockfile, not a law of physics.
 * It runs at boot, before the app mounts, and it throws.
 */
import { version as runtimeVersion } from 'vue'
import { version as compilerVersion } from 'vue/compiler-sfc'

export interface CompilerRuntimeVersions {
  /** `@vue/compiler-sfc` — what turns a demo's text into a render function. */
  compiler: string
  /** `vue` — what mounts and patches the result. */
  runtime: string
  matches: boolean
}

export const versions: CompilerRuntimeVersions = {
  compiler: compilerVersion,
  runtime: runtimeVersion,
  matches: compilerVersion === runtimeVersion,
}

export const VERSION_MISMATCH_MESSAGE =
  `Playground boot check failed: the SFC compiler and the Vue runtime are different versions.\n` +
  `  @vue/compiler-sfc  ${versions.compiler}\n` +
  `  vue (runtime)      ${versions.runtime}\n\n` +
  `Codegen differs between Vue minors — a directive inside a v-for compiles to a\n` +
  `non-block vnode under an older compiler and then never receives \`updated\`, so\n` +
  `option reactivity silently stops working (PG-14). Nothing verified through this\n` +
  `playground counts until the two match.\n\n` +
  `Fix: reinstall so \`vue\` and \`@vue/compiler-sfc\` resolve to one version\n` +
  `(\`vue\` depends on \`@vue/compiler-sfc\` at an exact version, so a mismatch means\n` +
  `something is overriding or duplicating it). Do not silence this check.`

/** Throws when the compiler and the runtime disagree. Never warns — see above. */
export function assertCompilerMatchesRuntime(): void {
  if (!versions.matches) throw new Error(VERSION_MISMATCH_MESSAGE)
}
