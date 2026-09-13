/**
 * Demo source text → runnable JavaScript, using the app's own Vue compiler.
 *
 * This deliberately mirrors what `@vitejs/plugin-vue` does on disk, step for
 * step, so an edited card and a pristine one go through the same codegen:
 *
 *   parse           → SFC descriptor
 *   compileScript   → `<script setup>` with `genDefaultAs`, bindings for the template
 *   sucrase         → strip TypeScript (compileScript emits TS through untouched;
 *                     in a normal Vite app esbuild does this next)
 *   compileTemplate → module-mode render function, given the script's bindings
 *   compileStyle    → scoped CSS, `data-v-<id>`
 *
 * The version guard in `sfc/versions.ts` is what keeps the first, third and
 * fourth steps on the same Vue as the runtime. See that file for what happened
 * when they were not.
 */
import { compileScript, compileStyle, compileTemplate, parse } from 'vue/compiler-sfc'
import { transform as sucraseTransform } from 'sucrase'
import { rewriteModuleSyntax } from './esm-runtime'

export interface CompiledSfc {
  /** A `new Function('__req', …)` body that returns the component options. */
  body: string
  /** Compiled `<style>` blocks, already scoped. */
  styles: string[]
  /** Non-fatal compiler tips. */
  warnings: string[]
}

/**
 * Stable-per-source id. `<style scoped>` selectors and the component's
 * `__scopeId` have to agree, and a recompiled demo must not inherit the
 * previous revision's rules — callers pass a filename that changes per compile.
 */
function scopeIdFor(filename: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < filename.length; i++) {
    h ^= filename.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(7, '0')
}

const messageOf = (e: unknown): string =>
  typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)

/** `compileScript` leaves TypeScript in its output; Vite hands that to esbuild. */
function stripTypeScript(code: string, filename: string): string {
  return sucraseTransform(code, {
    transforms: ['typescript'],
    // Only types come out — no downlevelling. The browser running this is the
    // same browser that would run the real app's output.
    disableESTransforms: true,
    // An import that is only used from the template is not "unused"; leave the
    // elision decision to the module rewriter, which resolves every specifier.
    keepUnusedImports: true,
    filePath: filename,
  }).code
}

export function compileSfcToFunctionBody(source: string, filename: string): CompiledSfc {
  const warnings: string[] = []

  const { descriptor, errors } = parse(source, { filename })
  if (errors.length) throw new Error(errors.map(messageOf).join('\n'))
  if (!descriptor.template && !descriptor.script && !descriptor.scriptSetup) {
    throw new Error(`${filename}: no <template> and no <script> — nothing to mount.`)
  }
  for (const block of descriptor.customBlocks) {
    warnings.push(`Ignored <${block.type}> block — the playground has no handler for it.`)
  }

  const id = scopeIdFor(filename)
  const hasScoped = descriptor.styles.some((style) => style.scoped)
  const isTs = [descriptor.script, descriptor.scriptSetup].some(
    (block) => block !== null && /^tsx?$/.test(block.lang ?? ''),
  )
  const expressionPlugins: 'typescript'[] = isTs ? ['typescript'] : []

  // --- script -------------------------------------------------------------
  let scriptCode = 'const __sfc__ = {};'
  let bindings
  if (descriptor.script || descriptor.scriptSetup) {
    const compiled = compileScript(descriptor, {
      id,
      // Dev-mode shape, exactly like `@vitejs/plugin-vue` without `isProd`:
      // the template compiles separately against these bindings.
      inlineTemplate: false,
      genDefaultAs: '__sfc__',
      templateOptions: { compilerOptions: { expressionPlugins } },
    })
    bindings = compiled.bindings
    scriptCode = isTs ? stripTypeScript(compiled.content, filename) : compiled.content
  }

  // --- template -----------------------------------------------------------
  let templateCode = ''
  if (descriptor.template) {
    const compiled = compileTemplate({
      source: descriptor.template.content,
      filename,
      id,
      scoped: hasScoped,
      slotted: descriptor.slotted,
      compilerOptions: { bindingMetadata: bindings, expressionPlugins },
    })
    if (compiled.errors.length) throw new Error(compiled.errors.map(messageOf).join('\n'))
    warnings.push(...compiled.tips)
    // Template expressions are compiled through as written, so `lang="ts"` puts
    // TypeScript in the render function too. `@vitejs/plugin-vue` hands the
    // whole module — script and template — to esbuild with `loader: 'ts'`; this
    // is the same step, and it is why `dz!.cancel()` in a template works here
    // exactly as it does in a real app.
    templateCode = isTs ? stripTypeScript(compiled.code, filename) : compiled.code
  }

  // --- styles -------------------------------------------------------------
  const styles = descriptor.styles.map((style) => {
    // No preprocessor runs in the page. Say so rather than emitting Sass as CSS.
    if (style.lang) {
      throw new Error(
        `${filename}: <style lang="${style.lang}"> needs a preprocessor the browser does not ` +
          `have. Playground demos use plain CSS.`,
      )
    }
    const compiled = compileStyle({ source: style.content, filename, id, scoped: style.scoped })
    if (compiled.errors.length) throw new Error(compiled.errors.map(messageOf).join('\n'))
    return compiled.code
  })

  // The render function is wrapped so its `vue` helper imports cannot collide
  // with the script's (both files import from `vue` under `_`-prefixed aliases,
  // and two `const` declarations of one name in a single body is a SyntaxError).
  // It closes over nothing: a module-mode render reads state off `$setup`.
  const body = [
    rewriteModuleSyntax(scriptCode, filename),
    templateCode
      ? `__sfc__.render = (() => {\n${rewriteModuleSyntax(templateCode, filename)}\nreturn render;\n})();`
      : '',
    hasScoped ? `__sfc__.__scopeId = ${JSON.stringify(`data-v-${id}`)};` : '',
    `__sfc__.__file = ${JSON.stringify(filename)};`,
    'return __sfc__;',
  ]
    .filter(Boolean)
    .join('\n')

  return { body, styles, warnings }
}
