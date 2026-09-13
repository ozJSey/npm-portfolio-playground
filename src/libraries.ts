/**
 * Single source of truth for "what libraries does the playground expose".
 *
 * Two consumers:
 *   1. `installLibraries(app)` — global registration, so every demo template
 *      can use `v-copy` / `v-observe` / … without importing anything.
 *   2. `LIBRARY_MODULES` — handed to the in-browser SFC compiler as its module
 *      cache, so a demo that *does* write `import { vCopy } from '@ozjsey/v-copy'`
 *      resolves to the exact same module instance (no duplicate directives,
 *      no duplicate Vue).
 *
 * Every specifier below is resolved from the published npm package installed
 * in this project.
 */
import type { App, Directive, Plugin } from 'vue'
import * as Vue from 'vue'

import * as vCopyModule from '@ozjsey/v-copy'
import * as vFitChildrenModule from '@ozjsey/v-fit-children'
import * as vDropzoneModule from '@ozjsey/v-dropzone'
import * as vKeyboardNavigationModule from '@ozjsey/v-keyboard-navigation'
import * as vObserveModule from 'v-observe'
import * as vScrollIntoViewModule from 'v-scroll-into-view'
import * as vSelectTextModule from 'v-select-text'
import * as vTeleportToModule from 'v-teleport-to'

export const LIBRARY_MODULES: Record<string, unknown> = {
  vue: Vue,
  '@ozjsey/v-copy': vCopyModule,
  '@ozjsey/v-dropzone': vDropzoneModule,
  '@ozjsey/v-fit-children': vFitChildrenModule,
  '@ozjsey/v-keyboard-navigation': vKeyboardNavigationModule,
  'v-observe': vObserveModule,
  'v-scroll-into-view': vScrollIntoViewModule,
  'v-select-text': vSelectTextModule,
  'v-teleport-to': vTeleportToModule,
}

interface Install {
  /** Registration name — templates use `v-<name>`. */
  name: string
  /** The specifier a demo imports — named in every failure message. */
  specifier: string
  /**
   * The package's documented plugin. `null` means the package ships none *by
   * design*; `undefined` means the loaded build did not export the one it
   * should have, which is a failure and not a fallback.
   */
  plugin: Plugin | null | undefined
  directive: Directive
}

const INSTALLS: Install[] = [
  {
    name: 'copy',
    specifier: '@ozjsey/v-copy',
    plugin: vCopyModule.VCopyPlugin,
    directive: vCopyModule.vCopy,
  },
  {
    name: 'dropzone',
    specifier: '@ozjsey/v-dropzone',
    plugin: vDropzoneModule.DropzonePlugin,
    directive: vDropzoneModule.vDropzone,
  },
  // v-fit-children deliberately ships no plugin: registering a directive is the
  // application's call, not the package's. This is the path its README documents.
  {
    name: 'fit-children',
    specifier: '@ozjsey/v-fit-children',
    plugin: null,
    directive: vFitChildrenModule.vFitChildren,
  },
  {
    name: 'keyboard-navigation',
    specifier: '@ozjsey/v-keyboard-navigation',
    plugin: vKeyboardNavigationModule.KeyboardNavigationPlugin,
    directive: vKeyboardNavigationModule.vKeyboardNavigation,
  },
  {
    name: 'observe',
    specifier: 'v-observe',
    plugin: vObserveModule.ObservePlugin,
    directive: vObserveModule.vObserve,
  },
  {
    name: 'scroll-into-view',
    specifier: 'v-scroll-into-view',
    plugin: vScrollIntoViewModule.ScrollIntoViewPlugin,
    directive: vScrollIntoViewModule.vScrollIntoView,
  },
  {
    name: 'select-text',
    specifier: 'v-select-text',
    plugin: vSelectTextModule.SelectTextPlugin,
    directive: vSelectTextModule.vSelectText,
  },
  {
    name: 'teleport-to',
    specifier: 'v-teleport-to',
    plugin: vTeleportToModule.TeleportToPlugin,
    directive: vTeleportToModule.vTeleportTo,
  },
]

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
 * Registers every directive globally, through each package's own plugin — the
 * playground doubles as a check that the documented install path works.
 *
 * **This throws rather than degrading.** It used to shrug off a missing plugin
 * export and register the directive directly instead, "so the app still boots".
 * That is the PG-14/PG-15 defect class: `PLAYGROUND_TARGET=dist` with a broken
 * `@ozjsey/v-fit-children` build — one whose entry exported a *string* where the
 * directive should be — rendered all 97 cards and reported `smoke:dist` green,
 * because Vue registers whatever you hand it and `withDirectives` finds no hooks
 * to call. A gate that cannot fail is not a gate.
 */
export function installLibraries(app: App): void {
  const problems: string[] = []

  for (const { name, specifier, plugin, directive } of INSTALLS) {
    const badDirective = describeDirective(directive)
    if (badDirective) problems.push(`${specifier}: exported directive is unusable — ${badDirective}`)

    if (plugin !== null) {
      const badPlugin = describePlugin(plugin)
      if (badPlugin) problems.push(`${specifier}: documented plugin is unusable — ${badPlugin}`)
    }

    if (badDirective) continue
    if (plugin === null) app.directive(name, directive)
    else if (plugin !== undefined && !describePlugin(plugin)) app.use(plugin)
  }

  if (problems.length) {
    throw new Error(
      `Playground boot check failed: ${problems.length} librar${problems.length === 1 ? 'y' : 'ies'} ` +
        `did not load a usable public API (PLAYGROUND_TARGET=${__PLAYGROUND_TARGET__}).\n\n` +
        problems.map((p) => `  • ${p}`).join('\n') +
        `\n\nIn dist mode this means the package's built entry is stale or broken: rebuild it ` +
        `(\`npm run build\` in that package) and re-run. The playground will not boot around it — ` +
        `a green run against a broken artifact is exactly what this check exists to prevent.`,
    )
  }
}
