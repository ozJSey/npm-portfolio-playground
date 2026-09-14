#!/usr/bin/env node
/**
 * Playground smoke test — zero dependencies beyond a local Chrome.
 *
 * Boots the dev server, renders every tab in headless Chrome, and fails if a
 * demo did not compile or a manifest entry has no file. Catches the two ways
 * this playground rots: a library's API changes under a demo, or a demo is
 * added to a manifest and never written.
 *
 *   pnpm smoke                          # uses a Chrome it can find
 *   pnpm smoke:dist                     # the built dist entries
 *   PORT=5300 pnpm smoke                # pin the dev server port (default: a free one)
 *   SMOKE_TIME_BUDGET=40000 pnpm smoke  # more virtual time per render
 *   SMOKE_CONCURRENCY=1 pnpm smoke      # render tabs one at a time
 *   CHROME_PATH=/path/to/chrome pnpm smoke
 *
 * ## PG-18: a run that finds nothing must not look like a run that passes
 *
 * Three things used to let that happen, and all three are now loud:
 *
 *   1. **The virtual-time budget was 9000ms.** Under load — and there are
 *      routinely half a dozen dev servers up on this machine at once — that is
 *      not enough, and on the dist target with editors open a focused
 *      equivalent needed 25000. Chrome does not complain when the budget runs
 *      out: it dumps whatever it has, which is an empty `#app`, which used to
 *      read as "0 cards, no error". The default is now 25000, it is printed in
 *      the header, and a tab that renders zero cards is re-rendered at double
 *      the budget so the report can say *which* of the two it was.
 *   2. **The denominator came from the page.** `tabs` was read out of the very
 *      DOM being judged, so a page that rendered nothing had nothing to fail.
 *      The tab list is now checked against `src/demos/*&#47;manifest.ts` on disk.
 *   3. **Port 5199 collides.** Every agent working here has been told to avoid
 *      it, which is a smell, not a workaround — and so is picking a different
 *      magic number. The port is now whatever the OS says is free, with
 *      `--strictPort` kept so the remaining race fails loudly rather than
 *      smoke-testing somebody else's server. See `scripts/lib/port.mjs`.
 *
 * PG-22: a library that fails to load no longer blanks every tab — it renders an
 * error card naming the package. This script fails the run on that, by name,
 * before it reports anything else.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readManifests } from './lib/manifests.mjs'
import { freePort, resolvePort } from './lib/port.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

/**
 * No default port at all.
 *
 * PG-18 filed "it defaults to 5199, which collides". A different magic number is
 * not the fix: when this was written 5174, 5199, 5212, 5233, 5241-5244, 5261,
 * 5277-5281, 5311-5333 and 5401-5413 were all in use on this machine by other
 * agents' runs. `PORT=` still pins one — and is now checked before Vite starts,
 * so a collision fails in a second by name instead of after a 30-second wait
 * that reads like a slow boot.
 */
const PORT = await resolvePort('Pass a different PORT, or unset it to get a free one automatically.')
const BASE = `http://localhost:${PORT}`
const TIME_BUDGET = Number(process.env.SMOKE_TIME_BUDGET ?? 25_000)
/**
 * Three headless Chromes at a time, not one and not six.
 *
 * Sequential took over ten minutes here, which is why raising the time budget
 * needed this alongside it. Four was enough to get the whole process killed
 * (exit 144, nineteen of twenty tabs reported, no summary) on a machine already
 * running half a dozen other agents' dev servers. `SMOKE_CONCURRENCY=1` is the
 * safe fallback when something is starving.
 */
const CONCURRENCY = Math.max(1, Number(process.env.SMOKE_CONCURRENCY ?? 3))
const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'source'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH to a Chrome/Chromium binary.')
  process.exit(2)
}

/**
 * One `--dump-dom` render. Async so several can be in flight: the wall time of
 * this command is dominated by compiling ~120 SFCs in the browser, and raising
 * the time budget (above) would otherwise have made an already slow gate slower.
 */
function render(url, budget = TIME_BUDGET) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--virtual-time-budget=${budget}`,
        '--dump-dom',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => (stdout += c))
    proc.stderr.on('data', (c) => (stderr += c))
    proc.on('error', reject)
    proc.on('close', (status) => {
      // An empty dump is not a rendered page with no cards on it — it is Chrome
      // having produced nothing at all, and it used to be indistinguishable
      // from a clean run with an empty tab.
      if (!stdout.trim()) {
        reject(
          new Error(
            `Chrome dumped an EMPTY DOM for ${url} (exit ${status}, budget ${budget}ms).\n` +
              `This is not "the page had no cards" — it is no page. Chrome said:\n${stderr.slice(-2000)}`,
          ),
        )
        return
      }
      resolve(stdout)
    })
  })
}

/** Run `jobs` with at most `CONCURRENCY` in flight, preserving input order. */
async function pool(items, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  return out
}

const strip = (html) => html.replace(/<[^>]+>/g, '').trim()

function analyse(html) {
  return {
    // `src/main.ts` paints this over the whole page and refuses to mount when a
    // boot assertion fails — a compiler/runtime mismatch (PG-14). Read first:
    // without it, that failure looks identical to "no tabs rendered".
    fatal: [...html.matchAll(/class="pg-fatal">(.*?)<\/pre>/gs)].map((m) => strip(m[1])),
    // PG-22. One line per package that did not load a usable public API.
    // `src/App.vue` renders these on EVERY tab precisely so this regex finds
    // them wherever the run happens to look first.
    libraryFailures: [...html.matchAll(/class="pg-library-failure" data-package="([^"]+)">(.*?)<\/p>/gs)].map(
      (m) => ({ specifier: m[1], message: strip(m[2]) }),
    ),
    errors: [...html.matchAll(/demo__banner--error">(.*?)<\/p>/gs)].map((m) => strip(m[1])),
    warnings: [...html.matchAll(/demo__banner--warn">(.*?)<\/p>/gs)].map((m) => strip(m[1])),
    sections: [...html.matchAll(/<section id="demo-([^"]+)"/g)].map((m) => m[1]),
    tabs: [...html.matchAll(/role="tab"[^>]*>([^<]*)<span class="tab__count">(\d+)</g)].map((m) => ({
      id: m[1].trim(),
      count: Number(m[2]),
    })),
    // Stamped on <html> by `src/main.ts`. The demos are compiled in the
    // browser, so these two versions being one version is a precondition for
    // every other line this script prints.
    compiler: html.match(/data-playground-compiler="([^"]+)"/)?.[1],
    runtime: html.match(/data-playground-runtime="([^"]+)"/)?.[1],
    libraryFailureCount: Number(html.match(/data-playground-library-failures="(\d+)"/)?.[1] ?? NaN),
    // Stamped after the app mounts. Its absence means the render stopped before
    // boot finished — a budget or a dev-server problem, NOT a package problem.
    booted: /data-playground-boot="complete"/.test(html),
  }
}

/**
 * Called when the page rendered nothing useful. `--dump-dom` cannot see the
 * console, and "the playground did not boot" reads exactly like "the dev server
 * is slow" — which cost half an hour the day a sibling package stopped
 * compiling (PG-22). So on failure, and only on failure, pay for a real CDP
 * session and print what the page actually threw.
 */
async function diagnose(url) {
  const lines = []
  try {
    const res = await fetch(`${BASE}/src/main.ts`)
    if (!res.ok) {
      lines.push(`GET /src/main.ts → ${res.status}. Vite could not transform the entry:`)
      lines.push((await res.text()).slice(0, 1500))
    }
  } catch (err) {
    lines.push(`GET /src/main.ts failed outright: ${err.message}`)
  }

  try {
    const { Cdp, launchChrome, newPage } = await import('./lib/cdp.mjs')
    // A free debugging port too: this only runs when something is already wrong,
    // and 'the diagnostic could not start because 9337 was taken' would be a
    // perfect example of the problem it exists to explain.
    const browser = await launchChrome({ port: await freePort() })
    const cdp = await Cdp.connect(browser.wsUrl)
    try {
      const page = await newPage(cdp, url)
      await sleep(4000)
      for (const err of page.pageErrors.slice(0, 5)) lines.push(`page error: ${err.split('\n')[0]}`)
      for (const err of page.consoleErrors.slice(0, 5)) lines.push(`console error: ${err.split('\n')[0]}`)
      if (!page.pageErrors.length && !page.consoleErrors.length) {
        lines.push('The page threw nothing at all — so this is a render-budget or dev-server problem,')
        lines.push(`not a code problem. Try SMOKE_TIME_BUDGET=${Math.max(TIME_BUDGET * 2, 50_000)}.`)
      }
    } finally {
      cdp.close()
      browser.proc.kill('SIGKILL')
    }
  } catch (err) {
    lines.push(`(could not attach a debugger to diagnose: ${err.message})`)
  }
  return lines
}

// The denominator, from disk. Read before Chrome is even launched — a page that
// renders nothing must still have something to be measured against (PG-18).
let manifests
let manifestlessDirs
try {
  ;({ manifests, manifestlessDirs } = readManifests(join(ROOT, 'src/demos')))
} catch (err) {
  console.error(`Could not read the demo manifests — ${err.message}`)
  console.error('Fix the manifest rather than letting the run report a made-up denominator.')
  process.exit(2)
}
const expectedTabs = new Map(manifests.map((m) => [m.id, m.demos.length]))

// Resolve the local binary rather than going through npx / pnpm exec, so the
// script behaves the same under any package manager.
const viteBin = join(ROOT, 'node_modules/.bin/vite')
const server = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

let failures = 0
let reported = 0
const fail = (line) => {
  failures++
  console.log(line)
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    await sleep(500)
    if (i === 59) throw new Error(`Dev server never came up on ${BASE}:\n${serverLog}`)
  }

  console.log(
    `Playground smoke — ${TARGET} target, ${BASE}, virtual-time budget ${TIME_BUDGET}ms, ` +
      `${CONCURRENCY} render(s) in flight`,
  )
  console.log(
    `Expecting ${expectedTabs.size} tabs / ${manifests.reduce((n, m) => n + m.demos.length, 0)} demos ` +
      `from src/demos/*/manifest.ts\n`,
  )

  const home = analyse(await render(BASE))
  if (home.fatal.length) {
    throw new Error(`The playground refused to boot:\n\n${home.fatal.join('\n\n')}\n\n${serverLog}`)
  }

  // PG-22, first: a package that did not load explains every other failure
  // below it, and used to be reported as "No library tabs rendered".
  if (home.libraryFailures.length) {
    for (const f of home.libraryFailures) {
      fail(`FAIL  LIBRARY DID NOT LOAD  ${f.specifier}\n        ${f.message.slice(0, 400)}`)
    }
    console.log(
      `        ↳ the other tabs still render; every demo on ${home.libraryFailures.length === 1 ? 'that tab is' : 'those tabs are'} ` +
        `replaced by an error card. Fix the package, or re-run with ` +
        `PLAYGROUND_UNALIAS=<dir> to resolve it from node_modules.\n`,
    )
  } else if (!Number.isNaN(home.libraryFailureCount) && home.libraryFailureCount > 0) {
    // Belt and braces: the count on <html> and the rendered cards disagreeing
    // is itself a defect, and silently trusting the smaller number is how a
    // gate stops gating.
    fail(
      `FAIL  <html data-playground-library-failures="${home.libraryFailureCount}"> but no failure card ` +
        `rendered. src/App.vue and src/libraries.ts disagree.`,
    )
  }

  if (!home.booted) {
    const lines = await diagnose(BASE)
    throw new Error(
      `The page never finished booting — <html data-playground-boot> is not "complete".\n` +
        `src/main.ts stamps it after the app mounts, so this is "the render stopped early", not ` +
        `"a package failed": a package that fails still boots and reports itself by name.\n\n` +
        `${lines.join('\n')}\n\n${serverLog}`,
    )
  }
  if (!home.tabs.length) {
    const lines = await diagnose(BASE)
    throw new Error(
      `No library tabs rendered at all — the page is blank.\n` +
        `${expectedTabs.size} tabs exist on disk (${[...expectedTabs.keys()].join(' ')}).\n\n` +
        `${lines.join('\n')}\n\n${serverLog}`,
    )
  }

  // PG-14. Every demo on every tab below is compiled in the browser; if the
  // compiler is not the runtime's own version, a directive inside a `v-for`
  // never receives `updated` and every PASS printed after this line is worth
  // less than it looks. `src/main.ts` already refuses to mount on a mismatch —
  // this is the same claim asserted from outside the page.
  if (!home.compiler || !home.runtime) {
    throw new Error(
      'The page did not stamp data-playground-compiler / data-playground-runtime on <html>. ' +
        'src/main.ts sets them before mounting — did it fail earlier than the fatal panel?',
    )
  }
  if (home.compiler !== home.runtime) {
    throw new Error(
      `SFC compiler ${home.compiler} but Vue runtime ${home.runtime}. See src/sfc/versions.ts.`,
    )
  }
  console.log(`Vue ${home.runtime} — compiler and runtime agree (PG-14 guard)`)

  // PG-18. The page is not allowed to choose its own denominator. A tab that
  // exists on disk and did not render is a failure, and it is named.
  const rendered = new Map(home.tabs.map((t) => [t.id, t.count]))
  for (const [id, count] of expectedTabs) {
    if (!rendered.has(id)) {
      fail(`FAIL  ${id.padEnd(24)} tab did not render at all (src/demos/${id}/manifest.ts lists ${count} demos)`)
    } else if (rendered.get(id) !== count) {
      fail(`FAIL  ${id.padEnd(24)} tab claims ${rendered.get(id)} demos, the manifest lists ${count}`)
    }
  }
  for (const id of rendered.keys()) {
    if (!expectedTabs.has(id)) fail(`FAIL  ${id.padEnd(24)} tab rendered but has no src/demos/${id}/manifest.ts`)
  }
  if (manifestlessDirs.length) {
    console.log(`      note: src/demos/ folders with no manifest.ts (no tab yet): ${manifestlessDirs.join(' ')}`)
  }

  const tabs = home.tabs
  console.log(`Found ${tabs.length} libraries, ${tabs.reduce((n, t) => n + t.count, 0)} demos\n`)

  const report = async (tab, url, label, expectSections) => {
    let a = analyse(await render(url))
    let note = ''
    // PG-18's core symptom. Zero cards where cards are expected is either a
    // real compile failure or an exhausted budget, and those used to print the
    // same nothing. Re-render at double the budget and say which it was.
    if (expectSections && !a.sections.length) {
      const doubled = TIME_BUDGET * 2
      a = analyse(await render(url, doubled))
      note = a.sections.length
        ? ` — RENDERED ONLY AT ${doubled}ms: the ${TIME_BUDGET}ms budget is too low on this machine, ` +
          `raise SMOKE_TIME_BUDGET`
        : ` — still 0 cards at ${doubled}ms, so this is not the time budget`
    }
    const ok = a.errors.length === 0 && (!expectSections || a.sections.length === tab.count) && !note
    if (!ok) failures++
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${tab.id.padEnd(24)} ${label.padEnd(13)} ` +
        (expectSections ? `${a.sections.length}/${tab.count} demos` : '') +
        note,
    )
    for (const err of a.errors) console.log(`        error: ${err.slice(0, 200)}`)
    for (const warn of a.warnings) console.log(`        warn:  ${warn.slice(0, 200)}`)
    reported++
    return a
  }

  await pool(tabs, (tab) => report(tab, `${BASE}/#${tab.id}`, 'rendered', true))

  // Second pass: every card with its editor open (?editors=open). Catches
  // failures that only occur when CodeMirror instantiates — e.g. a second
  // copy of @codemirror/state breaking extension `instanceof` checks
  // ("Unrecognized extension value in extension set").
  console.log('')
  await pool(tabs, (tab) => report(tab, `${BASE}/?editors=open#${tab.id}`, 'editors open', true))

  // Every tab, twice. A run that reported fewer lines than it promised has been
  // cut short — and "fewer PASS lines than expected" is precisely the shape of
  // failure this command was rewritten to stop printing silently.
  if (reported !== tabs.length * 2) {
    fail(`FAIL  only ${reported} of ${tabs.length * 2} tab renders reported — the run was cut short.`)
  }
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : err}`)
  failures++
} finally {
  server.kill('SIGTERM')
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll tabs rendered clean.')
process.exit(failures ? 1 : 0)
