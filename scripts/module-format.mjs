#!/usr/bin/env node
/**
 * Is every library the browser loads actually ESM? (PG-26)
 *
 *   pnpm modules
 *
 * ## The failure this exists to catch
 *
 * `@ozjsey/bigdecimal-string@1.1.0` shipped `format: ["cjs"]` only, so
 * `vite.config.ts` grew a CI-only alias pointing the specifier straight at a
 * file, "until the next patch". The patch landed — 1.2.0 ships a correct
 * `exports` map with an `import` condition — and the alias stayed. Worse, it
 * had always pointed at `dist/index.min.js`, the **CJS** build, while calling
 * itself "its published ESM file" in the comment right above.
 *
 * Because every `@ozjsey/*` specifier is in `optimizeDeps.exclude`, Vite never
 * prebundles them: that CJS file went to the browser verbatim, hit
 * `module.exports`, and threw `ReferenceError: module is not defined`. Eleven
 * demos rendered as error cards on the live documentation site, and the daily
 * workflow failed on every scheduled run from 2026-09-18 onward.
 *
 * `pnpm smoke` passed the whole time — locally it aliases every specifier to
 * the sibling TypeScript source, so the published artifact was never loaded.
 * `pnpm test:npm` passed too: it imports each package under **Node** ESM,
 * where `exports.import` is honoured and the CJS build is never reached.
 *
 * So the defect was not in a package. It was in the resolution config, and it
 * was only observable in a browser, under npm resolution. That is exactly the
 * intersection this gate covers and nothing else did.
 *
 * ## What it asserts
 *
 * The dev server is booted with npm resolution forced on (`GITHUB_ACTIONS=1`,
 * which is what disables the source aliases), then for every library in
 * `LIBRARIES`:
 *
 *   1. the specifier resolves **from node_modules**, not from a sibling — a
 *      source alias would make the whole run vacuous;
 *   2. the installed version is the one `package.json` declares, or the gate
 *      refuses to report at all rather than certifying an artifact we do not
 *      ship;
 *   3. the module Vite hands the browser parses as ESM and carries no CJS
 *      marker — `module.exports`, bare `exports.x`, `require(`, `__dirname`.
 *
 * Every library must be reached. A tab that silently drops out of `LIBRARIES`
 * cannot make this pass by shrinking the denominator.
 *
 * ## The detector checks itself, every run
 *
 * A format detector that answers "ESM" to everything would pass this suite
 * forever. So before asserting anything, the gate feeds it each package's own
 * CJS build — the real `dist/index.min.js` files, fetched through the same
 * server — and requires every one to be REJECTED. If the control passes where
 * it must fail, the run aborts with exit 2 and reports nothing, on the house
 * rule that a gate which cannot trust its own result says so instead of
 * printing a number.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { resolvePort } from './lib/port.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = await resolvePort(process.env.PLAYGROUND_PORT)
// `base` follows GITHUB_ACTIONS, which is forced on for the spawned server
// below, so it must be spelled the same way here. The served import URLs are
// absolute and already carry it, hence ORIGIN and BASE being kept apart.
const ORIGIN = `http://localhost:${PORT}`
const BASE = `${ORIGIN}/npm-portfolio-playground/`

/**
 * A CJS marker in a module the browser is about to evaluate.
 *
 * Deliberately narrow. `require` and `exports` appear inside perfectly good ESM
 * as property names and in strings, so matching the bare word would fire on
 * half the portfolio. These match the *free identifier* forms that actually
 * throw at module scope in a browser, which is the failure being caught.
 */
const CJS_MARKERS = [
  { name: 'module.exports', re: /(^|[^.\w$])module\s*\.\s*exports/ },
  { name: 'free `module`', re: /(^|[^.\w$])module\s*[.[=]/ },
  { name: 'exports.<name>', re: /(^|[^.\w$])exports\s*\.\s*[A-Za-z_$]/ },
  { name: 'require(', re: /(^|[^.\w$])require\s*\(/ },
  { name: '__dirname', re: /(^|[^.\w$])__dirname/ },
  { name: '__filename', re: /(^|[^.\w$])__filename/ },
]

/** @returns the markers found, empty when the source is clean ESM. */
const cjsMarkersIn = (source) => CJS_MARKERS.filter((m) => m.re.test(source)).map((m) => m.name)

/**
 * The first runnable file under an `exports` condition, which is a bare string
 * in most of the portfolio and a nested condition object in the rest.
 *
 * `types` is skipped explicitly: it sits first in most of these maps and points
 * at a `.d.cts`, which has no executable content at all — feeding one to the
 * CJS detector is how this function first reported nine false controls.
 */
const firstFile = (node) => {
  if (typeof node === 'string') return /\.[cm]?js$/.test(node) ? node : null
  if (!node || typeof node !== 'object') return null
  for (const [condition, value] of Object.entries(node)) {
    if (condition === 'types') continue
    const found = firstFile(value)
    if (found) return found
  }
  return null
}

/** ESM is not merely "no CJS" — it has to actually export something. */
const hasEsmExport = (source) => /(^|[^.\w$])export\s*[{*\w]/.test(source)

const libraries = await (async () => {
  // Read the specifier list from the config itself, so a library added there is
  // covered here without anyone remembering to update a second list.
  const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
  const block = /const LIBRARIES[^=]*=\s*{([\s\S]*?)\n}/.exec(config)
  if (!block) throw new Error('Could not find LIBRARIES in vite.config.ts')
  const found = [...block[1].matchAll(/'(@ozjsey\/[^']+)'\s*:\s*{/g)].map((m) => m[1])
  if (found.length === 0) throw new Error('LIBRARIES parsed to zero entries')
  return found
})()

const declared = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {}

const viteBin = join(ROOT, 'node_modules/.bin/vite')
const server = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  // The point of the run: no source aliases, every specifier from node_modules,
  // exactly as the deployed site resolves them.
  env: { ...process.env, GITHUB_ACTIONS: '1' },
})
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

let failures = 0
const fail = (line) => {
  failures++
  console.log(line)
}

/** Abort without a verdict — the run cannot trust its own result. */
const refuse = (why) => {
  console.error(`\nREFUSING TO REPORT — ${why}`)
  server.kill('SIGTERM')
  process.exit(2)
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {
      /* not up yet */
    }
    await sleep(500)
    if (i === 59) throw new Error(`Dev server never came up on ${BASE}:\n${serverLog}`)
  }

  console.log(`Module format — npm resolution forced, ${BASE}`)
  console.log(`Checking ${libraries.length} libraries from vite.config.ts LIBRARIES\n`)

  // What the browser is told to import for each library. Reading it off the
  // served module means the answer comes from Vite's real resolution — aliases,
  // exports map, optimizer and all — not from a re-implementation of it here.
  const served = await (await fetch(`${BASE}src/libraries.ts`)).text()
  const urls = new Map()
  for (const specifier of libraries) {
    const re = new RegExp(`import\\("([^"]*${specifier.split('/')[1]}[^"]*)"\\)`)
    const match = re.exec(served)
    if (match) urls.set(specifier, match[1])
  }

  /* ── the detector checks itself before it judges anything ──────────────── */

  const controls = []
  for (const specifier of libraries) {
    const pkgDir = join(ROOT, 'node_modules', specifier)
    if (!existsSync(join(pkgDir, 'package.json'))) continue
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    // Only an explicit `require` condition proves a CJS build exists. `main` is
    // NOT evidence: three packages here are ESM-only and point `main` straight
    // at the ESM file, so trusting it would feed ESM to a detector whose whole
    // job is to reject CJS — and the control would fail for the wrong reason.
    const cjs = firstFile(manifest.exports?.['.']?.require)
    if (!cjs) continue
    const path = join(pkgDir, cjs.replace(/^\.\//, ''))
    if (!existsSync(path)) continue
    const source = readFileSync(path, 'utf8')
    controls.push({ specifier, file: cjs, markers: cjsMarkersIn(source) })
  }
  if (controls.length === 0) refuse('no CJS build exists anywhere to test the detector against')
  const blind = controls.filter((c) => c.markers.length === 0)
  if (blind.length) {
    refuse(
      `the CJS detector accepted ${blind.length} CJS build(s) it must reject:\n` +
        blind.map((c) => `    ${c.specifier} → ${c.file}`).join('\n') +
        `\n  A detector that answers "ESM" to a CJS file would pass this suite forever.`,
    )
  }
  console.log(`NEGATIVE CONTROL  detector rejected ${controls.length}/${controls.length} real CJS builds\n`)

  /* ── the assertions ───────────────────────────────────────────────────── */

  for (const specifier of libraries) {
    const url = urls.get(specifier)
    if (!url) {
      fail(`FAIL  ${specifier.padEnd(32)} no import() for it in the served src/libraries.ts`)
      continue
    }
    if (!url.includes('node_modules')) {
      fail(
        `FAIL  ${specifier.padEnd(32)} resolved to source, not the published package\n` +
          `        ${url}\n` +
          `        npm resolution was forced; a source alias makes this check vacuous.`,
      )
      continue
    }

    const pkgJson = join(ROOT, 'node_modules', specifier, 'package.json')
    const installed = existsSync(pkgJson) ? JSON.parse(readFileSync(pkgJson, 'utf8')).version : null
    const want = declared[specifier]
    if (want && installed && want.replace(/^[\^~]/, '') !== installed) {
      refuse(
        `${specifier} is installed at ${installed} but package.json declares ${want}.\n` +
          `  This gate would certify an artifact that is not the one we ship.\n` +
          `  Run \`pnpm install\` (or \`pnpm refresh:npm\`) and re-run.`,
      )
    }

    const source = await (await fetch(`${ORIGIN}${url}`)).text()
    const markers = cjsMarkersIn(source)
    if (markers.length) {
      fail(
        `FAIL  ${specifier.padEnd(32)} served as CommonJS — ${markers.join(', ')}\n` +
          `        ${url}\n` +
          `        This throws "${markers[0].replace(/[.(].*/, '')} is not defined" in the browser and takes the whole tab down.`,
      )
      continue
    }
    if (!hasEsmExport(source)) {
      fail(
        `FAIL  ${specifier.padEnd(32)} served module has no ESM export statement\n` +
          `        ${url}`,
      )
      continue
    }
    console.log(`PASS  ${specifier.padEnd(32)} ESM${installed ? `  ${installed}` : ''}`)
  }

  const reached = libraries.filter((s) => urls.has(s)).length
  if (reached !== libraries.length) {
    fail(`\n${libraries.length - reached} librar(y/ies) were never reached — the denominator is not the full set.`)
  }
} finally {
  server.kill('SIGTERM')
}

if (failures) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log(`\nEvery library reaches the browser as ESM.`)
