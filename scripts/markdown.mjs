#!/usr/bin/env node
/**
 * `src/markdown.ts`, held to two promises. `tickets/DOCS-6`.
 *
 *   pnpm markdown                     # the renderer terminates, and agrees with extract.mjs
 *   pnpm markdown --negative-control  # put the defect back; both promises must break
 *
 * ## 1. It terminates
 *
 * The Documentation view renders every README with a hand-written parser, and
 * that parser had an input that made it **spin forever**: a fenced block whose
 * info string is not a bare word — ```` ```ts twoslash ````, ```` ```js title="x" ````,
 * or a four-backtick fence — matched the fence rule with nothing, was a block
 * opener so the paragraph rule refused it too, and the loop went round without
 * moving. Not a mis-render: a pegged CPU and a tab you have to kill. No README
 * in this corpus happens to contain one today, which is the whole problem —
 * the next one that does takes the docs site down for everybody reading it.
 *
 * A hang cannot be caught in-process, so every render below runs in a child
 * with a hard deadline and a SIGKILL behind it.
 *
 * ## 2. It sees the same blocks `scripts/docs/extract.mjs` sees
 *
 * The gate in `scripts/docs.mjs` checks every fenced sample in every README —
 * against blocks `extract.mjs` scanned out of the file. If the renderer and the
 * extractor disagree about what a fence is, the gate checks samples that are
 * not on screen and ignores text that is. They used to disagree on purpose;
 * they no longer do, and this is what keeps it that way.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { extractReadme } from './docs/extract.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const REPO = resolve(ROOT, '..')
const SOURCE = join(ROOT, 'src/markdown.ts')
const NEGATIVE_CONTROL = process.argv.includes('--negative-control')
const DEADLINE_MS = Number(process.env.MARKDOWN_DEADLINE_MS ?? 5000)

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

/**
 * Fence shapes that are legal GFM — npm and GitHub all render every one of
 * these as a code block — and that the pre-DOCS-6 renderer could not read.
 * The first three are the ones that hung it.
 */
const FIXTURES = [
  { name: 'info string with attributes', text: '```js title="demo.js"\nconsole.log(1)\n```\n' },
  { name: 'info string with a second word', text: '```ts twoslash\nconst a = 1\n```\n' },
  { name: 'four-backtick fence around three', text: '````\na ``` inside\n````\n' },
  { name: 'tilde fence', text: '~~~\ntilde\n~~~\n' },
  { name: 'bare fence', text: '```\nbare\n```\n' },
  { name: 'bare language word', text: '```vue\n<template />\n```\n' },
  { name: 'indented fence inside a list item', text: '- item\n\n  ```ts\n  const a = 1\n  ```\n' },
  { name: 'prose, then an attribute fence', text: 'A paragraph.\n```json5 {1}\n{ a: 1 }\n```\n' },
  { name: 'unterminated fence', text: '```ts\nconst a = 1\n' },
  { name: 'a lone fence and nothing else', text: '```\n' },
]

/** Every README this repository can see — siblings when present, installed always. */
function corpus() {
  const files = []
  for (const dir of existsSync(REPO) ? readdirSync(REPO) : []) {
    const file = join(REPO, dir, 'README.md')
    if (existsSync(file)) files.push({ name: `../${dir}/README.md`, file })
  }
  const scope = join(ROOT, 'node_modules/@ozjsey')
  for (const pkg of existsSync(scope) ? readdirSync(scope) : []) {
    const file = join(scope, pkg, 'README.md')
    if (existsSync(file)) files.push({ name: `node_modules/@ozjsey/${pkg}/README.md`, file })
  }
  if (!files.length) throw new Error('No README.md anywhere — there is nothing to render.')
  return files
}

// ---------------------------------------------------------------------------
// Building the renderer under test
// ---------------------------------------------------------------------------

/**
 * The exact edits that undo DOCS-6's two fixes, and nothing else.
 *
 * Expressed as string replacements against the real source so the control can
 * never drift into testing a straw man — and so it **fails loudly** the moment
 * one of them stops matching, because a mutation that applies to nothing is a
 * control that proves nothing.
 */
const MUTATIONS = {
  fence: {
    what: 'the fence opener only matches a bare language word again',
    from: 'const fence = line.match(/^(\\s*)([`~]{3,})(.*)$/)',
    to: 'const fence = line.match(/^(\\s*)(`{3})(\\w*)\\s*$/)',
  },
  paragraph: {
    what: 'the paragraph branch stops consuming its own first line again',
    from: 'const paragraph: string[] = [line]\n    index++',
    to: 'const paragraph: string[] = []',
  },
}

function buildRenderer(dir, mutations) {
  let source = readFileSync(SOURCE, 'utf8')
  for (const key of mutations) {
    const { from, to, what } = MUTATIONS[key]
    if (!source.includes(from)) {
      throw new Error(
        `The negative control cannot apply its "${key}" mutation (${what}): the line it replaces is ` +
          `no longer in src/markdown.ts. It is therefore not testing anything. Update MUTATIONS in ` +
          `${'scripts/markdown.mjs'} to match the code as it now reads.\n  looked for: ${JSON.stringify(from)}`,
      )
    }
    source = source.replace(from, to)
  }
  const file = join(dir, `markdown-${mutations.join('-') || 'as-shipped'}.mjs`)
  writeFileSync(file, transformSync(source, { loader: 'ts', format: 'esm' }).code)
  return file
}

function writeDriver(dir) {
  const file = join(dir, 'render.mjs')
  writeFileSync(
    file,
    [
      "import { readFileSync, writeFileSync } from 'node:fs'",
      'const { renderMarkdown } = await import(process.argv[2])',
      "const html = renderMarkdown(readFileSync(process.argv[3], 'utf8'))",
      'writeFileSync(process.argv[4], html)',
      '',
    ].join('\n'),
  )
  return file
}

/**
 * One render, in a child, on a clock.
 *
 * `spawnSync`'s own timeout plus SIGKILL is the whole mechanism: an infinite
 * `while` in the same process could not be interrupted by any amount of code
 * written here, which is exactly why the defect was invisible to every existing
 * check.
 */
function render(driver, rendererFile, inputFile, outputFile) {
  const started = Date.now()
  const out = spawnSync(process.execPath, [driver, rendererFile, inputFile, outputFile], {
    timeout: DEADLINE_MS,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
  })
  const ms = Date.now() - started
  if (out.signal === 'SIGKILL' || out.error?.code === 'ETIMEDOUT') {
    return { hung: true, ms }
  }
  if (out.status !== 0) return { hung: false, ms, error: (out.stderr || '').trim().split('\n').slice(-3).join('\n') }
  return { hung: false, ms, html: readFileSync(outputFile, 'utf8') }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const unescape = (html) =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

const renderedBlocks = (html) =>
  [...html.matchAll(/<pre class="md-pre"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) =>
    unescape(m[1]),
  )

const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })

const dir = mkdtempSync(join(tmpdir(), 'markdown-check-'))
const driver = writeDriver(dir)
const input = join(dir, 'input.md')
const output = join(dir, 'output.html')

/** Runs the whole suite against one build of the renderer. */
function suite(label, rendererFile) {
  let slowest = 0

  for (const fixture of [...FIXTURES.map((f) => ({ ...f, fixture: true })), ...corpus()]) {
    const text = fixture.text ?? readFileSync(fixture.file, 'utf8')
    writeFileSync(input, text)
    const out = render(driver, rendererFile, input, output)
    slowest = Math.max(slowest, out.ms)

    if (out.hung) {
      check(`${label}: renders ${fixture.name}`, false,
        `DID NOT TERMINATE — killed after ${DEADLINE_MS}ms. This is the DOCS-6 hang: a browser tab ` +
          `rendering this README is frozen, not slow.`)
      continue
    }
    if (out.error) {
      check(`${label}: renders ${fixture.name}`, false, `threw: ${out.error}`)
      continue
    }

    // The fenced blocks the renderer produced, against the ones extract.mjs
    // scanned out of the same bytes — same count, same bytes, same order. An
    // unterminated fence is included rather than excused: both sides swallow
    // the rest of the file, so they must swallow the same rest of the file.
    const expected = extractReadme(text, { file: fixture.name }).blocks
    const shown = renderedBlocks(out.html)
    const agrees =
      shown.length === expected.length && shown.every((code, i) => code === expected[i].code)
    const firstDiff = expected.findIndex((b, i) => shown[i] !== b.code)

    check(`${label}: renders ${fixture.name}`, agrees,
      `extract.mjs found ${expected.length} fenced block(s), the renderer emitted ${shown.length}` +
        (shown.length === expected.length
          ? ` — and block ${firstDiff + 1} differs (line ${expected[firstDiff]?.startLine})`
          : ''))
  }

  return slowest
}

let exitCode = 0
try {
  if (!NEGATIVE_CONTROL) {
    const slowest = suite('as shipped', buildRenderer(dir, []))
    for (const { name, ok, detail } of results) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
      if (!ok) console.log(`        ${detail}`)
    }
    const failed = results.filter((r) => !r.ok).length
    console.log('─'.repeat(92))
    console.log(
      failed
        ? `  ${failed} of ${results.length} markdown checks FAILED.`
        : `  ${results.length}/${results.length} inputs rendered and agreed with extract.mjs ` +
          `(slowest ${slowest}ms, deadline ${DEADLINE_MS}ms).\n` +
          `  Negative control: pnpm markdown --negative-control`,
    )
    exitCode = failed ? 1 : 0
  } else {
    // Two levels, because DOCS-6 fixed two things and each owes its own red.
    const fenceOnly = buildRenderer(dir, ['fence'])
    const both = buildRenderer(dir, ['fence', 'paragraph'])

    console.log(`\nNEGATIVE CONTROL — the defect put back, one half at a time`)
    console.log('─'.repeat(92))

    suite('fence regex reverted', fenceOnly)
    const afterFence = results.length
    suite('both reverted (the renderer as it shipped before DOCS-6)', both)

    const fenceRun = results.slice(0, afterFence)
    const bothRun = results.slice(afterFence)
    const fenceRed = fenceRun.filter((r) => !r.ok)
    const hangs = bothRun.filter((r) => !r.ok && /DID NOT TERMINATE/.test(r.detail ?? ''))

    for (const { name, ok, detail } of [...fenceRed, ...hangs]) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
      console.log(`        ${detail}`)
    }

    console.log('─'.repeat(92))
    const satisfied = fenceRed.length > 0 && hangs.length > 0
    console.log(
      satisfied
        ? `  NEGATIVE CONTROL SATISFIED\n` +
          `    • ${MUTATIONS.fence.what}  →  ${fenceRed.length} input(s) stopped rendering as code\n` +
          `    • ${MUTATIONS.paragraph.what}  →  ${hangs.length} input(s) never terminated and were\n` +
          `      SIGKILLed at ${DEADLINE_MS}ms, which is the defect this gate exists for`
        : `  NEGATIVE CONTROL FAILED — putting the defect back changed nothing ` +
          `(${fenceRed.length} fence failures, ${hangs.length} hangs). These checks cannot go red.`,
    )
    exitCode = satisfied ? 0 : 1
  }
} catch (err) {
  console.log(`\nRUNNER ERROR: ${err instanceof Error ? err.message : String(err)}`)
  exitCode = 1
} finally {
  // PG-25's lesson at a smaller scale: a script that leaves a temp directory
  // behind on every run leaves one behind on every run.
  rmSync(dir, { recursive: true, force: true })
}

process.exit(exitCode)
