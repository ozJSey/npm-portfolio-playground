/**
 * One fenced code block out of a package README, compiled the way this
 * playground compiles a demo card.
 *
 * `tickets/DOCS-3`: *"Extract fenced code blocks from each README, compile them
 * the way the playground compiles a demo, and fail on a block that does not
 * compile."* This module is the "compile them" half. The extraction half is
 * `scripts/docs/extract.mjs`, which reads the `.md` file rather than holding a
 * copy of the samples — a checked sample that has been hand-copied is a second
 * document to keep in sync, which is the drift the gate exists to catch.
 *
 * **Why this runs in the page and not in Node.** Three things have to be the
 * ones the playground actually uses, or the gate is checking a different thing
 * from the one that ships:
 *
 *   1. the SFC compiler — `sfc/compile.ts`, at the Vue version `sfc/versions.ts`
 *      pins to the runtime (PG-14);
 *   2. `LIBRARY_MODULES` — the *aliased* packages, so `PLAYGROUND_TARGET=dist`
 *      checks the READMEs against the built entries, exactly like `smoke:dist`;
 *   3. `window` — whether `fetch` is a global is a fact about the browser, and
 *      the DZ-5 defect below turns on precisely that.
 *
 * **Nothing here executes the sample.** Compilation, import resolution and the
 * lints are all static. A README sample is somebody else's application code:
 * `app.mount('#app')` in a `ts` block would mount a second Vue app over this
 * one, and `localStorage.clear()` would take the editor's saved edits with it.
 * A gate with side effects is not a gate you can run twice.
 *
 * ## The three lints, and the bugs they are
 *
 * Compiling proves the sample is syntactically a Vue component. It does not
 * prove the sample *works* — every defect in DOCS-3's list compiled fine. So
 * after codegen the render function is read back for the two failure modes that
 * have actually shipped from this repository's READMEs (`tickets/DZ-5`):
 *
 *   `TEMPLATE_GLOBAL`   `fetch` is not in Vue's template-globals allowlist, so
 *                       `@drop="fetch(…)"` compiles to `_ctx.fetch(…)` in any
 *                       Vue 3 SFC and throws `_ctx.fetch is not a function` on
 *                       the first drop. Shipped in v-dropzone recipe 4.
 *   `TEMPLATE_REF_UNWRAP`
 *                       A `setup-ref` is already unwrapped inside a template
 *                       expression, so `token.value` there is a double unwrap
 *                       and reads `undefined`. Shipped in v-dropzone recipe 3
 *                       as `Authorization: Bearer undefined` — which uploads
 *                       fine against a mock and 401s against a real server.
 *   `MISSING_EXPORT`    The sample imports a name the package does not export.
 *                       v-fit-children's brief documented three such exports,
 *                       present in neither source, dist nor tarball.
 *
 * Plus one advisory, `TEMPLATE_UNDECLARED`: the template reads a name the
 * sample's own `<script setup>` never declares, so pasting it renders nothing.
 *
 * All four only apply to a block that carries a `<script>` — a template-only
 * excerpt is an excerpt, and its free names come from a script the README
 * deliberately did not repeat.
 */
import { babelParse, parse, type BindingMetadata } from 'vue/compiler-sfc'
import { transform as sucraseTransform } from 'sucrase'
import { compileSfcToFunctionBody, stripTypeScript } from './sfc/compile'
import { DIRECTIVE_NAMES, LIBRARY_MODULES } from './libraries'

/** Severity drives the exit code; the runner prints both. */
export type DocSampleSeverity = 'error' | 'warn'

export interface DocSampleFinding {
  severity: DocSampleSeverity
  /** Stable machine code — `TEMPLATE_GLOBAL`, `MISSING_EXPORT`, … */
  code: string
  message: string
}

export interface DocSampleReport {
  /** What the block turned out to be, once the language word was honoured. */
  kind: 'sfc' | 'template-fragment' | 'module' | 'unsupported'
  findings: DocSampleFinding[]
  /**
   * Disclosed transformations. A template-only excerpt is wrapped in
   * `<template>` before it can compile, and a reader of the report has to be
   * told that — a gate that quietly reshapes its input is checking its own
   * output.
   */
  notes: string[]
}

const finding = (severity: DocSampleSeverity, code: string, message: string): DocSampleFinding => ({
  severity,
  code,
  message,
})

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Languages this module knows how to compile. Everything else is prose. */
const SFC_LANGS = new Set(['vue'])
const MODULE_LANGS = new Set(['ts', 'typescript', 'js', 'javascript', 'mjs', 'tsx', 'jsx'])

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

interface SampleImport {
  source: string
  /** `imported` is `default` for a default import, `*` for a namespace one. */
  names: string[]
  /** Of those, the ones the snippet uses in a value position. */
  values: Set<string>
}

/**
 * The imports of a snippet, as the module system will see them.
 *
 * TypeScript is stripped first rather than parsed with the `typescript` plugin,
 * because stripping is what removes `import type { … }` and inline `type`
 * specifiers — a genuinely type-only import must not be checked against a
 * runtime module. `keepUnusedImports` is on in `stripTypeScript`, so an import
 * used only from a template survives the strip.
 *
 * What survives that is still ambiguous, and the ambiguity matters. A README
 * that writes `import { BigDecimal, BigDecimalInput } from '…'` — no `type`
 * keyword, with `BigDecimalInput` used only in a type position — is fine under
 * a plain esbuild transpile and a **build error** under `verbatimModuleSyntax`,
 * which `@vue/tsconfig` turns on. So both facts are collected: the name, and
 * whether the snippet uses it as a value.
 */
function readImports(code: string, filename: string): SampleImport[] {
  const program = babelParse(stripTypeScript(code, filename), { sourceType: 'module' }).program
  // The same strip with elision on. A name that does not survive it is used
  // nowhere but in type positions — TypeScript's own rule, applied by the same
  // tool, rather than a second guess at what is a type.
  const elided = sucraseTransform(code, {
    transforms: ['typescript'],
    disableESTransforms: true,
    filePath: filename,
  }).code
  const values = new Set<string>()
  for (const node of babelParse(elided, { sourceType: 'module' }).program.body) {
    if (node.type !== 'ImportDeclaration') continue
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportSpecifier') {
        values.add(spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value)
      } else values.add(spec.local.name)
    }
  }

  const imports: SampleImport[] = []
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue
    const names: string[] = []
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportNamespaceSpecifier') names.push('*')
      else if (spec.type === 'ImportDefaultSpecifier') names.push('default')
      else names.push(spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value)
    }
    imports.push({ source: node.source.value, names, values })
  }
  return imports
}

/**
 * Checks a sample's imports against the modules the playground really loaded.
 *
 * Only the portfolio's own packages (and `vue`) are asserted on. A README may
 * legitimately `import App from './App.vue'` or reach for `vue-router`; that is
 * the reader's application, not ours, and failing on it would make the gate
 * something people route around. An `@ozjsey/…` specifier that is *not* loaded
 * here is a different matter: it names a package this portfolio does not have.
 */
function checkImports(imports: SampleImport[], templateText: string): DocSampleFinding[] {
  const findings: DocSampleFinding[] = []
  for (const { source, names, values } of imports) {
    const mod = LIBRARY_MODULES[source]
    if (mod === undefined) {
      if (source.startsWith('@ozjsey/')) {
        findings.push(
          finding(
            'error',
            'UNKNOWN_PACKAGE',
            `imports from "${source}", which is not a package this playground loads. ` +
              `Loadable: ${Object.keys(LIBRARY_MODULES).join(', ')}`,
          ),
        )
      }
      continue
    }
    // A module namespace is an object; `installLibraries` already refuses to
    // boot on anything else, so this is a narrowing, not a defensive branch.
    if (typeof mod !== 'object' || mod === null) continue
    for (const name of names) {
      if (name === '*') continue
      if (name in mod) continue
      // A name the snippet only mentions in a type position is a type import
      // written without the `type` keyword — a different, smaller bug.
      if (!values.has(name) && !usedInTemplate(name, templateText)) {
        findings.push(
          finding(
            'warn',
            'UNTYPED_TYPE_IMPORT',
            `imports { ${name} } from "${source}" without \`type\`, and the module exports no ` +
              `runtime \`${name}\`. Under \`verbatimModuleSyntax\` — which @vue/tsconfig turns ` +
              `on — that is a build error in the reader's project. Write ` +
              `\`import type { ${name} }\`.`,
          ),
        )
        continue
      }
      findings.push(
        finding(
          'error',
          'MISSING_EXPORT',
          `imports { ${name} } from "${source}", which does not export it. ` +
            `It exports: ${Object.keys(mod).sort().join(', ')}`,
        ),
      )
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Template lints
// ---------------------------------------------------------------------------

/**
 * Is this imported name used by the template?
 *
 * Sucrase's elision pass only sees the script, so a directive imported for the
 * template alone — `vFitChildren`, bound as `v-fit-children` — looks unused to
 * it. The template is markup rather than an expression, so this is a textual
 * check against both spellings rather than a parse, and it is deliberately
 * generous: the cost of a false "it is used" is a `MISSING_EXPORT` reported as
 * an error instead of a warning, and that name is missing either way.
 */
function usedInTemplate(name: string, templateText: string): boolean {
  if (!templateText) return false
  const kebab = name.replace(/^v(?=[A-Z])/, 'v-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  const word = (needle: string) => new RegExp(`(^|[^\\w$-])${needle}([^\\w$-]|$)`).test(templateText)
  return word(name) || word(kebab)
}

/** `_ctx.foo` — a name the template compiler could not resolve to a binding. */
const CTX_REF = /_ctx\.([A-Za-z_$][\w$]*)/g
/** `_ctx.foo(` or `new _ctx.Foo(` — that same name, *called*. */
const CTX_CALL = /(new\s+)?_ctx\.([A-Za-z_$][\w$]*)\s*\(/g
/** `$setup.foo.value` — reading `.value` off an already-unwrapped ref. */
const SETUP_UNWRAP = /\$setup\.([A-Za-z_$][\w$]*)\.value\b/g
/** `_resolveDirective("foo")` — the directive name as the runtime will look it up. */
const RESOLVE_DIRECTIVE = /_resolveDirective\("([^"]+)"\)/g

const matches = (code: string, re: RegExp, group: number): string[] => [
  ...new Set([...code.matchAll(re)].map((m) => m[group])),
]

/**
 * `v-fit-children` in a template is looked up as `fit-children`. A sample that
 * imports the directive and binds it locally is fine too, so both spellings of
 * a local import count.
 */
function knownDirectives(imports: SampleImport[]): Set<string> {
  const known = new Set(DIRECTIVE_NAMES)
  for (const { names } of imports) {
    for (const name of names) {
      const match = name.match(/^v([A-Z]\w*)$/)
      if (match) known.add(match[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    }
  }
  return known
}

function lintTemplate(
  templateCode: string,
  bindings: BindingMetadata | undefined,
  imports: SampleImport[],
): DocSampleFinding[] {
  const findings: DocSampleFinding[] = []

  for (const name of matches(templateCode, SETUP_UNWRAP, 1)) {
    // `setup-ref` is the only binding kind the setup proxy unwraps. `.value`
    // on anything else is an ordinary property read.
    if (bindings?.[name] !== 'setup-ref') continue
    findings.push(
      finding(
        'error',
        'TEMPLATE_REF_UNWRAP',
        `template expression reads \`${name}.value\`, but \`${name}\` is a ref and templates ` +
          `already unwrap it — this reads \`undefined\`. Write \`${name}\`, or move the ` +
          `expression into <script setup> where \`.value\` is correct.`,
      ),
    )
  }

  const called = new Set(
    [...templateCode.matchAll(CTX_CALL)].map((m) => m[2]),
  )
  for (const name of matches(templateCode, CTX_REF, 1)) {
    const isGlobal = name in window
    if (isGlobal && called.has(name)) {
      findings.push(
        finding(
          'error',
          'TEMPLATE_GLOBAL',
          `template expression calls \`${name}()\`. \`${name}\` is a browser global, and Vue's ` +
            `template-globals allowlist does not include it — this compiles to ` +
            `\`_ctx.${name}(…)\` and throws "_ctx.${name} is not a function" at runtime. ` +
            `Move the call into <script setup> and bind the handler.`,
        ),
      )
      continue
    }
    findings.push(
      finding(
        'warn',
        'TEMPLATE_UNDECLARED',
        `template reads \`${name}\`, which this sample's <script> never declares — pasted as ` +
          `printed it renders nothing for that name.`,
      ),
    )
  }

  const known = knownDirectives(imports)
  for (const name of matches(templateCode, RESOLVE_DIRECTIVE, 1)) {
    if (known.has(name)) continue
    findings.push(
      finding(
        'error',
        'UNKNOWN_DIRECTIVE',
        `template uses \`v-${name}\`, which no package in this portfolio registers. ` +
          `Registered: ${[...known].sort().join(', ')}`,
      ),
    )
  }

  return findings
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export interface DocSampleInput {
  /** The block's text, verbatim from the README. */
  code: string
  /** The fence's language word — the block's own declaration of what it is. */
  lang: string
  /** `v-dropzone/README.md:412`, used in every message and as the filename. */
  id: string
}

/**
 * Compiles one block and returns what is wrong with it.
 *
 * The language word on the fence is the declaration and is taken at face value:
 * a block that says `vue` is compiled as a Vue SFC, a block that says `ts` is
 * compiled as a TypeScript module, and a block that says `bash` or `text` is
 * not compiled at all. There is no second marker to learn and nothing for a
 * README author to remember — an output sample or a pseudo-code excerpt says so
 * by not claiming to be Vue. (`src/markdown.ts`, which renders these same
 * fences in the Documentation view, only reads a bare language word, so a
 * suffix syntax would stop the block rendering as code at all.)
 */
export function compileDocSample({ code, lang, id }: DocSampleInput): DocSampleReport {
  const notes: string[] = []

  if (MODULE_LANGS.has(lang)) {
    const filename = `/${id}.ts`
    try {
      babelParse(stripTypeScript(code, filename), { sourceType: 'module' })
      return { kind: 'module', notes, findings: checkImports(readImports(code, filename), '') }
    } catch (err) {
      return {
        kind: 'module',
        notes,
        findings: [finding('error', 'PARSE', messageOf(err))],
      }
    }
  }

  if (!SFC_LANGS.has(lang)) return { kind: 'unsupported', notes, findings: [] }

  const filename = `/${id}.vue`
  const { source, kind } = asSingleFileComponent(code, filename, notes)

  let compiled
  try {
    compiled = compileSfcToFunctionBody(source, filename)
  } catch (err) {
    return { kind, notes, findings: [finding('error', 'COMPILE', messageOf(err))] }
  }

  const descriptor = parse(source, { filename }).descriptor
  const scriptText = `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`
  const hasScript = descriptor.script !== null || descriptor.scriptSetup !== null

  const findings: DocSampleFinding[] = []

  /**
   * A top-level element that is not `<template>`, `<script>` or `<style>` is an
   * SFC *custom block*, and Vue hands it to a tool that is not there. The
   * compiler only tips about it, so this shipped in v-keyboard-navigation's
   * README: a `<script setup>` followed by a bare `<ul v-keyboard-navigation>`,
   * which pasted into a `.vue` file renders an empty component.
   */
  for (const block of descriptor.customBlocks) {
    findings.push(
      finding(
        'error',
        'STRAY_ELEMENT',
        `\`<${block.type}>\` sits at the top level, beside a <template> or <script>, so Vue ` +
          `reads it as an SFC custom block and renders nothing. Wrap the markup in <template>.`,
      ),
    )
  }

  let imports: SampleImport[] = []
  if (hasScript) {
    try {
      imports = readImports(scriptText, filename)
    } catch (err) {
      findings.push(finding('error', 'PARSE', messageOf(err)))
    }
    findings.push(...checkImports(imports, descriptor.template?.content ?? ''))
  }

  // The lints only judge a sample that claims to be whole. A bare excerpt's
  // free names live in a <script setup> the README chose not to reprint, and
  // flagging them would bury the two findings that are real bugs.
  if (hasScript && compiled.templateCode) {
    findings.push(...lintTemplate(compiled.templateCode, compiled.bindings, imports))
  }

  for (const warning of compiled.warnings) {
    // Already reported above, with the fix in it.
    if (/^Ignored </.test(warning)) continue
    findings.push(finding('warn', 'COMPILER_TIP', warning))
  }

  return { kind, notes, findings }
}

/**
 * A `vue` block as an SFC the compiler will accept — and a note saying how.
 *
 * 42 of this repository's 100 `vue` blocks are template excerpts: markup with
 * no `<template>` around it, sometimes followed by the `<style>` that styles
 * it. That is the normal way to show "put the directive here", it is what npm
 * renders, and refusing to check it would exempt the commonest shape in the
 * corpus from the gate. So it is wrapped — and the wrapping is disclosed in the
 * report, because a gate that quietly reshapes its input is grading its own
 * output.
 *
 * The line is drawn at `<script>`: once a block has one it is claiming to be a
 * whole component, and it is checked as one. Nothing is ever wrapped around a
 * block that has a `<template>` or a `<script>` already.
 */
function asSingleFileComponent(
  code: string,
  filename: string,
  notes: string[],
): { source: string; kind: DocSampleReport['kind'] } {
  const probe = parse(code, { filename }).descriptor
  if (probe.template || probe.script || probe.scriptSetup) return { source: code, kind: 'sfc' }

  // `<style>` blocks keep their place; only the markup ahead of them is wrapped.
  // `loc.start.offset` is the start of the block's *content*, so step back to
  // the opening tag.
  const firstStyle = probe.styles[0]
  const cut = firstStyle ? code.lastIndexOf('<style', firstStyle.loc.start.offset) : code.length
  const markup = code.slice(0, cut).trim()
  if (!markup) return { source: code, kind: 'sfc' }

  notes.push(
    firstStyle
      ? 'template excerpt with its <style> — the markup was wrapped in <template> to compile'
      : 'template excerpt — wrapped in <template> to compile',
  )
  return {
    source: `<template>\n${markup}\n</template>\n${code.slice(cut)}`,
    kind: 'template-fragment',
  }
}
