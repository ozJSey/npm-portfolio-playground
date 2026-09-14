#!/usr/bin/env node
/**
 * `tsc --noEmit` over every sibling package the playground aliases.
 *
 * PG-22, acceptance criterion 2. `pnpm typecheck` covers this app and the demo
 * SFCs; it does not compile each library's own `src/`. So a missing export
 * *inside* a library — `v-teleport-to/src/calculate-position.ts` importing a
 * `MEASURE_EPSILON` that `constants.ts` never exported — was invisible until
 * Vite tried to resolve it in the browser, at which point it blanked all ten
 * tabs and cost an agent half a run.
 *
 * This catches that class before any browser starts, in about ten seconds.
 *
 *   pnpm typecheck:libs
 *   pnpm typecheck:libs v-observe v-copy      # just these
 *
 * Each package is compiled by ITS OWN typescript and tsconfig, because that is
 * what its `npm run build` will use; borrowing the playground's would check a
 * configuration nobody ships.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORTFOLIO = join(HERE, '../..')

/** Kept in step with `vite.config.ts` LIBRARIES — these are what get aliased in. */
const PACKAGES = [
  'bigdecimal-string',
  'v-copy',
  'v-dropzone',
  'v-fit-children',
  'v-keyboard-navigation',
  'v-observe',
  'v-scroll-into-view',
  'v-select-text',
  'v-teleport-to',
  'vue-write-behind',
]

const only = process.argv.slice(2)
const wanted = only.length ? PACKAGES.filter((p) => only.includes(p)) : PACKAGES
if (only.length && wanted.length !== only.length) {
  console.error(`Unknown package(s): ${only.filter((o) => !PACKAGES.includes(o)).join(' ')}`)
  console.error(`Known: ${PACKAGES.join(' ')}`)
  process.exit(2)
}

function typecheck(pkg) {
  return new Promise((resolve) => {
    const dir = join(PORTFOLIO, pkg)
    if (!existsSync(join(dir, 'tsconfig.json'))) {
      resolve({ pkg, status: 'skipped', output: 'no tsconfig.json' })
      return
    }
    const tsc = join(dir, 'node_modules/.bin/tsc')
    if (!existsSync(tsc)) {
      resolve({ pkg, status: 'skipped', output: 'no local typescript — run npm install in that package' })
      return
    }
    const proc = spawn(tsc, ['--noEmit', '-p', 'tsconfig.json'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    proc.stdout.on('data', (c) => (out += c))
    proc.stderr.on('data', (c) => (out += c))
    proc.on('error', (err) => resolve({ pkg, status: 'skipped', output: err.message }))
    proc.on('close', (code) => resolve({ pkg, status: code === 0 ? 'ok' : 'failed', output: out.trim() }))
  })
}

const results = await Promise.all(wanted.map(typecheck))
let failed = 0
for (const r of results) {
  if (r.status === 'failed') failed++
  const tag = r.status === 'ok' ? 'PASS' : r.status === 'skipped' ? 'SKIP' : 'FAIL'
  console.log(`${tag}  ${r.pkg}${r.status === 'skipped' ? `  (${r.output})` : ''}`)
  if (r.status === 'failed') {
    for (const line of r.output.split('\n').slice(0, 12)) console.log(`        ${line}`)
    const extra = r.output.split('\n').length - 12
    if (extra > 0) console.log(`        … ${extra} more line(s)`)
  }
}

const skipped = results.filter((r) => r.status === 'skipped').length
console.log(
  failed
    ? `\n${failed} package(s) do not typecheck. A library that does not compile takes its playground ` +
      `tab down (PG-22) — and, before this command existed, took every other tab with it.`
    : `\n${results.length - skipped} package(s) typecheck clean${skipped ? `, ${skipped} skipped` : ''}.`,
)
process.exit(failed ? 1 : 0)
