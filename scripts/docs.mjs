#!/usr/bin/env node
/**
 * Documentation gate — the docs view checked the way a demo card is checked.
 *
 * Owner, 2026-09-13: *"We can treat documentation as smoke test too."*
 * `tickets/DOCS-3`, and `tickets/_STANDARDS.md` #6.
 *
 * `Documentation.vue` renders each package's own `README.md`, and until this
 * script existed nothing verified any of it. That matters here more than it
 * would elsewhere: the most expensive defects this repo shipped in a month were
 * READMEs asserting behaviour the code does not have — a `clipboard.writeText`
 * recipe that rejects in Chrome, two upload recipes that were copy-paste broken
 * (`Bearer undefined`; `_ctx.fetch is not a function`), three documented
 * exports that exist nowhere. Every one was found by a person reading
 * carefully. None by a gate.
 *
 *   pnpm docs:check                      # sources (picks a free port; PORT= pins one)
 *   pnpm docs:check:dist                 # the built dist entries — the npm reader's view
 *   ONLY=v-dropzone pnpm docs:check      # one package
 *   DOCS_NET=0 pnpm docs:check           # skip every outbound HTTP request
 *   DOCS_PACK=0 pnpm docs:check          # skip `npm pack`
 *
 * Five checks, per package, per `tickets/DOCS-3`:
 *
 *   render    the tab's Documentation view mounts, and the code blocks on
 *             screen are byte-for-byte the ones in the file
 *   samples   every fenced block that declares a runnable language compiles
 *             through the playground's own SFC compiler, inside the page
 *   links     anchors, relative paths, the live-site tab and card, and HTTP
 *   tarball   `npm pack` really packs the README, and packs *this* README
 *   claims    names the README documents as API exist in the package source
 *
 * **What a block declares, and what an undeclared block means.** The fence's
 * language word is the declaration and there is no second marker: ```` ```vue ````
 * is compiled as an SFC, ```` ```ts ```` as a TypeScript module, and ```` ```text ````
 * / ```` ```bash ```` / ```` ```json ```` are prose that happens to be monospaced.
 * A block with **no** language word is reported (`UNDECLARED_BLOCK`), never
 * silently skipped — silently skipping is how a gate stops gating, and "it had
 * no language tag" is indistinguishable from "nobody checked it".
 *
 * Exit code is driven by `error` findings only. `warn` findings are printed in
 * full and counted per package — DOCS-3 asks for findings per package, not for
 * one aggregated verdict, and the advisory classes (a sample that reads an
 * undeclared name, a link nobody can reach from this machine, a file linked but
 * not packed) are real and are not build breakers.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { Cdp, launchChrome, newPage } from './lib/cdp.mjs'
import { waitForBoot } from './lib/boot.mjs'
import { freePort, resolvePort } from './lib/port.mjs'
import { extractReadme } from './docs/extract.mjs'
import { docsPackages, libraryIds } from './docs/packages.mjs'
import { checkLinks } from './docs/links.mjs'
import { checkTarball, unshippedLinks } from './docs/tarball.mjs'
import { checkClaims } from './docs/claims.mjs'
import { classifyBlock } from './docs/classify.mjs'
import { runNegativeControl } from './docs/negative-control.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const REPO = resolve(ROOT, '..')
/**
 * No default port. PG-18, and `scripts/lib/port.mjs`: several agents run this
 * repo at once and every one of them starts a Vite server, so any fixed number
 * is a collision waiting to happen. `PORT=` still pins one, checked first.
 */
const PORT = await resolvePort('Pass a different PORT, or unset it to get a free one automatically.')
const BASE = `http://localhost:${PORT}`
const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'source'
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null
const NETWORK = process.env.DOCS_NET !== '0'
const PACK = process.env.DOCS_PACK !== '0'
const NET_TIMEOUT = Number(process.env.DOCS_NET_TIMEOUT ?? 12000)

const finding = (severity, code, message, line) => ({ severity, code, message, line })

// ---------------------------------------------------------------------------
// Page side
// ---------------------------------------------------------------------------

/**
 * Reads the Documentation view back out of the live DOM.
 *
 * The two things this must distinguish, because DOCS-3 item 1 turns on it: a
 * README that rendered, and a tab that is simply blank. `Documentation.vue`
 * renders a stated reason when `readmeFor()` returns `null`, so "no article and
 * a warn banner" is a missing README and "no article and no banner" is a view
 * that failed to mount at all.
 */
const READ_DOCS_VIEW = `(() => {
  const fatal = document.querySelector('.pg-fatal')
  if (fatal) return { fatal: fatal.textContent }
  const docs = document.querySelector('.docs')
  if (!docs) return { mounted: false }
  const article = docs.querySelector('article.md')
  const banner = docs.querySelector('.demo__banner--warn')
  return {
    mounted: true,
    banner: banner ? banner.textContent.replace(/\\s+/g, ' ').trim() : null,
    text: article ? article.textContent.replace(/\\s+/g, ' ').trim().length : 0,
    headings: article ? article.querySelectorAll('h1,h2,h3,h4,h5,h6').length : 0,
    links: article ? article.querySelectorAll('a.md-a').length : 0,
    codeBlocks: article
      ? [...article.querySelectorAll('pre.md-pre > code')].map((c) => c.textContent)
      : [],
  }
})()`

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const ids = libraryIds(ROOT)
const packages = docsPackages(REPO, ROOT).filter((pkg) => !ONLY || ONLY.test(pkg.dir))
if (!packages.length) {
  console.error(`No packages matched${ONLY ? ` ONLY=${process.env.ONLY}` : ''}.`)
  process.exit(2)
}

const viteBin = join(ROOT, 'node_modules/.bin/vite')
const server = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

const reports = []
let chrome
let cdp

try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {
      /* not up yet */
    }
    await sleep(500)
    if (i === 79) throw new Error(`Dev server never came up:\n${serverLog}`)
  }

  chrome = await launchChrome({ port: process.env.CDP_PORT ? Number(process.env.CDP_PORT) : await freePort() })
  cdp = await Cdp.connect(chrome.wsUrl)
  const page = await newPage(cdp, BASE)

  // Waited on, not slept through (PG-22). Since each library loads via its own
  // dynamic `import()`, `LIBRARY_MODULES` — which every MISSING_EXPORT finding
  // below is measured against — is populated asynchronously. A fixed sleep that
  // lost the race would report every sample in the corpus as importing a name
  // its package does not export, which is a spectacular false failure.
  const boot = await waitForBoot(page, { serverLog })
  if (boot.libraryFailures.length) {
    throw new Error(
      `${boot.libraryFailures.length} package(s) failed to load, so every sample that imports one ` +
        `would be reported as importing a name it does not export: ` +
        boot.libraryFailures.map((f) => `${f.specifier} (${f.message})`).join('; '),
    )
  }

  // PG-14, same guard as smoke and interactions: the samples below are compiled
  // by the in-browser compiler, and a compiler that is not the runtime's own
  // version compiles different code from the one a reader would get.
  if (!boot.versions.matches) {
    throw new Error(
      `SFC compiler ${boot.versions.compiler} but Vue runtime ${boot.versions.runtime}. ` +
        `See src/sfc/versions.ts.`,
    )
  }
  /**
   * The card index, read out of the running app rather than re-derived here
   * (DOCS-4). `links.mjs` checks every `#<tab>/<card>` a README publishes
   * against this, so the writer and the router are compared against one list.
   */
  const cards = await page.evaluate('window.__PLAYGROUND_CARDS__ ?? null')
  if (!cards) {
    throw new Error(
      'window.__PLAYGROUND_CARDS__ is unset — src/main.ts publishes it from src/registry.ts. ' +
        'Without it every card deep link in every README would be reported as unchecked.',
    )
  }
  const hook = await page.evaluate('typeof window.__PLAYGROUND_DOC_SAMPLE__')
  if (hook !== 'function') {
    throw new Error(
      'window.__PLAYGROUND_DOC_SAMPLE__ is not installed — src/main.ts sets it from ' +
        'src/doc-sample.ts. Without it nothing here compiles a single sample.',
    )
  }
  // The runner decides which blocks to send; the page decides which it can
  // compile. Two lists, one truth — assert they are the same one.
  const pageLangs = await page.evaluate(
    'JSON.parse(JSON.stringify(window.__PLAYGROUND_DOC_SAMPLE__({ code: "", lang: "__probe__", id: "probe" })))',
  )
  if (pageLangs.kind !== 'unsupported') {
    throw new Error(`src/doc-sample.ts claims to compile "__probe__" — the language sets have drifted.`)
  }

  console.log(`\nDocumentation gate — ${TARGET} target, ${BASE}`)
  console.log(`Vue ${boot.versions.runtime} — compiler and runtime agree (PG-14 guard)`)
  console.log(
    `${packages.length} package(s), ${ids.length} playground tabs; ` +
      `network ${NETWORK ? 'on' : 'off'}, npm pack ${PACK ? 'on' : 'off'}`,
  )

  /**
   * Before anything is checked, the checker is checked. DOCS-3 asks for a
   * negative control; this runs it every time rather than once, so the summary
   * below cannot be green unless the gate has just gone red on documentation
   * known to be wrong — including the four defects the ticket names.
   */
  const control = await runNegativeControl(page, {
    repoRoot: REPO,
    playgroundDir: ROOT,
    libraryIds: ids,
    cards,
    // Deliberately not a real directory — see negative-control.mjs.
    pkgDir: join(ROOT, 'scripts/docs/__no_such_package__'),
  })
  if (control.failures.length) {
    throw new Error(
      `Negative control FAILED — ${control.failures.length} of ${control.ran} deliberately broken ` +
        `samples did not trip this gate. Nothing below can be trusted; a gate that cannot be ` +
        `shown failing is decoration.\n\n` +
        control.failures.map((f) => `  • ${f}`).join('\n'),
    )
  }
  console.log(
    `Negative control: ${control.ran}/${control.ran} — every deliberately broken sample was ` +
      `caught, and the two correct ones were not\n`,
  )

  for (const pkg of packages) {
    reports.push(await checkPackage(pkg, page, cards))
  }

  for (const err of page.pageErrors) {
    reports.push({
      dir: '(page)',
      findings: [finding('error', 'PAGE_EXCEPTION', err.split('\n')[0])],
      stats: {},
    })
  }
} catch (err) {
  reports.push({
    dir: '(runner)',
    findings: [finding('error', 'BOOT', err instanceof Error ? err.message : String(err))],
    stats: {},
  })
} finally {
  cdp?.close()
  chrome?.proc.kill('SIGKILL')
  server.kill('SIGTERM')
}

// ---------------------------------------------------------------------------
// Per package
// ---------------------------------------------------------------------------

async function checkPackage(pkg, page, cards) {
  const findings = []
  const stats = { blocks: 0, compiled: 0, links: 0, external: 0 }

  if (!pkg.readmePath) {
    findings.push(
      finding(
        'error',
        'NO_README',
        `${pkg.dir}/README.md does not exist. Every published package owes one ` +
          `(tickets/_STANDARDS.md) — and the Documentation view renders nothing without it.`,
      ),
    )
    return { ...pkg, findings, stats }
  }

  const text = readFileSync(pkg.readmePath, 'utf8')
  const readme = extractReadme(text, { file: `${pkg.dir}/README.md` })
  stats.blocks = readme.blocks.length
  stats.links = readme.links.length
  stats.headings = readme.headings.length
  stats.lines = readme.lines.length

  // --- 1. it renders ------------------------------------------------------
  findings.push(...(await checkRender(pkg, readme, page)))

  // --- 2. the samples compile --------------------------------------------
  const samples = await checkSamples(pkg, readme, page)
  findings.push(...samples.findings)
  stats.runnable = samples.runnable
  stats.compiled = samples.compiled

  // --- 3. the links resolve ----------------------------------------------
  const links = await checkLinks(readme, {
    readmePath: pkg.readmePath,
    libraryId: pkg.libraryId,
    repoRoot: REPO,
    libraryIds: ids,
    cards,
    network: NETWORK,
    timeoutMs: NET_TIMEOUT,
  })
  findings.push(...links.findings)
  stats.external = links.externalCount

  // --- 4. the tarball ships this README ----------------------------------
  if (PACK) {
    const packed = checkTarball(join(REPO, pkg.dir), pkg.readmePath)
    findings.push(...packed.findings)
    findings.push(...unshippedLinks(readme, packed.entries))
    stats.packed = packed.entries.length
  }

  // --- 5. the claims exist in the source ---------------------------------
  // The package's own tab counts as source: a claim demonstrated by a demo card
  // is demonstrated, which is what DOCS-3 item 4 actually asks for.
  const claims = checkClaims(
    readme,
    join(REPO, pkg.dir),
    pkg.libraryId ? [join(ROOT, 'src/demos', pkg.libraryId)] : [],
  )
  findings.push(...claims.findings)
  stats.claims = claims.checked

  return { ...pkg, findings, stats }
}

/**
 * DOCS-3 item 1 — *"a package whose README is missing, unreadable, or renders
 * empty is a failure, not a blank tab."*
 *
 * And one step past that: the code blocks on screen are compared with the code
 * blocks in the file. `src/markdown.ts` is a hand-written renderer against a
 * corpus that keeps changing; a block it drops, truncates or splits is a
 * documentation defect that only shows up on the rendered page, which is
 * exactly the artifact nobody was checking.
 */
async function checkRender(pkg, readme, page) {
  if (!pkg.libraryId) {
    return [
      finding(
        'warn',
        'NO_DOCS_VIEW',
        `no playground tab, so the Documentation view cannot render this README at all. ` +
          `tickets/_STANDARDS.md #5 allows the exemption for something a browser tab cannot ` +
          `honestly host, and still owes the docs view.`,
      ),
    ]
  }

  await page.navigate(`${BASE}/?docs=${pkg.dir}#${pkg.libraryId}/docs`)
  await sleep(1600)
  const view = await page.evaluate(READ_DOCS_VIEW)

  if (view.fatal) return [finding('error', 'DOCS_FATAL', `the app refused to boot: ${view.fatal.slice(0, 400)}`)]
  if (!view.mounted) {
    return [
      finding(
        'error',
        'DOCS_NOT_MOUNTED',
        `#${pkg.libraryId}/docs rendered no .docs view — the Documentation tab is dead for ` +
          `this package.`,
      ),
    ]
  }
  if (view.banner) return [finding('error', 'DOCS_EMPTY', `the view rendered a reason, not a README: ${view.banner}`)]
  if (!view.text) {
    return [finding('error', 'DOCS_EMPTY', `#${pkg.libraryId}/docs rendered an empty article.`)]
  }

  const findings = []
  if (view.headings === 0) {
    findings.push(finding('warn', 'DOCS_NO_HEADINGS', `rendered ${view.text} characters and not one heading.`))
  }

  const onScreen = view.codeBlocks
  if (onScreen.length !== readme.blocks.length) {
    findings.push(
      finding(
        'error',
        'DOCS_BLOCK_COUNT',
        `the file has ${readme.blocks.length} fenced blocks; the rendered page shows ` +
          `${onScreen.length}. src/markdown.ts is dropping or merging blocks.`,
      ),
    )
  }
  for (let i = 0; i < Math.min(onScreen.length, readme.blocks.length); i++) {
    const block = readme.blocks[i]
    if (onScreen[i] === block.code) continue
    findings.push(
      finding(
        'error',
        'DOCS_BLOCK_DRIFT',
        `block ${i + 1} renders differently from the file — the page is not showing what this ` +
          `run checked.`,
        block.startLine,
      ),
    )
  }

  const realLinks = readme.links.filter((link) => !link.malformed && !link.image)
  if (view.links < realLinks.length) {
    findings.push(
      finding(
        'warn',
        'DOCS_LINK_COUNT',
        `the file has ${realLinks.length} links; ${view.links} rendered as anchors. The rest are ` +
          `visible as text and click nowhere.`,
      ),
    )
  }

  return findings
}

/**
 * DOCS-3 item 3 — the one that pays.
 *
 * Every block goes one of three ways and is *reported* either way: compiled
 * (runnable language), skipped-because-prose (declared language that is not
 * code we can run), or reported as undeclared. The block text is handed to the
 * page verbatim, straight out of `extractReadme`, so there is no second copy of
 * any sample anywhere in this repository.
 */
async function checkSamples(pkg, readme, page) {
  const findings = []
  let runnable = 0
  let compiled = 0

  for (const block of readme.blocks) {
    const at = `${pkg.dir}/README.md:${block.startLine}`

    const verdict = classifyBlock(block)
    findings.push(...verdict.findings)
    if (!verdict.runnable) continue

    runnable++
    const report = await page.evaluate(
      `JSON.parse(JSON.stringify(window.__PLAYGROUND_DOC_SAMPLE__(${JSON.stringify({
        code: block.code,
        lang: block.lang,
        id: at,
      })})))`,
    )
    const errors = report.findings.filter((f) => f.severity === 'error')
    if (!errors.length) compiled++
    for (const f of report.findings) {
      findings.push(finding(f.severity, f.code, `[${block.lang}] ${f.message}`, block.startLine))
    }
  }

  return { findings, runnable, compiled }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const rule = (ch = '─') => ch.repeat(92)
const bySeverity = (list, severity) => list.filter((f) => f.severity === severity)

let errorTotal = 0
let warnTotal = 0
let renderedPackages = 0

console.log(`\n${rule('═')}`)
console.log('PER PACKAGE')
console.log(rule('═'))

for (const report of reports) {
  const errors = bySeverity(report.findings, 'error')
  const warns = bySeverity(report.findings, 'warn')
  errorTotal += errors.length
  warnTotal += warns.length
  if (report.readmePath && !errors.some((f) => f.code.startsWith('DOCS_') || f.code === 'NO_README')) {
    renderedPackages++
  }

  const { stats = {} } = report
  const head = errors.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS'
  console.log(
    `\n${head}  ${report.dir.padEnd(24)} ${report.libraryId ? `#${report.libraryId}/docs` : 'no tab'}`,
  )
  if (stats.lines) {
    console.log(
      `      README ${stats.lines} lines · ${stats.blocks} fenced blocks ` +
        `(${stats.compiled}/${stats.runnable} runnable compiled) · ${stats.headings} headings · ` +
        `${stats.links} links (${stats.external} external)` +
        (stats.packed === undefined ? '' : ` · ${stats.packed} files packed`) +
        (stats.claims === undefined ? '' : ` · ${stats.claims} claims checked`),
    )
  }
  for (const f of [...errors, ...warns]) {
    const where = f.line ? `:${f.line}` : ''
    console.log(`      ${f.severity === 'error' ? 'ERROR' : 'warn '} ${f.code}${where}`)
    for (const line of wrap(f.message, 10)) console.log(line)
  }
}

function wrap(message, indent) {
  const pad = ' '.repeat(indent)
  const words = String(message).split(/\s+/)
  const lines = []
  for (const word of words) {
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 88) lines.push(pad + word)
    else lines[lines.length - 1] += ` ${word}`
  }
  return lines
}

const withReadme = reports.filter((r) => r.readmePath).length
const real = reports.filter((r) => r.dir !== '(page)' && r.dir !== '(runner)')
const totalBlocks = real.reduce((n, r) => n + (r.stats?.blocks ?? 0), 0)
const totalRunnable = real.reduce((n, r) => n + (r.stats?.runnable ?? 0), 0)
const totalCompiled = real.reduce((n, r) => n + (r.stats?.compiled ?? 0), 0)

console.log(`\n${rule('═')}`)
console.log(
  `  ${real.length} package(s) checked — ${withReadme} with a README, ${renderedPackages} whose ` +
    `documentation view rendered`,
)
console.log(
  `  ${totalCompiled}/${totalRunnable} runnable code samples compiled, out of ${totalBlocks} fenced blocks`,
)
console.log(`  ${errorTotal} error(s), ${warnTotal} advisory finding(s)`)
if (!NETWORK) console.log('  DOCS_NET=0 — external links were NOT requested.')
if (!PACK) console.log('  DOCS_PACK=0 — no tarball was packed; the npm copy is UNVERIFIED.')
if (ONLY) console.log(`  Filtered run (ONLY=${process.env.ONLY}); the counts above are partial.`)
console.log(rule('═'))

process.exit(errorTotal ? 1 : 0)
