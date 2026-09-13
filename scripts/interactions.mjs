#!/usr/bin/env node
/**
 * Playground interaction test — zero dependencies beyond a local Chrome.
 *
 * `smoke.mjs` proves every card compiled and mounted. That is not the same as
 * the card being correct: Run 20 shipped a green smoke while two v-dropzone
 * cards were entirely dead (a `ref` written inside a template expression is
 * unwrapped to `undefined`, so every button on them was a silent no-op).
 *
 * This driver clicks through the state machines a static render cannot reach.
 * It drops synthetic `DataTransfer`s, pastes clipboard files, opens pickers,
 * cancels in-flight uploads, and reads the `data-*` state attribute and the
 * rendered output back — the directive has to have actually *done* something.
 *
 *   pnpm interactions                      # source target
 *   pnpm interactions:dist                 # the built dist entries
 *   ONLY=07-api pnpm interactions          # one card
 *   CHROME_PATH=/path/to/chrome pnpm interactions
 *
 * Add a library: drop `scripts/interactions/<library-id>.mjs` beside the
 * others, default-exporting `{ library, prelude?, checks, nativeChecks? }`,
 * then raise the numbers in `scripts/interactions-coverage.json`.
 *
 * Every run ends with a coverage summary counted against the demo manifests,
 * because the pass count on its own is a denominator this file chose for
 * itself — see the Coverage section below.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Cdp, launchChrome, newPage } from './lib/cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PORT = Number(process.env.PORT ?? 5212)
const BASE = `http://localhost:${PORT}`
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null
const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'source'

/**
 * Page-side helpers, installed fresh after every load. Demos are compiled in
 * the browser, so the only stable handles are the card `<section id>` and the
 * host element — everything else is read back out of the rendered DOM.
 *
 * Everything that finds an element goes through `stage()`, never `sec()`.
 * `DemoCard.vue` renders the card's own chrome — Re-run / Reset / Copy /
 * Edit code, the title, the blurb and the tag chips — inside `.demo__head`,
 * which precedes `.demo__stage` in document order. A section-wide
 * `querySelector('button' | 'p' | 'span')` therefore reaches the *card's* DOM
 * before the demo's, and a check written against it passes for entirely the
 * wrong reason. `__pg.button(file, 'Copy')` would return the copy-the-source
 * button; `sec(file).querySelector('p')` returns the blurb.
 */
const BASE_PRELUDE = `
window.__pg = {
  /** The whole card, chrome included. Only for assertions *about* the card. */
  sec(file) {
    const s = document.querySelector('section[id="demo-' + file + '"]')
    if (!s) throw new Error('no card for ' + file)
    return s
  },
  /** The demo's own DOM. The default scope for every lookup. */
  stage(file) {
    const st = this.sec(file).querySelector('.demo__stage')
    if (!st) throw new Error('no stage for ' + file)
    return st
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)) },
  txt(el) { return (el && el.textContent || '').replace(/\\s+/g, ' ').trim() },
  /** Poll until fn() returns something truthy, or give up and return null. */
  async until(fn, budget = 8000, step = 60) {
    const end = Date.now() + budget
    for (;;) {
      const v = fn()
      if (v) return v
      if (Date.now() > end) return null
      await this.sleep(step)
    }
  },
  /** Set a v-model-bound control and let Vue see it. */
  set(el, value) {
    if (el.type === 'checkbox') {
      if (el.checked !== value) el.click()
      return
    }
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  },
  label(file, needle) {
    return [...this.stage(file).querySelectorAll('label')].find((l) => this.txt(l).includes(needle))
  },
  button(file, needle) {
    return [...this.stage(file).querySelectorAll('button')].find((b) => this.txt(b).includes(needle))
  },
  file(name, type, size = 2048) { return new File([new Uint8Array(size)], name, { type }) },
}
'ready'
`

const specFiles = readdirSync(join(HERE, 'interactions'))
  .filter((f) => f.endsWith('.mjs'))
  .sort()
const specs = []
for (const f of specFiles) {
  const mod = await import(join(HERE, 'interactions', f))
  specs.push(mod.default)
}
if (!specs.length) {
  console.error('No specs found in scripts/interactions/')
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Coverage
//
// The denominator has to come from the demo manifests, not from the spec
// files, or the run grades its own homework: with two specs on disk the old
// footer read "74/74 interaction checks passed" while five of the seven
// libraries had never been driven at all. `src/registry.ts` builds the same
// set with `import.meta.glob`, which Node cannot do — so read the directory
// and pull the two fields that matter out of each manifest, loudly.
// ---------------------------------------------------------------------------
const DEMOS_DIR = join(ROOT, 'src/demos')
const BASELINE_PATH = join(HERE, 'interactions-coverage.json')

/** Strip comments so a commented-out `file:` entry cannot inflate the count. */
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** `[{ id, demos: ['01-basic.vue', …] }]`, in the app's order. Throws on anything odd. */
function readManifests() {
  const dirs = readdirSync(DEMOS_DIR)
    .filter((d) => statSync(join(DEMOS_DIR, d)).isDirectory())
    .sort()
  if (!dirs.length) throw new Error(`No demo folders under ${DEMOS_DIR}`)

  return dirs.map((dir) => {
    const path = join(DEMOS_DIR, dir, 'manifest.ts')
    if (!existsSync(path)) throw new Error(`${dir}/ has no manifest.ts`)
    const src = decomment(readFileSync(path, 'utf8'))

    const id = src.match(/\bid:\s*'([^']+)'/)?.[1]
    if (!id) throw new Error(`Could not parse \`id\` out of ${dir}/manifest.ts`)
    if (id !== dir) throw new Error(`${dir}/manifest.ts declares id '${id}' — folder and id must match`)

    const demos = [...src.matchAll(/\bfile:\s*'([^']+\.vue)'/g)].map((m) => m[1])
    if (!demos.length) throw new Error(`No \`file:\` entries in ${dir}/manifest.ts`)

    // The app drops manifest entries with no file on disk (`missingDemoFiles`),
    // so those are not cards and must not sit in the denominator. `smoke` is
    // what fails on them; here they are only reported.
    const missing = demos.filter((f) => !existsSync(join(DEMOS_DIR, dir, f)))
    return { id, demos: demos.filter((f) => !missing.includes(f)), missing }
  })
}

let manifests
try {
  manifests = readManifests()
} catch (err) {
  console.error(`\nCoverage: could not read the demo manifests — ${err.message}`)
  console.error('Fix the manifest rather than letting the run report a made-up denominator.')
  process.exit(2)
}

/** library id → the demo files that at least one check drives. */
const checkedByLibrary = new Map()
const unknownDemoRefs = []
for (const spec of specs) {
  const lib = manifests.find((m) => m.id === spec.library)
  if (!lib) {
    console.error(`\nCoverage: spec declares library '${spec.library}', which has no src/demos/ folder.`)
    process.exit(2)
  }
  const hit = new Set()
  for (const c of [...(spec.checks ?? []), ...(spec.nativeChecks ?? [])]) {
    if (lib.demos.includes(c.demo)) hit.add(c.demo)
    else unknownDemoRefs.push(`${spec.library}/${c.demo}`)
  }
  checkedByLibrary.set(spec.library, hit)
}

const coverage = manifests.map((m) => {
  const checked = checkedByLibrary.get(m.id)
  return {
    id: m.id,
    total: m.demos.length,
    missing: m.missing,
    hasSpec: !!checked,
    covered: checked ? m.demos.filter((f) => checked.has(f)) : [],
    uncovered: checked ? m.demos.filter((f) => !checked.has(f)) : m.demos,
  }
})

const totalCards = coverage.reduce((n, c) => n + c.total, 0)
const coveredCards = coverage.reduce((n, c) => n + c.covered.length, 0)
const librariesWithSpec = coverage.filter((c) => c.hasSpec).length

/**
 * The ratchet.
 *
 * Five libraries are uncovered today, so treating a missing spec as a hard
 * failure would make `pnpm interactions` permanently red — and a gate that is
 * always red is a gate nobody reads, which is the same "green means verified"
 * rot in a different colour. Instead: report the gap so loudly it cannot be
 * mistaken for a pass, and fail only when either number drops below the
 * checked-in baseline. Coverage can then only go up.
 */
if (!existsSync(BASELINE_PATH)) {
  console.error(`\nCoverage: ${BASELINE_PATH} is missing — it is checked in and gates this command.`)
  console.error(`Recreate it with: { "librariesWithSpec": ${librariesWithSpec}, "demoCardsWithChecks": ${coveredCards} }`)
  process.exit(2)
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

const viteBin = join(ROOT, 'node_modules/.bin/vite')
const server = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

const results = []
const record = (demo, name, pass, detail) => {
  results.push({ demo, name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${demo.padEnd(26)} ${name}`)
  if (!pass) console.log(`        → ${detail}`)
}

let chrome
let cdp
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(BASE)).ok) break } catch { /* not up yet */ }
    await sleep(500)
    if (i === 79) throw new Error(`Dev server never came up:\n${serverLog}`)
  }

  chrome = await launchChrome({ port: Number(process.env.CDP_PORT ?? 9335) })
  cdp = await Cdp.connect(chrome.wsUrl)
  const page = await newPage(cdp, BASE)

  // PG-14. Demos are compiled in the browser. When that compiler is not the
  // runtime's own version, a directive inside a `v-for` never receives
  // `updated`, so every option-reactivity check below would be driving an inert
  // control — and passing, because the control it read back is the card's own
  // rendered text. Assert it before a single check runs.
  const boot = await page.evaluate('window.__PLAYGROUND_VERSIONS__ ?? null')
  if (!boot) throw new Error('The playground did not boot — window.__PLAYGROUND_VERSIONS__ is unset.')
  if (!boot.matches) {
    throw new Error(
      `SFC compiler ${boot.compiler} but Vue runtime ${boot.runtime}. See src/sfc/versions.ts.`,
    )
  }

  console.log(`\nPlayground interaction checks — ${TARGET} target, ${BASE}`)
  console.log(`Vue ${boot.runtime} — compiler and runtime agree (PG-14 guard)`)

  // …and the same claim measured rather than inferred. Matching versions is the
  // known cause; a directive inside a `v-for` receiving `updated` is the
  // symptom, and it is what every option-reactivity check downstream depends on.
  // Instrument the LIVE directive object — `invokeDirectiveHook` reads
  // `binding.dir[hook]` at call time, so patching it in place is visible to
  // hosts that are already mounted.
  await page.navigate(`${BASE}/?pg14=1#v-scroll-into-view`)
  await sleep(2200)
  const forUpdated = await page.evaluate(`(async () => {
    const app = document.querySelector('#app').__vue_app__
    if (!app) return { error: 'no __vue_app__ on #app' }
    const dir = app._context.directives['scroll-into-view']
    if (!dir) return { error: 'v-scroll-into-view is not registered' }
    const original = dir.updated
    let calls = 0
    dir.updated = function (...args) { calls++; return original ? original.apply(this, args) : undefined }
    const stage = document.querySelector('section[id="demo-04-offset.vue"] .demo__stage')
    if (!stage) return { error: 'card v-scroll-into-view/04-offset.vue is missing' }
    const hosts = stage.querySelectorAll('section.sec')
    const jump = [...stage.querySelectorAll('button')].find((b) => /^section 5$/.test(b.textContent.trim()))
    if (!hosts.length || !jump) return { error: 'card 04 no longer has v-for hosts and jump buttons' }
    jump.click()
    await new Promise((r) => setTimeout(r, 600))
    dir.updated = original
    return { hosts: hosts.length, calls }
  })()`)
  if (forUpdated.error) throw new Error(`PG-14 guard could not run: ${forUpdated.error}`)
  if (!forUpdated.calls) {
    throw new Error(
      `PG-14 has regressed: a v-scroll-into-view host inside a \`v-for\` received ZERO \`updated\` ` +
        `calls after its binding changed (${forUpdated.hosts} hosts on the card). Every check below ` +
        `that drives an option would be reading an inert control. See src/sfc/versions.ts.`,
    )
  }
  console.log(
    `v-for-hosted directive received ${forUpdated.calls} \`updated\` call(s) — option reactivity is live\n`,
  )

  for (const spec of specs) {
    let load = 0
    /**
     * Fresh mount before every check. A hash-only navigation does NOT reload
     * the document, so the unique query string is what forces a real load —
     * without it each card inherits the previous check's drag depth, upload
     * records and rendered output.
     */
    const fresh = async () => {
      await page.navigate(`${BASE}/?run=${++load}#${spec.library}`)
      await sleep(2200)
      await page.evaluate(BASE_PRELUDE)
      if (spec.prelude) await page.evaluate(spec.prelude)
    }

    for (const check of spec.checks ?? []) {
      if (ONLY && !ONLY.test(`${check.demo} ${check.name}`)) continue
      await fresh()
      try {
        const out = await page.evaluate(`(${check.fn.toString()})()`)
        record(check.demo, check.name, !!out?.pass, out?.detail ?? 'no detail')
      } catch (err) {
        record(check.demo, check.name, false, `threw: ${err.message.split('\n')[0]}`)
      }
    }

    // Checks that need the browser's own input pipeline rather than a
    // synthetic event — a real file drag, for instance, where the payload has
    // to be filesystem-backed for `webkitGetAsEntry` to resolve.
    for (const check of spec.nativeChecks ?? []) {
      if (ONLY && !ONLY.test(`${check.demo} ${check.name}`)) continue
      await fresh()
      try {
        const out = await check.run({ page, cdp, sessionId: page.sessionId })
        record(check.demo, check.name, !!out?.pass, out?.detail ?? 'no detail')
      } catch (err) {
        record(check.demo, check.name, false, `threw: ${err.message.split('\n')[0]}`)
      }
    }
  }

  for (const err of page.pageErrors) record('(page)', 'uncaught exception', false, err.split('\n')[0])
} catch (err) {
  record('(runner)', 'boot', false, err instanceof Error ? err.message : String(err))
} finally {
  for (const spec of specs) await spec.cleanup?.()
  cdp?.close()
  chrome?.proc.kill('SIGKILL')
  server.kill('SIGTERM')
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} interaction checks passed.`)
if (failed.length) {
  console.log('\nFAILURES:')
  for (const f of failed) console.log(`  ${f.demo} — ${f.name}\n      ${f.detail}`)
}

// --- Coverage summary. Always last: the pass count alone reads as "verified",
// and on this repo it currently would be wrong by 59 cards.
const wrap = (names, head) => {
  const cont = ' '.repeat(head.length)
  const lines = []
  for (const n of names) {
    if (!lines.length || `${lines.at(-1)} ${n}`.length > 96) lines.push((lines.length ? cont : head) + n)
    else lines[lines.length - 1] += ` ${n}`
  }
  return lines
}

console.log(`\nCoverage — ${totalCards} demo cards across ${manifests.length} libraries (src/demos/*/manifest.ts)\n`)
for (const c of coverage) {
  const tag = c.hasSpec ? (c.uncovered.length ? 'PARTIAL  ' : 'COVERED  ') : 'UNCOVERED'
  const note = c.hasSpec ? '' : `  no scripts/interactions/${c.id}.mjs`
  console.log(`  ${tag}  ${c.id.padEnd(20)} ${String(c.covered.length).padStart(2)}/${String(c.total).padEnd(2)} cards${note}`)
  if (c.uncovered.length) for (const line of wrap(c.uncovered, '               untested: ')) console.log(line)
  if (c.missing.length) console.log(`               MANIFEST ENTRY WITH NO FILE: ${c.missing.join(' ')}`)
}
if (unknownDemoRefs.length) {
  console.log(`\n  SPEC BUG — checks aimed at demos that no manifest lists: ${unknownDemoRefs.join(' ')}`)
}

const uncoveredCards = totalCards - coveredCards
const regressed =
  librariesWithSpec < baseline.librariesWithSpec || coveredCards < baseline.demoCardsWithChecks
const rule = '─'.repeat(78)
console.log(`\n${rule}`)
if (regressed) {
  console.log(`  COVERAGE REGRESSED below scripts/interactions-coverage.json`)
  console.log(`  libraries with a spec: ${librariesWithSpec} (baseline ${baseline.librariesWithSpec})`)
  console.log(`  demo cards with a check: ${coveredCards} (baseline ${baseline.demoCardsWithChecks})`)
  console.log('  A spec was deleted or a demo lost its only check. Restore it, or lower')
  console.log('  the baseline deliberately and say why in the commit message.')
} else {
  const verdict = failed.length ? `${failed.length} interaction check(s) FAILED` : `${results.length}/${results.length} interaction checks passed`
  console.log(`  ${verdict} — and they cover ${coveredCards} of ${totalCards} demo cards`)
  console.log(`  (${librariesWithSpec} of ${manifests.length} libraries have a spec at all).`)
  console.log(
    uncoveredCards
      ? `  ${uncoveredCards} CARDS ARE UNTESTED. Green here is not "the playground works".`
      : '  Every demo card has at least one check.',
  )
}
if (unknownDemoRefs.length) console.log(`  ${unknownDemoRefs.length} check(s) name a demo that does not exist — see SPEC BUG above.`)
if (ONLY) console.log(`  Filtered run (ONLY=${process.env.ONLY}); the pass count above is partial.`)
console.log(rule)

process.exit(failed.length || regressed ? 1 : 0)
