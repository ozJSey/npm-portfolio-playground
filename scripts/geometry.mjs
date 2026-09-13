#!/usr/bin/env node
/**
 * Geometry check — zero dependencies, Node 22+.
 *
 * `smoke` proves a demo RENDERS. This proves it renders CORRECTLY: it drives
 * the real playground in headless Chrome, sweeps every width slider in every
 * card of a tab, and reports layout defects that no unit test can see —
 * a child sticking out past its host's content edge, or a host clipping its
 * own content (`scrollWidth > clientWidth`).
 *
 * It exists because a green `smoke` run once shipped three demos with chips
 * clipped in half. Trust measurements, not screenshots, and not "it renders".
 *
 *   node scripts/geometry.mjs                 # v-fit-children (default)
 *   node scripts/geometry.mjs v-teleport-to   # any tab id
 *   PLAYGROUND_TARGET=dist node scripts/geometry.mjs
 *
 * Exits non-zero when a defect is found, so it can gate a run.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const TAB = process.argv[2] ?? 'v-fit-children'
const PORT = Number(process.env.PORT ?? 5174)
const DEBUG_PORT = 9334

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p))

if (!CHROME) {
  console.error('No Chrome found. Set CHROME_PATH.')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  env: process.env,
  stdio: 'ignore',
})

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--window-size=1400,1000',
  'about:blank',
])

const cleanup = () => {
  chrome.kill()
  vite.kill()
}
process.on('exit', cleanup)

async function waitFor(fn, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    await sleep(250)
  }
  throw new Error('timed out waiting for the dev server / browser')
}

await waitFor(async () => (await fetch(`http://localhost:${PORT}`)).ok)
const target = await waitFor(async () => {
  const list = await (await fetch(`http://localhost:${DEBUG_PORT}/json/list`)).json()
  return list.find((t) => t.type === 'page')
})

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const send = (method, params = {}) => {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => pending.set(id, resolve))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: `http://localhost:${PORT}/#${TAB}` })
await sleep(3500)

const measure = `(async () => {
  const settle = () => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))
  const setRange = (input, value) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      .set.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const out = []
  for (const card of document.querySelectorAll('.demo-card, article, section')) {
    const host = card.querySelector('[data-v-fit-state]')
    if (!host) continue
    const title = card.querySelector('h2, h3, .demo-card__title')?.textContent?.trim() ?? '?'
    if (out.some((o) => o.title === title)) continue
    const sample = () => {
      const cs = getComputedStyle(host)
      const rect = host.getBoundingClientRect()
      const left = rect.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0)
      const right = rect.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0)
      const visible = [...host.children].filter((el) => getComputedStyle(el).display !== 'none')
      const edge = visible.length ? Math.max(...visible.map((el) => el.getBoundingClientRect().right)) : left
      return {
        overflowPx: Math.round(edge - right),
        clipPx: Math.max(0, Math.round(host.scrollWidth - host.clientWidth)),
      }
    }
    const ranges = [...card.querySelectorAll('input[type="range"]')]
    const samples = []
    if (!ranges.length) {
      await settle()
      samples.push({ at: 'default', ...sample() })
    } else {
      const w = ranges[0]
      const min = Number(w.min) || 140
      const max = Number(w.max) || 720
      for (let i = 0; i <= 12; i++) {
        const v = Math.round(min + ((max - min) * i) / 12)
        setRange(w, v)
        await settle()
        samples.push({ at: v + 'px', ...sample() })
      }
      if (ranges[1]) {
        for (const v of [0, 3, 12, 24, 40]) {
          setRange(w, Math.round(min + (max - min) * 0.54))
          setRange(ranges[1], v)
          await settle()
          samples.push({ at: 'opt=' + v, ...sample() })
        }
      }
    }
    out.push({ title, samples })
  }
  return out
})()`

const result = await send('Runtime.evaluate', {
  expression: measure,
  awaitPromise: true,
  returnByValue: true,
})

const demos = result.result?.result?.value ?? []
if (!demos.length) {
  console.error(`No measurable demos on tab "${TAB}".`)
  process.exit(2)
}

let failed = 0
for (const demo of demos) {
  const bad = demo.samples.filter((s) => s.overflowPx > 1 || s.clipPx > 1)
  if (bad.length) {
    failed++
    console.log(`FAIL  ${demo.title}`)
    for (const s of bad.slice(0, 5)) {
      console.log(`        ${s.at}: ${s.overflowPx}px past the edge, ${s.clipPx}px clipped`)
    }
  } else {
    console.log(`PASS  ${demo.title}  (${demo.samples.length} widths)`)
  }
}

console.log(
  `\n${demos.length - failed}/${demos.length} demos laid out correctly` +
    (process.env.PLAYGROUND_TARGET === 'dist' ? ' (against dist)' : ''),
)
process.exit(failed ? 1 : 0)
