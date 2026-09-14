/**
 * Single source of truth for "what libraries does the playground expose".
 *
 * Three consumers:
 *   1. `installLibraries(app)` — global registration, so every demo template
 *      can use `v-copy` / `v-observe` / … without importing anything.
 *   2. `LIBRARY_MODULES` — handed to the in-browser SFC compiler as its module
 *      cache, so a demo that *does* write `import { vCopy } from '@ozjsey/v-copy'`
 *      resolves to the exact same module instance (no duplicate directives,
 *      no duplicate Vue).
 *   3. `DIRECTIVE_NAMES` — what `src/doc-sample.ts` resolves a README sample's
 *      `v-*` against.
 *
 * Every specifier below is resolved from the published npm package installed in
 * this project, or — in the normal case — from the sibling source folder that
 * `vite.config.ts` aliases over it.
 *
 * ## PG-22: one package per `import()`, never one barrel
 *
 * These used to be ten static `import * as … from '@ozjsey/…'` at module scope.
 * One sibling that did not compile — `v-teleport-to` importing a
 * `MEASURE_EPSILON` that did not exist yet — therefore took the *entire module
 * graph* down: every tab rendered an empty `#app`, and `pnpm smoke` said only
 * "No library tabs rendered", naming nothing. An agent working on
 * `v-keyboard-navigation` lost part of a run to a defect in `v-teleport-to`.
 *
 * Several agents edit sibling packages here at once and each one's source is
 * aliased live into this app, so a half-finished sibling is the normal
 * condition, not an edge case. Each library is therefore loaded through its own
 * dynamic `import()` inside its own `try`: a broken one is recorded in
 * `libraryFailures`, renders an error card on its own tab naming the package and
 * the error, and leaves the other nine working.
 *
 * **This is not the quiet degradation PG-14/PG-15 argued against.** A failure
 * here is stamped on `<html data-playground-library-failures>`, carried in
 * `window.__PLAYGROUND_BOOT__`, painted on every tab, and failed by name in
 * `scripts/smoke.mjs`, `scripts/interactions.mjs`, `scripts/geometry.mjs` and
 * `scripts/deeplinks.mjs`. What changed is the blast radius, not the loudness.
 * `pnpm typecheck:libs` catches the same class before a browser is launched.
 */
import type { App, Directive, Plugin } from 'vue'
import * as Vue from 'vue'

/**
 * What a library contributes to `app`, once its module has actually loaded.
 *
 * No name on it: the registration name lives on the spec, as `directiveName`,
 * and nowhere else. Carrying it in both places is how `DIRECTIVE_NAMES` — which
 * `src/doc-sample.ts` validates README samples against — silently drifts from
 * what `app.directive()` was actually handed.
 */
interface Install {
  /**
   * The package's documented plugin. `null` means the package ships none *by
   * design*; `undefined` means the loaded build did not export the one it
   * should have, which is a failure and not a fallback.
   */
  plugin: Plugin | null | undefined
  directive: Directive
}

interface LibrarySpec {
  /** The specifier a demo imports — named in every failure message. */
  specifier: string
  /** Sibling folder name: the playground tab id, and the `PLAYGROUND_UNALIAS` value. */
  dir: string
  /**
   * Registration name, or `null` for a package that registers nothing.
   *
   * `@ozjsey/vue-write-behind` exports one composable and
   * `@ozjsey/bigdecimal-string` exports a plain TypeScript class that never
   * touches Vue, so for both there is no `app.directive()` call to make and no
   * plugin to `use()`. They are still loaded and still land in
   * `LIBRARY_MODULES`, because that is what lets a demo write
   * `import { bd } from '@ozjsey/bigdecimal-string'` and resolve to the same
   * module instance — and the same Vue — as the app itself.
   *
   * Do NOT give them a fake `install` to keep the list uniform: the checks below
   * exist to fail on a package whose build did not export a usable directive,
   * and a package that has none by design would have to be special-cased
   * *inside* the guard, which is how a guard stops guarding.
   */
  directiveName: string | null
  /**
   * Loads the module and describes what it registers.
   *
   * One closure per package so each keeps its own namespace type — this is what
   * lets `module.VCopyPlugin` stay type-checked without a cast, which a shared
   * `Promise<unknown>` signature would have cost.
   */
  load: () => Promise<{ module: unknown; install: Install | null }>
}

const LIBRARY_SPECS: LibrarySpec[] = [
  {
    specifier: '@ozjsey/bigdecimal-string',
    dir: 'bigdecimal-string',
    directiveName: null,
    load: async () => ({ module: await import('@ozjsey/bigdecimal-string'), install: null }),
  },
  {
    specifier: '@ozjsey/v-copy',
    dir: 'v-copy',
    directiveName: 'copy',
    load: async () => {
      const module = await import('@ozjsey/v-copy')
      return { module, install: { plugin: module.VCopyPlugin, directive: module.vCopy } }
    },
  },
  {
    specifier: '@ozjsey/v-dropzone',
    dir: 'v-dropzone',
    directiveName: 'dropzone',
    load: async () => {
      const module = await import('@ozjsey/v-dropzone')
      return {
        module,
        install: { plugin: module.DropzonePlugin, directive: module.vDropzone },
      }
    },
  },
  {
    // v-fit-children deliberately ships no plugin: registering a directive is the
    // application's call, not the package's. This is the path its README documents.
    specifier: '@ozjsey/v-fit-children',
    dir: 'v-fit-children',
    directiveName: 'fit-children',
    load: async () => {
      const module = await import('@ozjsey/v-fit-children')
      return { module, install: { plugin: null, directive: module.vFitChildren } }
    },
  },
  {
    specifier: '@ozjsey/v-keyboard-navigation',
    dir: 'v-keyboard-navigation',
    directiveName: 'keyboard-navigation',
    load: async () => {
      const module = await import('@ozjsey/v-keyboard-navigation')
      return {
        module,
        install: {
          plugin: module.KeyboardNavigationPlugin,
          directive: module.vKeyboardNavigation,
        },
      }
    },
  },
  {
    specifier: '@ozjsey/v-observe',
    dir: 'v-observe',
    directiveName: 'observe',
    load: async () => {
      const module = await import('@ozjsey/v-observe')
      return { module, install: { plugin: module.ObservePlugin, directive: module.vObserve } }
    },
  },
  {
    specifier: '@ozjsey/v-scroll-into-view',
    dir: 'v-scroll-into-view',
    directiveName: 'scroll-into-view',
    load: async () => {
      const module = await import('@ozjsey/v-scroll-into-view')
      return {
        module,
        install: {
          plugin: module.ScrollIntoViewPlugin,
          directive: module.vScrollIntoView,
        },
      }
    },
  },
  {
    specifier: '@ozjsey/v-select-text',
    dir: 'v-select-text',
    directiveName: 'select-text',
    load: async () => {
      const module = await import('@ozjsey/v-select-text')
      return {
        module,
        install: { plugin: module.SelectTextPlugin, directive: module.vSelectText },
      }
    },
  },
  {
    specifier: '@ozjsey/v-teleport-to',
    dir: 'v-teleport-to',
    directiveName: 'teleport-to',
    load: async () => {
      const module = await import('@ozjsey/v-teleport-to')
      return {
        module,
        install: { plugin: module.TeleportToPlugin, directive: module.vTeleportTo },
      }
    },
  },
  {
    specifier: '@ozjsey/vue-write-behind',
    dir: 'vue-write-behind',
    directiveName: null,
    load: async () => ({ module: await import('@ozjsey/vue-write-behind'), install: null }),
  },
]

/**
 * The names templates bind against — `v-copy`, `v-fit-children`, …
 *
 * Derived from `LIBRARY_SPECS` rather than written out again, so a directive
 * that is renamed cannot leave a stale copy behind. `src/doc-sample.ts` resolves
 * the `v-*` in a README sample's template against this, which is how a
 * misspelled directive name in the docs becomes a failure instead of a silent
 * no-op. Static, so it is correct before any `import()` has settled.
 */
export const DIRECTIVE_NAMES: string[] = LIBRARY_SPECS.flatMap((spec) =>
  spec.directiveName === null ? [] : [spec.directiveName],
)

/** A library that did not load, or loaded without a usable public API. */
export interface LibraryFailure {
  /** npm specifier — `@ozjsey/v-teleport-to`. */
  specifier: string
  /** Sibling folder, which is also the tab id and the `PLAYGROUND_UNALIAS` value. */
  dir: string
  /** What went wrong, in the words of whoever noticed. */
  message: string
}

/**
 * Filled by `installLibraries`, read by `App.vue` and by every harness script.
 * Empty is the only acceptable state for a run that claims to have verified
 * anything.
 */
export const libraryFailures: LibraryFailure[] = []

/**
 * A stand-in for a package that is not (yet) loaded.
 *
 * A demo on another tab may `import` a package whose own tab is broken — a
 * cross-library card. Handing it `undefined` would surface as
 * "Cannot read properties of undefined", 40 lines from the cause. This throws
 * the cause instead, on first property access.
 */
export const LIBRARY_UNAVAILABLE = Symbol.for('playground.libraryUnavailable')

function unavailableModule(specifier: string, why: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        // Symbols and `then` are how the runtime *probes* a value — `await`,
        // `String()`, spread. Throwing there would replace a clear message with
        // a stack trace from somewhere unrelated, which is the failure mode this
        // whole pass is about. Only a real named import throws.
        if (property === LIBRARY_UNAVAILABLE) return `${specifier} ${why}`
        if (typeof property === 'symbol' || property === 'then') return undefined
        throw new Error(
          `${specifier} ${why} — so \`${String(property)}\` cannot be read from it. ` +
            `See the error card on that library's tab.`,
        )
      },
    },
  )
}

export const LIBRARY_MODULES: Record<string, unknown> = { vue: Vue }
for (const { specifier } of LIBRARY_SPECS) {
  LIBRARY_MODULES[specifier] = unavailableModule(specifier, 'has not finished loading')
}

/** Vue accepts either shape. An object with no hooks is a directive that does nothing. */
const DIRECTIVE_HOOKS = [
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeUnmount',
  'unmounted',
  'getSSRProps',
] as const

function describeDirective(value: unknown): string | null {
  if (typeof value === 'function') return null
  if (typeof value !== 'object' || value === null) return `it is ${typeof value}, not a directive`
  const hooks = DIRECTIVE_HOOKS.filter((hook) => hook in value)
  return hooks.length ? null : 'it is an object with no directive hooks on it'
}

function describePlugin(value: unknown): string | null {
  if (typeof value === 'function') return null
  if (typeof value === 'object' && value !== null && 'install' in value) return null
  return value === undefined
    ? 'the loaded build does not export it'
    : `it is ${typeof value}, which Vue cannot \`app.use()\``
}

/**
 * Loads every library, registers the ones that work, and reports the ones that
 * do not.
 *
 * **It still refuses to degrade quietly.** It used to shrug off a missing plugin
 * export and register the directive directly instead, "so the app still boots".
 * That is the PG-14/PG-15 defect class: `PLAYGROUND_TARGET=dist` with a broken
 * `@ozjsey/v-fit-children` build — one whose entry exported a *string* where the
 * directive should be — rendered all 97 cards and reported `smoke:dist` green,
 * because Vue registers whatever you hand it and `withDirectives` finds no hooks
 * to call. A gate that cannot fail is not a gate.
 *
 * What changed (PG-22) is that the consequence is scoped to the library that
 * earned it instead of blanking the page. The returned failures are rendered,
 * stamped on `<html>`, and read by all three harness scripts, so the run still
 * cannot come out green.
 */
export async function installLibraries(app: App): Promise<LibraryFailure[]> {
  libraryFailures.length = 0

  const loaded = await Promise.all(
    LIBRARY_SPECS.map(async (spec) => {
      try {
        return { spec, ...(await spec.load()), error: null }
      } catch (err) {
        return { spec, module: null, install: null, error: err }
      }
    }),
  )

  for (const { spec, module, install, error } of loaded) {
    if (error) {
      const message = error instanceof Error ? error.message : String(error)
      libraryFailures.push({ specifier: spec.specifier, dir: spec.dir, message })
      LIBRARY_MODULES[spec.specifier] = unavailableModule(spec.specifier, `failed to load (${message})`)
      continue
    }

    LIBRARY_MODULES[spec.specifier] = module

    if (!install) continue

    const badDirective = describeDirective(install.directive)
    if (badDirective) {
      libraryFailures.push({
        specifier: spec.specifier,
        dir: spec.dir,
        message: `exported directive is unusable — ${badDirective}`,
      })
    }
    if (install.plugin !== null) {
      const badPlugin = describePlugin(install.plugin)
      if (badPlugin) {
        libraryFailures.push({
          specifier: spec.specifier,
          dir: spec.dir,
          message: `documented plugin is unusable — ${badPlugin}`,
        })
      }
    }

    if (badDirective) continue

    if (install.plugin === null) {
      // Only reachable for a package that ships no plugin by design, and then
      // the name is the only way to register it. A spec with an `install` and
      // no `directiveName` is a wiring mistake in LIBRARY_SPECS — reported the
      // same way a broken build is, because a directive that quietly never
      // registers is the exact failure this file exists to prevent.
      if (spec.directiveName === null) {
        libraryFailures.push({
          specifier: spec.specifier,
          dir: spec.dir,
          message:
            'ships no plugin, so it has to be registered by name — but its LIBRARY_SPECS entry ' +
            'declares `directiveName: null`. Nothing would have registered it.',
        })
        continue
      }
      app.directive(spec.directiveName, install.directive)
    } else if (install.plugin !== undefined && !describePlugin(install.plugin)) {
      app.use(install.plugin)
    }
  }

  return libraryFailures
}

/**
 * The one line a harness has to read. Long deliberately: it is what `smoke`
 * prints when it finds `data-playground-library-failures` on `<html>`.
 */
export function describeLibraryFailures(failures: readonly LibraryFailure[]): string {
  return (
    `${failures.length} librar${failures.length === 1 ? 'y' : 'ies'} did not load a usable public API ` +
    `(PLAYGROUND_TARGET=${__PLAYGROUND_TARGET__}):\n` +
    failures.map((f) => `  • ${f.specifier}: ${f.message}`).join('\n') +
    `\n\nIn dist mode this means the package's built entry is stale or broken: rebuild it ` +
    `(\`npm run build\` in that package). In source mode the sibling folder does not currently ` +
    `compile — fix it, or run the rest of the playground around it with ` +
    `PLAYGROUND_UNALIAS=${failures.map((f) => f.dir).join(',')} (see vite.config.ts).`
  )
}
