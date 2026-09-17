#!/usr/bin/env node
/**
 * The two tab strips, driven with real keys. `tickets/DOCS-6`.
 *
 *   pnpm tabs                     # the app's tablists must behave like tablists
 *   pnpm tabs --negative-control  # break each mechanism in the live page; every
 *                                 # check that covers it must go red
 *
 * ## Why this exists
 *
 * `role="tablist"` was on both strips before this ticket and neither one kept
 * the promise: every tab was its own tab stop and no arrow key did anything.
 * Nothing caught it, because nothing ever pressed a key on the app's own
 * chrome — `smoke` renders, `deeplinks` clicks, `interactions` drives the demo
 * cards. An ARIA role is a claim about the keyboard, and this repository's rule
 * is that a claim needs a check that can be shown failing.
 *
 * The checks are the WAI-ARIA APG's tabs pattern, the parts that are
 * observable from outside:
 *
 *   wiring     every tab names a panel that exists; the panel names the tab
 *   selection  exactly one tab is `aria-selected`
 *   roving     exactly one tab is tabbable, and it is the selected one
 *   one stop   Tab from inside the strip leaves the strip
 *   arrows     Left/Right move selection AND focus, wrapping; Home/End jump
 *   panels     moving the view tabs actually swaps the panel's content
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp, launchChrome, newPage } from './lib/cdp.mjs'
import { waitForBoot } from './lib/boot.mjs'
import { freePort, resolvePort } from './lib/port.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const NEGATIVE_CONTROL = process.argv.includes('--negative-control')
const PORT = await resolvePort('Pass a different PORT, or unset it to get a free one automatically.')
const BASE = `http://localhost:${PORT}`

const KEYS = {
  ArrowLeft: 37,
  ArrowRight: 39,
  Home: 36,
  End: 35,
  Tab: 9,
}

/** One real key press through Chrome's input pipeline, not a synthetic event. */
async function press(cdp, page, name) {
  const base = {
    key: name,
    code: name,
    windowsVirtualKeyCode: KEYS[name],
    nativeVirtualKeyCode: KEYS[name],
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, page.sessionId)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, page.sessionId)
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => r(1)))')
}

/** Everything the assertions below need about one strip, read out of the DOM. */
const readStrip = (selector) => `(() => {
  const strip = document.querySelector(${JSON.stringify(selector)})
  if (!strip) return { missing: true }
  const tabs = [...strip.querySelectorAll('[role="tab"]')]
  const active = document.activeElement
  return {
    role: strip.getAttribute('role'),
    label: strip.getAttribute('aria-label'),
    count: tabs.length,
    selected: tabs.map((t) => t.getAttribute('aria-selected') === 'true'),
    tabindex: tabs.map((t) => t.tabIndex),
    ids: tabs.map((t) => t.id),
    focusedIndex: tabs.indexOf(active),
    focusedOutside: !strip.contains(active),
    panels: tabs.map((t) => {
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '')
      return panel ? { role: panel.getAttribute('role'), labelledby: panel.getAttribute('aria-labelledby') } : null
    }),
  }
})()`

const focusSelected = (selector) => `(() => {
  const tabs = [...document.querySelector(${JSON.stringify(selector)}).querySelectorAll('[role="tab"]')]
  const at = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')
  tabs[at].focus()
  return at
})()`

/**
 * The control: break one mechanism in the running page and require the checks
 * that cover it to fail.
 *
 * Every mutation is the *absence* of something this ticket added, expressed as
 * the shortest edit that removes it — not a random breakage. `cloneNode` is how
 * a listener is removed without knowing what it is: the copy carries the
 * attributes and none of the handlers, which is precisely "the strip has ARIA
 * and no keyboard", the state the app shipped in.
 */
const SABOTAGE = {
  roving: `[...document.querySelectorAll('[role="tab"]')].forEach((t) => (t.tabIndex = 0)); true`,
  arrows: `for (const s of document.querySelectorAll('[role="tablist"]')) s.replaceWith(s.cloneNode(true)); true`,
  wiring: `[...document.querySelectorAll('[role="tab"]')].forEach((t) => t.removeAttribute('aria-controls')); true`,
}

const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })

let chrome
let cdp
const server = spawn(
  existsSync(join(ROOT, 'node_modules/.bin/vite')) ? join(ROOT, 'node_modules/.bin/vite') : 'vite',
  ['--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
)
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

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

  chrome = await launchChrome({ port: await freePort() })
  cdp = await Cdp.connect(chrome.wsUrl)
  const page = await newPage(cdp, BASE)
  await waitForBoot(page, { serverLog })

  console.log(`\nTab semantics — ${BASE}${NEGATIVE_CONTROL ? '   (NEGATIVE CONTROL)' : ''}`)
  console.log('─'.repeat(92))

  for (const [strip, selector, label] of [
    ['library', '.tabs', 'Library'],
    ['view', '.views__tabs', 'View'],
  ]) {
    // Reload between strips so a mutation applied to one does not silently
    // decide the other strip's verdict.
    await page.navigate(BASE)
    await waitForBoot(page, { serverLog })
    if (NEGATIVE_CONTROL) {
      for (const expression of Object.values(SABOTAGE)) await page.evaluate(expression)
    }

    const before = await page.evaluate(readStrip(selector))
    if (before.missing) {
      check(`${strip}: the strip exists`, false, `no element matches ${selector}`)
      continue
    }

    check(`${strip}: is a tablist with an accessible name`, before.role === 'tablist' && before.label === label,
      `role=${before.role} aria-label=${before.label}`)
    check(`${strip}: exactly one tab is aria-selected`, before.selected.filter(Boolean).length === 1,
      `${before.selected.filter(Boolean).length} of ${before.count} selected`)
    check(`${strip}: roving tabindex — one tabbable tab, and it is the selected one`,
      before.tabindex.filter((t) => t === 0).length === 1 &&
        before.tabindex[before.selected.indexOf(true)] === 0,
      `tabindex ${JSON.stringify(before.tabindex)}, selected index ${before.selected.indexOf(true)}`)
    check(`${strip}: every tab controls a real tabpanel that names it back`,
      before.panels.every((p, i) =>
        p?.role === 'tabpanel' && (!before.selected[i] || p.labelledby === before.ids[i])),
      JSON.stringify(before.panels[0]))

    // One tab stop: Tab from the selected tab must leave the strip.
    await page.evaluate(focusSelected(selector))
    await press(cdp, page, 'Tab')
    const afterTab = await page.evaluate(readStrip(selector))
    check(`${strip}: Tab leaves the strip in one press`, afterTab.focusedOutside,
      `focus landed on tab index ${afterTab.focusedIndex}`)

    /**
     * One keystroke, asserted as a *transition*: it started here, it must end
     * there, and here must not be there.
     *
     * The `from` half is load-bearing and was missing on the first cut. A check
     * that only asserts the destination passes for free whenever the
     * destination is where the strip already was — so "Home jumps to the first
     * tab" was green in the negative control, on a page whose arrow keys had
     * been stripped out entirely, because nothing had moved off the first tab.
     * Two checks per strip could not fail; the control said so, which is what a
     * control is for.
     */
    const last = before.count - 1
    const move = async (name, key, from, want) => {
      const start = await page.evaluate(readStrip(selector))
      const at = start.selected.indexOf(true)
      await press(cdp, page, key)
      const end = await page.evaluate(readStrip(selector))
      const landed = end.selected.indexOf(true)
      check(
        `${strip}: ${name}`,
        at === from && from !== want && landed === want && end.focusedIndex === want,
        `pressed ${key} at tab ${at} (this check only means something from ${from}); ` +
          `selection landed on ${landed} and focus on ${end.focusedIndex}, both had to be ${want}`,
      )
    }

    // Arrows move selection and focus together (APG automatic activation).
    await page.evaluate(focusSelected(selector))
    await move('ArrowRight selects and focuses the next tab', 'ArrowRight', 0, 1)
    await move('ArrowLeft comes back', 'ArrowLeft', 1, 0)
    await move('End jumps to the last tab', 'End', 0, last)
    await move('Home jumps to the first tab', 'Home', last, 0)
    await move('ArrowLeft from the first tab wraps to the last', 'ArrowLeft', 0, last)
  }

  // The view tabs have a job beyond the ARIA: the panel must actually swap.
  await page.navigate(BASE)
  await waitForBoot(page, { serverLog })
  if (NEGATIVE_CONTROL) for (const expression of Object.values(SABOTAGE)) await page.evaluate(expression)
  await page.evaluate(focusSelected('.views__tabs'))
  await press(cdp, page, 'ArrowRight')
  const swapped = await page.evaluate(
    `({ docs: !!document.querySelector('#view-panel .docs'), hash: location.hash })`,
  )
  check('view: ArrowRight actually swaps the panel to the Documentation view',
    swapped.docs === true, `#view-panel .docs present: ${swapped.docs}, hash ${swapped.hash}`)
} catch (err) {
  check('(runner)', false, err instanceof Error ? err.message : String(err))
} finally {
  cdp?.close()
  chrome?.proc.kill('SIGKILL')
  server.kill('SIGTERM')
}

for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        ${detail}`)
}

const failed = results.filter((r) => !r.ok).length
console.log('─'.repeat(92))

if (NEGATIVE_CONTROL) {
  // Not every check depends on a sabotaged mechanism — "exactly one tab is
  // aria-selected" survives having the listeners removed, and should. What the
  // control has to show is that the checks covering the three mechanisms this
  // ticket added all go red.
  const mustFail = results.filter((r) =>
    /roving|tabpanel|Tab leaves|Arrow|End jumps|Home jumps|swaps the panel/.test(r.name))
  const stillGreen = mustFail.filter((r) => r.ok)
  // A control that stopped early proves nothing about the checks it never ran,
  // and "every check I got to went red" is exactly the shape of a false green.
  const aborted = results.find((r) => r.name === '(runner)')
  console.log(
    aborted
      ? `  NEGATIVE CONTROL INCONCLUSIVE — the run aborted before it finished, so the checks it\n` +
        `  never reached are unproven. Re-run it.\n    ${aborted.detail}`
      : stillGreen.length
        ? `  NEGATIVE CONTROL FAILED — ${stillGreen.length} check(s) stayed green with the mechanism\n` +
          `  they cover removed from the page:\n` +
          stillGreen.map((r) => `    • ${r.name}`).join('\n')
        : `  NEGATIVE CONTROL SATISFIED — all ${mustFail.length} keyboard/ARIA checks went red once the\n` +
          `  roving tabindex, the keydown listeners and the aria-controls wiring were stripped out.`,
  )
  process.exit(aborted || stillGreen.length ? 1 : 0)
}

console.log(
  failed
    ? `  ${failed} of ${results.length} tab-semantics checks FAILED.`
    : `  ${results.length}/${results.length} tab-semantics checks passed. ` +
      `Negative control: pnpm tabs --negative-control`,
)
process.exit(failed ? 1 : 0)
