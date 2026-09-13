/**
 * Runs one compiled ES module in the page, with imports resolved against the
 * playground's own module table.
 *
 * `sfc/compile.ts` hands back ESM text — the exact shape `@vitejs/plugin-vue`
 * emits — and the browser cannot evaluate that without a URL. Rather than
 * mint blob URLs (which would need an import map to resolve `vue` and the v-*
 * specifiers, and import maps cannot be installed after the first module has
 * loaded), the import statements are rewritten into lookups against
 * `LIBRARY_MODULES` and the result is evaluated as a function body.
 *
 * The invariant this file protects: **a demo resolves `vue` and every v-*
 * package to the same module instance the app itself uses.** A second copy of
 * Vue means a second reactivity system and directives that never fire.
 */
import { MagicString, babelParse } from 'vue/compiler-sfc'
import { LIBRARY_MODULES } from '../libraries'

/** The specifiers a demo may import. Anything else is a mistake worth naming. */
export const importableSpecifiers: string[] = Object.keys(LIBRARY_MODULES)

export function resolveDemoImport(specifier: string, demoId: string): unknown {
  const mod = LIBRARY_MODULES[specifier]
  if (mod !== undefined) return mod
  throw new Error(
    `Demo "${demoId}" imported "${specifier}". Playground demos are single files: ` +
      `import from one of ${importableSpecifiers.join(', ')} — never a relative path.`,
  )
}

const quote = (s: string) => JSON.stringify(s)

/**
 * Rewrites top-level `import` / `export` into plain statements so the code can
 * run inside `new Function`. Uses the compiler's own Babel parser rather than a
 * regex — an `import` inside a template literal or a comment must not match.
 */
export function rewriteModuleSyntax(code: string, describe: string): string {
  const s = new MagicString(code)
  const program = babelParse(code, { sourceType: 'module' }).program

  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      const source = node.source.value
      const lines: string[] = []
      const named: string[] = []

      for (const spec of node.specifiers) {
        if (spec.type === 'ImportNamespaceSpecifier') {
          lines.push(`const ${spec.local.name} = __req(${quote(source)});`)
        } else if (spec.type === 'ImportDefaultSpecifier') {
          named.push(`default: ${spec.local.name}`)
        } else {
          const imported =
            spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
          named.push(imported === spec.local.name ? imported : `${quote(imported)}: ${spec.local.name}`)
        }
      }

      if (named.length) lines.push(`const { ${named.join(', ')} } = __req(${quote(source)});`)
      // A bare `import 'x'` still has to run for its side effects.
      if (!lines.length) lines.push(`__req(${quote(source)});`)
      s.overwrite(node.start!, node.end!, lines.join('\n'))
    } else if (node.type === 'ExportNamedDeclaration') {
      // `export function render(…)` → `function render(…)`; `export { a }` → gone.
      if (node.declaration) s.remove(node.start!, node.declaration.start!)
      else s.remove(node.start!, node.end!)
    } else if (node.type === 'ExportDefaultDeclaration') {
      // `compileScript` is asked for `genDefaultAs`, so this only shows up when
      // a demo writes its own `export default` — which would shadow the SFC.
      throw new Error(
        `${describe}: a playground demo must not write \`export default\` — ` +
          `\`<script setup>\` already is the component's default export.`,
      )
    } else if (node.type === 'ExportAllDeclaration') {
      throw new Error(`${describe}: \`export *\` is not supported in a playground demo.`)
    }
  }

  return s.toString()
}

/**
 * Evaluates a function body produced by `sfc/compile.ts`.
 *
 * `new Function` and not `eval`: the body must not close over this module's
 * scope, so a demo referencing an undeclared name fails the same way it would
 * in a real app instead of silently picking up a local.
 */
export function runFunctionBody(body: string, demoId: string): unknown {
  const factory = new Function('__req', body) as (req: (s: string) => unknown) => unknown
  return factory((specifier) => resolveDemoImport(specifier, demoId))
}
