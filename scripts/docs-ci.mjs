#!/usr/bin/env node
/**
 * The Documentation view, checked under the conditions it is actually deployed
 * in. `tickets/DOCS-6`.
 *
 *   pnpm docs:ci                     # every tab must render a real README
 *   pnpm docs:ci --negative-control  # with no README anywhere: every tab must fail
 *   pnpm docs:ci --from-head         # build the committed state, not the working tree
 *   pnpm docs:ci --shots <dir>       # PNG of every tab, both colour schemes
 *   pnpm docs:ci --keep              # leave the staged checkout on disk to poke at
 *   pnpm docs:ci --probe-overflow    # widen one block: the layout assertion must go red
 *
 * ## Why this is not `pnpm docs:check`
 *
 * `scripts/docs.mjs` is thorough, and it is structurally incapable of catching
 * the defect that put an error banner on **all ten** documentation tabs of the
 * live site: it runs here, on a disk where `../v-copy/` exists, and the defect
 * was a build-time glob that reached out of this repository into sibling
 * directories GitHub Actions does not check out. Everything about that bug is
 * invisible unless the siblings are gone, so this script's whole job is to make
 * them gone:
 *
 *   1. stage the playground the way `actions/checkout` does — this repository's
 *      files, alone, under a parent directory that contains nothing else;
 *   2. build it there with `GITHUB_ACTIONS=1`, which is also what flips the
 *      public `base` path and disables the sibling source aliases;
 *   3. serve that `dist/` and open every `#<library>/docs` tab in a real Chrome;
 *   4. require a rendered README on each one — and require it to have come from
 *      the *installed package*, since a pass that quietly read a sibling would
 *      be the original bug wearing a green tick.
 *
 * `node_modules` is symlinked in rather than copied: the packages are the one
 * thing CI genuinely has, and `npm pack` puts `README.md` in every tarball.
 *
 * ## The negative control
 *
 * `--negative-control` stages the same checkout with a `node_modules` whose
 * `@ozjsey` packages have every file **except** `README.md`. The fallback then
 * has nothing to find and every tab must go red; a run where any tab still
 * passes means this script is reading a README from somewhere it was never
 * supposed to look, and it exits non-zero saying so. Per BOARD.md: a gate that
 * cannot be shown failing is decoration.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp, launchChrome, newPage, sleep } from './lib/cdp.mjs'
import { waitForBoot } from './lib/boot.mjs'
import { freePort } from './lib/port.mjs'
import { libraryIds } from './docs/packages.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const NEGATIVE_CONTROL = process.argv.includes('--negative-control')
const KEEP = process.argv.includes('--keep')
/**
 * `--shots <dir>` writes a PNG of every tab's first screen, in both colour
 * schemes, named `<label>-<library>-<scheme>.png`.
 *
 * This app has one theme and no `prefers-color-scheme` rule anywhere, so the
 * two are expected to come out identical — which is itself worth having on
 * disk, because "we looked at both" and "there is only one" are different
 * claims and only one of them is true here.
 */
const SHOTS = (() => {
  const at = process.argv.indexOf('--shots')
  return at === -1 ? null : resolve(process.argv[at + 1] ?? 'screenshots.local')
})()
const SHOT_LABEL = (() => {
  const at = process.argv.indexOf('--label')
  return at === -1 ? 'docs' : (process.argv[at + 1] ?? 'docs')
})()
/** The repository name CI checks out into, which `vite.config.ts` bakes into `base`. */
const REPO_NAME = 'npm-portfolio-playground'
const BASE_PATH = `/${REPO_NAME}/`

/** Minimum characters of rendered README text for a tab to count as documented. */
const MIN_TEXT = 500

/**
 * Widths the rendered README is measured at.
 *
 * DOCS-6's third part says long lines must scroll *inside* the code block or
 * the table, never widen the page — a claim that is only testable where the
 * lines are longest relative to the column, which is a phone. 420 is narrower
 * than the 1080px breakpoint `src/styles.css` has, so it also exercises the
 * one-column layout; 1280 is the desktop the screenshots are taken at.
 */
const WIDTHS = [1280, 420]

/**
 * `--probe-overflow` widens one element inside the article before measuring, so
 * the overflow assertion below can be *shown* going red. Without it the check
 * is a number that has only ever been zero, which is indistinguishable from a
 * check that measures nothing.
 */
const PROBE_OVERFLOW = process.argv.includes('--probe-overflow')

// ---------------------------------------------------------------------------
// 1. Stage the checkout
// ---------------------------------------------------------------------------

/**
 * `--from-head` builds the **committed** state instead of the working tree.
 *
 * Which is what a deploy would actually publish if it ran right now, and
 * therefore the honest "before" for any fix that is not committed yet. It never
 * touches the working tree — `git archive` reads the object database, so this
 * can run beside uncommitted work (including other people's) without disturbing
 * a byte of it.
 */
const FROM_HEAD = process.argv.includes('--from-head')

/**
 * Exactly the files `actions/checkout` would land: everything git tracks, plus
 * anything new that is not ignored — so a fix sitting uncommitted in the tree
 * is tested, and a file that only exists because it is gitignored (`dist/`,
 * `node_modules/`, `*.local`) is not.
 */
function trackedFiles() {
  const out = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (out.status !== 0) throw new Error(`git ls-files failed in ${ROOT}: ${out.stderr}`)
  const files = out.stdout.split('\0').filter(Boolean)
  if (!files.length) throw new Error(`git ls-files listed nothing in ${ROOT}`)
  return files
}

/**
 * `<tmp>/…/npm-portfolio-playground/` with nothing beside it.
 *
 * The empty parent is the point, not an accident of using a temp directory:
 * `src/docs.ts`'s first glob is `../../*&#47;README.md`, so what the build can
 * see one level above the repository is the entire difference between this
 * machine and the runner.
 */
function stageCheckout() {
  const parent = mkdtempSync(join(tmpdir(), 'playground-ci-'))
  const dir = join(parent, REPO_NAME)
  mkdirSync(dir, { recursive: true })

  if (FROM_HEAD) {
    const archive = spawnSync('sh', ['-c', `git archive HEAD | tar -x -C ${JSON.stringify(dir)}`], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    if (archive.status !== 0) throw new Error(`git archive HEAD failed: ${archive.stderr}`)
    const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
    return { parent, dir, from: `git archive HEAD (${head.stdout.trim()})` }
  }

  for (const file of trackedFiles()) {
    const from = join(ROOT, file)
    if (!existsSync(from)) continue
    const to = join(dir, file)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to)
  }
  return { parent, dir, from: 'the working tree (tracked + unignored new files)' }
}

/**
 * The installed packages, reachable from the staged checkout.
 *
 * Normally one symlink. Under `--negative-control` it is a farm: every
 * top-level entry symlinked as-is, except `@ozjsey`, which is rebuilt package
 * by package with every file symlinked **but `README.md` left out**. The
 * packages still resolve and the app still builds — there is simply no
 * documentation to find, which is the condition the fallback has to fail on.
 */
function linkNodeModules(stagedDir, { withPackedReadmes }) {
  const real = join(ROOT, 'node_modules')
  const staged = join(stagedDir, 'node_modules')
  if (withPackedReadmes) {
    symlinkSync(real, staged, 'dir')
    return { removedReadmes: [] }
  }

  mkdirSync(staged)
  for (const entry of readdirSync(real)) {
    if (entry === '@ozjsey') continue
    symlinkSync(join(real, entry), join(staged, entry))
  }

  const scope = join(real, '@ozjsey')
  const stagedScope = join(staged, '@ozjsey')
  mkdirSync(stagedScope)
  const removedReadmes = []
  for (const pkg of readdirSync(scope)) {
    const stagedPkg = join(stagedScope, pkg)
    mkdirSync(stagedPkg)
    for (const entry of readdirSync(join(scope, pkg))) {
      if (entry === 'README.md') {
        removedReadmes.push(`node_modules/@ozjsey/${pkg}/README.md`)
        continue
      }
      symlinkSync(join(scope, pkg, entry), join(stagedPkg, entry))
    }
  }
  if (!removedReadmes.length) {
    throw new Error(
      'The negative control removed no READMEs, so it proves nothing: not one installed @ozjsey ' +
        'package has a README.md. Run `pnpm install` before trusting this script.',
    )
  }
  return { removedReadmes }
}

// ---------------------------------------------------------------------------
// 2. Build it the way the runner does
// ---------------------------------------------------------------------------

function buildStaged(stagedDir) {
  const vite = join(ROOT, 'node_modules/.bin/vite')
  if (!existsSync(vite)) throw new Error(`No vite at ${vite} — run pnpm install.`)
  const started = Date.now()
  const out = spawnSync(vite, ['build'], {
    cwd: stagedDir,
    encoding: 'utf8',
    // GITHUB_ACTIONS is the switch the app itself reads: it sets `base` to the
    // Pages path and turns every sibling-source alias off. PLAYGROUND_* are
    // cleared so a value exported in this shell cannot change what is built.
    env: {
      ...process.env,
      GITHUB_ACTIONS: '1',
      PLAYGROUND_TARGET: '',
      PLAYGROUND_UNALIAS: '',
    },
  })
  return {
    ok: out.status === 0,
    ms: Date.now() - started,
    output: `${out.stdout ?? ''}${out.stderr ?? ''}`.trim(),
  }
}

// ---------------------------------------------------------------------------
// 3. Serve it
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

/** Serves `dist/` under the deployed base path, so the built asset URLs resolve. */
function serveDist(distDir, port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0])
    const relative = path.startsWith(BASE_PATH) ? path.slice(BASE_PATH.length) : path.slice(1)
    const file = join(distDir, relative || 'index.html')
    if (!file.startsWith(distDir) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)))
}

// ---------------------------------------------------------------------------
// 4. Read every documentation tab out of the live page
// ---------------------------------------------------------------------------

/**
 * Deliberately the same shape `scripts/docs.mjs` reads, plus the source line.
 *
 * That line is the assertion that matters here: a tab can only be green if the
 * README it rendered came from `node_modules/@ozjsey/…`. Without it a staging
 * mistake that left a sibling reachable would report a clean run for exactly
 * the build that is broken in production.
 */
const READ_DOCS_VIEW = `(() => {
  const fatal = document.querySelector('.pg-fatal')
  if (fatal) return { fatal: fatal.textContent }
  const docs = document.querySelector('.docs')
  if (!docs) return { mounted: false }
  const article = docs.querySelector('article.md')
  const banner = docs.querySelector('.demo__banner--warn')
  const source = docs.querySelector('.docs__source')
  return {
    mounted: true,
    banner: banner ? banner.textContent.replace(/\\s+/g, ' ').trim() : null,
    source: source ? source.textContent.replace(/\\s+/g, ' ').trim() : null,
    text: article ? article.textContent.replace(/\\s+/g, ' ').trim().length : 0,
    headings: article ? article.querySelectorAll('h1,h2,h3,h4,h5,h6').length : 0,
    codeBlocks: article ? article.querySelectorAll('pre.md-pre > code').length : 0,
    tables: article ? article.querySelectorAll('table.md-table').length : 0,
  }
})()`

/**
 * One PNG per colour scheme, via CDP's own media emulation — the only way to
 * make a headless Chrome answer `prefers-color-scheme: light` without asking
 * the OS. Returns the paths written.
 *
 * The viewport, not the whole document: these READMEs run to 12,000 pixels and
 * a strip of one is no more reviewable than the file itself. What a spacing
 * judgement needs is the first screen — header, tab strip, the top of the
 * article — which is also what the reader gets when the tab opens.
 */
async function captureBothSchemes(cdp, page, id) {
  const written = []
  await page.setViewport(1280, 1800)
  await page.evaluate('window.scrollTo(0, 0)')
  for (const scheme of ['dark', 'light']) {
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: scheme }] },
      page.sessionId,
    )
    await sleep(250)
    const file = join(SHOTS, `${SHOT_LABEL}-${id}-${scheme}.png`)
    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      page.sessionId,
    )
    writeFileSync(file, Buffer.from(data, 'base64'))
    written.push(file)
  }
  await cdp.send('Emulation.setEmulatedMedia', { features: [] }, page.sessionId)
  return written
}

/**
 * Does the *page* scroll sideways?
 *
 * `scrollWidth > clientWidth` on the documentElement is the whole question: a
 * README with a 200-character code line is fine as long as the `<pre>` owns the
 * scrollbar, and broken the moment the body does, because then every paragraph
 * on the page moves when the reader drags it. Names the widest element inside
 * the article when it is broken, so the failure says which block to fix.
 */
const MEASURE_OVERFLOW = `(() => {
  const doc = document.documentElement
  const over = Math.round(doc.scrollWidth - doc.clientWidth)
  if (over <= 0) return { over: 0 }
  const article = document.querySelector('article.md')
  let worst = null
  for (const el of article ? article.querySelectorAll('*') : []) {
    const right = Math.round(el.getBoundingClientRect().right)
    if (!worst || right > worst.right) {
      worst = { right, tag: el.tagName.toLowerCase(), cls: String(el.className || '') }
    }
  }
  return { over, worst }
})()`

/**
 * The probe: one element too wide for any viewport, inside the article.
 *
 * The height is not decoration. The first cut of this probe set only a width,
 * and the control came back green on all ten tabs — Chrome leaves a zero-area
 * box out of the scrollable overflow region entirely, so a 4000px-wide, 0px-tall
 * div moves `scrollWidth` by nothing. A probe that cannot break the check is
 * the same defect as a check that cannot fail; it just hides one level down.
 */
const WIDEN = `(() => {
  const article = document.querySelector('article.md')
  if (!article) return false
  const probe = document.createElement('div')
  probe.style.width = '4000px'
  probe.style.height = '8px'
  probe.dataset.probe = 'overflow'
  article.prepend(probe)
  return article.querySelector('[data-probe]') !== null
})()`

/** Every width, measured. Restores the desktop viewport before it returns. */
async function measureOverflow(page) {
  const seen = []
  for (const width of WIDTHS) {
    await page.setViewport(width, 900)
    await sleep(150)
    if (PROBE_OVERFLOW) await page.evaluate(WIDEN)
    seen.push({ width, ...(await page.evaluate(MEASURE_OVERFLOW)) })
  }
  await page.setViewport(WIDTHS[0], 900)
  await sleep(100)
  return seen
}

function judge(id, view, overflows) {
  if (view.fatal) return [`the app refused to boot: ${view.fatal.slice(0, 300)}`]
  if (!view.mounted) return [`#${id}/docs rendered no .docs view at all`]
  if (view.banner) return [`rendered a reason, not a README: ${view.banner}`]

  const problems = []
  if (view.text < MIN_TEXT) problems.push(`rendered only ${view.text} characters of README text (min ${MIN_TEXT})`)
  if (!view.headings) problems.push('rendered no headings')
  if (!view.codeBlocks) problems.push('rendered no code blocks')
  if (!view.source?.includes(`node_modules/@ozjsey/${id}/README.md`)) {
    problems.push(
      `the source line does not name node_modules/@ozjsey/${id}/README.md — this build is not ` +
        `reading the published package. It says: ${JSON.stringify(view.source)}`,
    )
  }
  for (const { width, over, worst } of overflows ?? []) {
    if (over > 0) {
      problems.push(
        `the page scrolls sideways at ${width}px — ${over}px of horizontal overflow. Long lines ` +
          `must scroll inside their own block, never move the document. Widest element in the ` +
          `article: <${worst?.tag}${worst?.cls ? ` class="${worst.cls}"` : ''}> ending at ` +
          `${worst?.right}px.`,
      )
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const rule = (ch = '─') => ch.repeat(92)
let staged
let server
let chrome
let cdp
let failures = 0
let checked = 0
const shots = []

try {
  console.log(`\n${rule('═')}`)
  console.log(
    `Documentation under CI conditions${NEGATIVE_CONTROL ? '  —  NEGATIVE CONTROL' : ''}`,
  )
  console.log(rule('═'))

  staged = stageCheckout()
  const { removedReadmes } = linkNodeModules(staged.dir, { withPackedReadmes: !NEGATIVE_CONTROL })
  console.log(`Staged checkout   ${staged.dir}`)
  console.log(`                  from ${staged.from}`)
  console.log(
    `                  ${readdirSync(staged.parent).join(', ')} — that is everything beside it, ` +
      `so ../../*/README.md can match nothing`,
  )
  console.log(`node_modules      symlinked from ${join(ROOT, 'node_modules')}`)
  if (NEGATIVE_CONTROL) {
    console.log(`                  ${removedReadmes.length} @ozjsey README.md withheld:`)
    for (const path of removedReadmes) console.log(`                    − ${path}`)
  }

  const built = buildStaged(staged.dir)
  console.log(`\n${built.output}`)
  if (!built.ok) throw new Error(`vite build failed in the staged checkout (see above)`)

  const ids = libraryIds(staged.dir)
  const port = await freePort()
  server = await serveDist(join(staged.dir, 'dist'), port)
  const base = `http://127.0.0.1:${port}${BASE_PATH}`
  console.log(`\nServing the built dist at ${base}`)

  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  chrome = await launchChrome({ port: await freePort() })
  cdp = await Cdp.connect(chrome.wsUrl)
  const page = await newPage(cdp, base)
  const boot = await waitForBoot(page)
  if (boot.libraryFailures.length) {
    throw new Error(
      `${boot.libraryFailures.length} package(s) failed to load in the staged build: ` +
        boot.libraryFailures.map((f) => `${f.specifier} (${f.message})`).join('; '),
    )
  }

  console.log(`\n${ids.length} documentation tabs\n${rule()}`)
  for (const id of ids) {
    // Written, not navigated. `Page.navigate` to a URL that differs only in the
    // fragment is a same-document navigation: Chrome fires no load event, so
    // `page.navigate` spends its entire 20s budget waiting for one and then
    // proves the page is fine anyway — 200 seconds of sleeping across ten tabs,
    // during which a Chrome that dies looks exactly like a Chrome that is busy.
    // Assigning the hash is also the path a reader takes from a README link.
    await page.evaluate(`location.hash = ${JSON.stringify(`${id}/docs`)}`)
    await sleep(700)
    const view = await page.evaluate(READ_DOCS_VIEW)
    const overflows = await measureOverflow(page)
    const problems = judge(id, view, overflows)
    checked++
    if (SHOTS) {
      shots.push(...(await captureBothSchemes(cdp, page, `${id}-docs`)))
      // The cards view too: DOCS-6 moved the view switcher and the tab's notes
      // list, so "the documentation reads better now" is only half the claim.
      await page.evaluate(`location.hash = ${JSON.stringify(id)}`)
      await sleep(700)
      shots.push(...(await captureBothSchemes(cdp, page, `${id}-playground`)))
      await page.evaluate(`location.hash = ${JSON.stringify(`${id}/docs`)}`)
    }
    if (problems.length) failures++
    console.log(
      `${problems.length ? 'FAIL' : 'PASS'}  ${id.padEnd(24)}` +
        (problems.length
          ? ''
          : `${String(view.text).padStart(6)} chars · ${String(view.headings).padStart(3)} headings · ` +
            `${String(view.codeBlocks).padStart(3)} code blocks · ${String(view.tables).padStart(2)} tables · ` +
            `no page overflow at ${WIDTHS.join('/')}px`),
    )
    for (const problem of problems) console.log(`        ${problem}`)
  }
} catch (err) {
  failures++
  console.log(`\nRUNNER ERROR: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  cdp?.close()
  chrome?.proc.kill('SIGKILL')
  server?.close()
  if (staged && !KEEP) rmSync(staged.parent, { recursive: true, force: true })
  else if (staged) console.log(`\nStaged checkout kept at ${staged.dir}`)
}

if (shots.length) {
  console.log(`\n${shots.length} screenshots (dark + light emulation) under ${SHOTS}:`)
  for (const file of shots) console.log(`  ${file}`)
}

console.log(`\n${rule('═')}`)
if (NEGATIVE_CONTROL) {
  const satisfied = checked > 0 && failures >= checked
  console.log(
    satisfied
      ? `  NEGATIVE CONTROL SATISFIED — all ${checked} tabs went red with no README anywhere.\n` +
        `  The red output above is what this gate looks like when it catches DOCS-6.`
      : `  NEGATIVE CONTROL FAILED — ${checked - failures} of ${checked} tabs still rendered a README\n` +
        `  with every packed README withheld. This gate is reading documentation from somewhere it\n` +
        `  was never pointed at, and a green run from it means nothing.`,
  )
  console.log(rule('═'))
  process.exit(satisfied ? 0 : 1)
}

if (PROBE_OVERFLOW) {
  // Its own verdict, not the README one: in this mode every tab is *expected*
  // to be red, and it is red for the layout reason printed above it.
  const satisfied = checked > 0 && failures >= checked
  console.log(
    satisfied
      ? `  LAYOUT PROBE SATISFIED — all ${checked} tabs went red with one block made wider than the\n` +
        `  viewport. The horizontal-overflow assertion can fail, so its green run means something.`
      : `  LAYOUT PROBE FAILED — ${checked - failures} of ${checked} tabs still passed with a 4000px\n` +
        `  element inside the article. The overflow assertion is not measuring the page.`,
  )
  console.log(rule('═'))
  process.exit(satisfied ? 0 : 1)
}

console.log(
  failures
    ? `  ${failures} of ${checked} documentation tabs did NOT render a published README.\n` +
      `  This is what https://ozjsey.github.io${BASE_PATH} will look like.`
    : `  ${checked}/${checked} documentation tabs rendered the published README, with this\n` +
      `  repository checked out alone. Negative controls: pnpm docs:ci --negative-control\n` +
      `  (no README anywhere) and pnpm docs:ci --probe-overflow (one block too wide).`,
)
console.log(rule('═'))
process.exit(failures ? 1 : 0)
