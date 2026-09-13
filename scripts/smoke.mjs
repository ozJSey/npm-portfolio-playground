#!/usr/bin/env node
/**
 * Playground smoke test — zero dependencies.
 *
 * Boots the dev server, renders every tab in headless Chrome, and fails if a
 * demo did not compile or a manifest entry has no file. Catches the two ways
 * this playground rots: a library's API changes under a demo, or a demo is
 * added to a manifest and never written.
 *
 *   npm run smoke                      # uses a Chrome it can find
 *   CHROME_PATH=/path/to/chrome npm run smoke
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.PORT ?? 5199)
const BASE = `http://localhost:${PORT}`

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

function render(url) {
  const { stdout, status } = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=9000',
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (status !== 0 && !stdout) throw new Error(`Chrome exited with ${status} for ${url}`)
  return stdout
}

const strip = (html) => html.replace(/<[^>]+>/g, '').trim()

function analyse(html) {
  return {
    // `src/main.ts` paints this over the whole page and refuses to mount when a
    // boot assertion fails — a compiler/runtime mismatch (PG-14) or a package
    // whose built entry did not load a usable directive (PG-15). Read first:
    // without it, both failures look identical to "no tabs rendered".
    fatal: [...html.matchAll(/class="pg-fatal">(.*?)<\/pre>/gs)].map((m) => strip(m[1])),
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
  }
}

// Resolve the local binary rather than going through npx / pnpm exec, so the
// script behaves the same under any package manager.
const viteBin = new URL('../node_modules/.bin/vite', import.meta.url).pathname
const server = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

let failures = 0
try {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    await sleep(500)
    if (i === 39) throw new Error(`Dev server never came up:\n${serverLog}`)
  }

  const home = analyse(render(BASE))
  if (home.fatal.length) {
    throw new Error(`The playground refused to boot:\n\n${home.fatal.join('\n\n')}\n\n${serverLog}`)
  }
  if (!home.tabs.length) throw new Error(`No library tabs rendered:\n${serverLog}`)

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

  const tabs = home.tabs
  console.log(`Found ${tabs.length} libraries, ${tabs.reduce((n, t) => n + t.count, 0)} demos\n`)

  for (const tab of tabs) {
    const { errors, warnings, sections } = analyse(render(`${BASE}/#${tab.id}`))
    const ok = errors.length === 0 && sections.length === tab.count
    if (!ok) failures++

    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${tab.id.padEnd(20)} ${sections.length}/${tab.count} demos rendered`,
    )
    for (const err of errors) console.log(`        error: ${err.slice(0, 200)}`)
    for (const warn of warnings) console.log(`        warn:  ${warn.slice(0, 200)}`)
  }

  // Second pass: every card with its editor open (?editors=open). Catches
  // failures that only occur when CodeMirror instantiates — e.g. a second
  // copy of @codemirror/state breaking extension `instanceof` checks
  // ("Unrecognized extension value in extension set").
  console.log('')
  for (const tab of tabs) {
    const { errors } = analyse(render(`${BASE}/?editors=open#${tab.id}`))
    const ok = errors.length === 0
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${tab.id.padEnd(20)} editors open`)
    for (const err of errors) console.log(`        error: ${err.slice(0, 200)}`)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  failures++
} finally {
  server.kill('SIGTERM')
}

console.log(failures ? `\n${failures} tab(s) failed.` : '\nAll tabs rendered clean.')
process.exit(failures ? 1 : 0)
