#!/usr/bin/env node
/**
 * Geometry check for `v-fit-children` — zero dependencies, Node 22+.
 *
 * `smoke` proves a demo RENDERS. This proves it renders CORRECTLY: it drives the
 * real playground in headless Chrome and measures the rendered row against the
 * two ways an overflow-fitting directive can be wrong.
 *
 *   node scripts/geometry.mjs                       # v-fit-children (default)
 *   node scripts/geometry.mjs v-teleport-to         # any tab that stamps data-v-fit-state
 *   PLAYGROUND_TARGET=dist node scripts/geometry.mjs
 *   GEOMETRY_NARROW=fail node scripts/geometry.mjs  # gate on the 375px sweep too
 *   GEOMETRY_SELFTEST=empty-row node scripts/geometry.mjs   # prove it can go red
 *   GEOMETRY_DUMP=01-basic node scripts/geometry.mjs        # print raw measurements
 *
 * ## PG-20: it used to measure only one of the two failures
 *
 * The old version measured children spilling **past** the host's content edge —
 * and nothing else. A rig with **0 of 9 children visible** reported
 * `overflowPx 0` and **PASSED**, which is why a live defect sailed through
 * "9/9 demos laid out correctly". An empty row is the symmetric visible failure
 * and the instrument could not see it.
 *
 * It was not vacuous — an auditor tried to prove it was and its own negative
 * control refuted it, catching a real `overflowPx 44`. So this is a widening,
 * not a rewrite. What is measured now:
 *
 *   over-spill      a visible child past the content edge            (as before)
 *   clipping        `scrollWidth > clientWidth` on the host          (as before)
 *   EMPTY ROW       0 of N eligible children visible                 NEW
 *   over-hiding     a hidden child that would have fitted in the     NEW
 *                   free space (its real width, read off a clone)
 *   non-monotonic   widening the container hides MORE children       NEW
 *   contradiction   `data-v-fit-state="fits"` with children hidden   NEW
 *   event drift     `fit-children-updated` disagreeing with the DOM  NEW
 *   silent change   the hidden set changed and no event was sent     NEW  (FIT-1 F1)
 *   console         any error, and every `[v-fit-children]` warning  NEW
 *
 * and it drives **checkboxes and buttons**, not only `input[type=range]`, across
 * **three viewports**, measuring **every** host on a card rather than the first.
 *
 * The honest scope of a green run is printed at the end. It is narrower than
 * "9/9 demos laid out correctly" ever implied.
 *
 * Exits non-zero when a defect is found, so it can gate a run.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Cdp, launchChrome, newPage, throughReload } from './lib/cdp.mjs'
import { waitForBoot } from './lib/boot.mjs'
import { readManifests } from './lib/manifests.mjs'
import { freePort, resolvePort } from './lib/port.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const TAB = process.argv[2] ?? 'v-fit-children'
const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'source'
const NARROW_GATES = process.env.GEOMETRY_NARROW === 'fail'

/**
 * The instrument's own negative control — standing practice here, and the whole
 * reason PG-20 exists: the old script PASSED a rig with 0 of 9 children visible,
 * and nobody could tell, because nobody had ever made it fail on purpose.
 *
 *   GEOMETRY_SELFTEST=empty-row      hide every child of the first card's host
 *   GEOMETRY_SELFTEST=over-spill     un-hide every child so the row spills
 *   GEOMETRY_SELFTEST=silent-change  hide one child with no event dispatched
 *
 * The sabotage is applied to the live DOM immediately before a measurement, in
 * the same synchronous task, so nothing can react to it in between. The run then
 * INVERTS: it exits 0 only if the harness reported the defect that was injected.
 * A green `pnpm geometry` means nothing unless these three are red on demand.
 */
const SELFTEST = process.env.GEOMETRY_SELFTEST ?? ''
const SELFTEST_EXPECTS = {
  'empty-row': 'EMPTY ROW',
  'over-spill': 'over-spill',
  'silent-change': 'silent change',
}
if (SELFTEST && !SELFTEST_EXPECTS[SELFTEST]) {
  console.error(`GEOMETRY_SELFTEST must be one of: ${Object.keys(SELFTEST_EXPECTS).join(', ')}`)
  process.exit(2)
}

/**
 * Wide enough that nothing should ever be hidden; the size the cards were
 * designed at; and a phone. FIT-1 F8 found that six of nine cards clip at 375px
 * because of the *card stage*, not the library — so the narrow sweep is
 * measured and reported but does not gate unless asked. Measuring it and saying
 * nothing was the old behaviour, and that is the thing being fixed.
 */
const ALL_VIEWPORTS = [
  { name: '1400x1000', width: 1400, height: 1000, gates: true },
  { name: '1024x800', width: 1024, height: 800, gates: true },
  { name: '375x812', width: 375, height: 812, gates: NARROW_GATES },
]
// A self-test is about the instrument, not the layout: one viewport proves it.
const VIEWPORTS = SELFTEST ? ALL_VIEWPORTS.slice(0, 1) : ALL_VIEWPORTS

/**
 * How much empty space at the end of a row is legitimate.
 *
 * `offsetNeededInPx` reserves room for a "+N more" badge — 50 by default, and
 * the demos pass 0 and 44. The harness cannot read the binding, so the
 * over-hiding test allows the largest of those before it calls free space a
 * defect. Conservative on purpose: this test must not be the one that cries
 * wolf, or the next agent will turn it off.
 */
const OFFSET_ALLOWANCE_PX = 60

/** How long the whole-tab probe may take before it counts as wedged. */
const PROBE_BUDGET_MS = Number(process.env.GEOMETRY_PROBE_BUDGET_MS ?? 300_000)

const PORT = await resolvePort('Pass a different PORT, or unset it to get a free one automatically.')
const BASE = `http://localhost:${PORT}`

/**
 * How many cards the tab owes, from disk.
 *
 * The first draft slept 3000ms and measured whatever had mounted — which on a
 * cold first load was 2 of 11 cards, reported as "2 cards clean". That is
 * PG-18's defect wearing PG-20's hat: a run that found almost nothing looked
 * exactly like a run that passed. The denominator comes from the manifest now,
 * and a short page is an error.
 */
const { manifests } = readManifests(join(ROOT, 'src/demos'))
const tabManifest = manifests.find((m) => m.id === TAB)
if (!tabManifest) {
  console.error(`No src/demos/${TAB}/manifest.ts — "${TAB}" is not a playground tab.`)
  console.error(`Tabs: ${manifests.map((m) => m.id).join(' ')}`)
  process.exit(2)
}
const EXPECTED_CARDS = tabManifest.demos.length

const viteBin = join(ROOT, 'node_modules/.bin/vite')
const vite = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteLog = ''
vite.stdout.on('data', (c) => (viteLog += c))
vite.stderr.on('data', (c) => (viteLog += c))

let chrome
let cdp
const cleanup = () => {
  try { cdp?.close() } catch { /* already gone */ }
  try { chrome?.proc.kill('SIGKILL') } catch { /* already gone */ }
  try { vite.kill('SIGTERM') } catch { /* already gone */ }
}
process.on('exit', cleanup)

// ---------------------------------------------------------------------------
// The page-side probe.
//
// One string, evaluated in the tab. It arms an event listener on every host,
// drives every control on the card's OWN stage — never the card chrome, whose
// "Reset" and "Edit code" buttons would wreck the run — and samples each host
// after every change.
// ---------------------------------------------------------------------------
const PROBE = `(async () => {
  const SELFTEST = ${JSON.stringify(SELFTEST)}
  const HIDDEN = 'data-v-fit-hidden'
  const STATE = 'data-v-fit-state'
  const EVENT = 'fit-children-updated'

  const settle = () => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 140))))

  /**
   * The event does not bubble, so it has to be caught on the host itself — and
   * hosts are replaced (card 10's "Remount the row"), so arming is re-run before
   * every sample rather than once.
   */
  const arm = (root) => {
    for (const host of root.querySelectorAll('[' + STATE + ']')) {
      if (host.__geom) continue
      const seen = { events: 0, detail: null }
      host.__geom = seen
      host.addEventListener(EVENT, (event) => {
        seen.events++
        seen.detail = {
          hiddenChildrenCount: event.detail.hiddenChildrenCount,
          isOverflowing: event.detail.isOverflowing,
          hiddenIndices: event.detail.hiddenIndices ? event.detail.hiddenIndices.slice() : [],
          hiddenDataCount: event.detail.hiddenData ? event.detail.hiddenData.length : null,
        }
      })
    }
  }

  const setRange = (input, value) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      .set.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const txt = (el) => (el && el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40)

  /**
   * The natural width of each child the directive has hidden.
   *
   * The over-hiding test needs to know whether the NEXT child would have fitted,
   * and a hidden child measures 0 -- the directive's rule is
   * [data-v-fit-hidden]{display:none !important}, injected into document.head.
   * Guessing from the visible children is what the first draft did, and it
   * cried wolf on card 07, where the visible chip is "Vue" (43px) and the first
   * hidden one is "TypeScript" (90px), which genuinely did not fit.
   *
   * So measure it: clone the HOST (keeping its classes, so .chips .pg-chip and
   * every scoped data-v-* rule still match), un-hide the clone's children, and
   * read them offscreen. Cloning the host rather than the child is what
   * preserves the cascade; appending to <body> rather than to the host is what
   * keeps the directive's own MutationObserver from seeing any of it.
   */
  /**
   * The room THIS host has, which is not the room its frame has.
   *
   * Several cards put a "+N more" badge or a label inside the same flex frame,
   * and that space is not the row's to use. On 08-decorative at 120px the
   * frame's content box is 99px, but the badge and its gap take 75 of them —
   * leaving about 24 for a row whose first child is 38. Reading the frame said
   * "0 of 11 visible with 99px available" and called a correct layout a defect.
   *
   * That direction of error matters more than it looks. PG-20 exists because
   * this script PASSED a row with nothing in it; a version that cries wolf on
   * legitimate layouts gets muted, and then it is back to missing over-hiding,
   * with extra steps.
   *
   * So: the host's own content box, which already accounts for its siblings —
   * except when the row has collapsed to nothing (which is the very case the
   * empty-row test is for), where the room has to be reconstructed from the
   * parent minus whatever else is in it.
   */
  const roomFor = (host) => {
    const cs = getComputedStyle(host)
    const rect = host.getBoundingClientRect()
    const own =
      rect.width - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0) -
      (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    if (own > 1) return own

    const parent = host.parentElement
    if (!parent) return 0
    const pcs = getComputedStyle(parent)
    let room =
      parent.clientWidth - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0)

    // Siblings only compete for horizontal room in a row-direction flex/grid;
    // in a block container they are on their own lines and cost nothing here.
    const isRow = /flex|grid/.test(pcs.display) && !/column/.test(pcs.flexDirection || '')
    if (isRow) {
      const gap = parseFloat(pcs.columnGap) || parseFloat(pcs.gap) || 0
      for (const sibling of parent.children) {
        if (sibling === host) continue
        const scs = getComputedStyle(sibling)
        if (scs.display === 'none' || scs.position === 'absolute' || scs.position === 'fixed') continue
        room -= sibling.getBoundingClientRect().width +
          (parseFloat(scs.marginLeft) || 0) + (parseFloat(scs.marginRight) || 0) + gap
      }
    }
    // …and the host's own frame comes off the top of whatever is left.
    room -= (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0) +
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    return Math.max(room, 0)
  }

  const hiddenWidths = (host) => {
    const kids = [...host.children]
    const wanted = kids.map((c) => c.style.display !== 'none' && c.hasAttribute(HIDDEN))
    if (!wanted.some(Boolean)) return []
    const clone = host.cloneNode(true)
    clone.style.position = 'absolute'
    clone.style.left = '-99999px'
    clone.style.top = '0'
    clone.style.visibility = 'hidden'
    clone.style.overflow = 'visible'
    // Widen the clone to the room the host has, not to the width it currently
    // shows: an emptied flex row collapses to 0px, and flex items measured
    // inside a 0px box shrink, which would under-report exactly the widths this
    // test needs.
    clone.style.width = Math.max(host.clientWidth, roomFor(host), 0) + 'px'
    for (const c of clone.children) c.removeAttribute(HIDDEN)
    document.body.appendChild(clone)
    const cloneKids = [...clone.children]
    const widths = []
    wanted.forEach((isHidden, i) => {
      if (isHidden && cloneKids[i]) widths.push(Math.round(cloneKids[i].getBoundingClientRect().width))
    })
    clone.remove()
    return widths
  }

  const measure = (host) => {
    const cs = getComputedStyle(host)
    const rect = host.getBoundingClientRect()
    const left = rect.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0)
    const right = rect.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0)

    const children = [...host.children]
    // \`v-show\` writes an inline display:none and the directive never does, so
    // "the consumer hid this" is an exact test — see v-fit-children/src/dom.ts.
    // Those children are legitimately out of the running and must not count as
    // over-hiding.
    const eligible = children.filter((c) => c.style.display !== 'none')
    const hidden = eligible.filter((c) => c.hasAttribute(HIDDEN))
    const visible = eligible.filter((c) => !c.hasAttribute(HIDDEN))
    // A child the consumer pinned can never be hidden, so a row of nothing but
    // pinned children is SUPPOSED to spill -- that is card 11's entire subject.
    // Only the attribute form is detectable; keepVisibleEl is a ref and
    // invisible from here, which is a known blind spot of this test.
    const pinned = visible.filter((c) => c.hasAttribute('data-v-fit-keep'))
    const rects = visible.map((c) => c.getBoundingClientRect())
    const edge = rects.length ? Math.max(...rects.map((r) => r.right)) : left
    const widest = rects.length ? Math.max(...rects.map((r) => r.width)) : 0
    const gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0

    const availablePx = Math.round(roomFor(host))

    return {
      contentPx: Math.round(right - left),
      availablePx,
      children: children.length,
      eligible: eligible.length,
      consumerHidden: children.length - eligible.length,
      hidden: hidden.length,
      visible: visible.length,
      pinnedVisible: pinned.length,
      hiddenWidthsPx: hiddenWidths(host),
      overflowPx: Math.round(edge - right),
      freePx: Math.round(right - edge),
      widestVisiblePx: Math.round(widest),
      gapPx: Math.round(gap),
      clipPx: Math.max(0, Math.round(host.scrollWidth - host.clientWidth)),
      state: host.getAttribute(STATE),
      events: host.__geom ? host.__geom.events : 0,
      detail: host.__geom ? host.__geom.detail : null,
    }
  }

  const out = []
  for (const card of document.querySelectorAll('section[id^="demo-"]')) {
    const stage = card.querySelector('.demo__stage')
    if (!stage) continue
    if (!stage.querySelector('[' + STATE + ']')) continue
    // GEOMETRY_SELFTEST=silent-change simulates FIT-1 F1 faithfully: the hidden
    // set moves and the consumer is never told. Mutating the DOM would not do
    // it -- the directive notices its own children resizing and dispatches --
    // so swallow the event instead, registered before arm() so it runs first.
    if (SELFTEST === 'silent-change' && out.length === 0) {
      const first = stage.querySelector('[' + STATE + ']')
      if (first) first.addEventListener(EVENT, (e) => e.stopImmediatePropagation(), true)
    }
    arm(stage)

    const title = txt(card.querySelector('.demo__title, h2, h3')) || card.id
    const samples = []
    /**
     * Sabotage for GEOMETRY_SELFTEST, applied to the FIRST measurable card only,
     * synchronously with the measurement so no observer can undo it first.
     */
    const sabotage = (hosts) => {
      if (!SELFTEST || out.length !== 0 || !hosts.length) return
      const host = hosts[0]
      const kids = [...host.children].filter((c) => c.style.display !== 'none')
      if (SELFTEST === 'empty-row') {
        for (const c of kids) c.setAttribute(HIDDEN, '')
      } else if (SELFTEST === 'over-spill') {
        for (const c of kids) c.removeAttribute(HIDDEN)
      }
      // 'silent-change' needs no DOM sabotage at all: the width sweep moves the
      // hidden set on its own, and the swallowed event is the defect.
    }

    const sample = async (at) => {
      await settle()
      arm(stage)
      const hosts = [...stage.querySelectorAll('[' + STATE + ']')]
      sabotage(hosts)
      samples.push({ at, hosts: hosts.map(measure) })
    }

    await sample('as mounted')

    // 1. Every width slider, swept. The first range on a card is the container
    //    width in every one of these demos.
    const ranges = [...stage.querySelectorAll('input[type="range"]')]
    if (ranges.length) {
      const w = ranges[0]
      const min = Number(w.min) || 140
      const max = Number(w.max) || 720
      for (let i = 0; i <= 12; i++) {
        const v = Math.round(min + ((max - min) * i) / 12)
        setRange(w, v)
        await sample('w=' + v + 'px')
      }
      if (ranges[1]) {
        for (const v of [0, 3, 12, 24, 40]) {
          setRange(w, Math.round(min + (max - min) * 0.54))
          setRange(ranges[1], v)
          await sample('opt=' + v)
        }
      }
      // Leave the row mid-range for the control sweeps below, so a checkbox is
      // exercised somewhere interesting rather than at whichever end it stopped.
      setRange(w, Math.round(min + (max - min) * 0.5))
      await sample('w=mid')
    }

    // 2. Checkboxes. PG-20: card 03's keepVisibleEl and card 09's v-show were
    //    never touched by this script, and both are the point of their card.
    for (const box of [...stage.querySelectorAll('input[type="checkbox"]')]) {
      const label = txt(box.closest('label')) || 'checkbox'
      const was = box.checked
      box.click()
      await sample('[' + label + '=' + String(!was) + ']')
      box.click()
      await sample('[' + label + '=' + String(was) + ']')
    }

    // 3. Buttons — the card's own, never the card chrome's (Re-run / Reset /
    //    Copy / Edit code live in .demo__head, which is why this is scoped to
    //    .demo__stage).
    for (const button of [...stage.querySelectorAll('button')]) {
      if (button.disabled) continue
      const label = txt(button) || 'button'
      button.click()
      await sample('<' + label + '>')
    }

    out.push({ id: card.id.replace(/^demo-/, ''), title, samples })
  }
  return out
})()`

// ---------------------------------------------------------------------------

const defects = []
const note = (viewport, card, host, at, kind, detail) =>
  defects.push({ viewport, card, host, at, kind, detail })

/**
 * Every assertion lives here, and every one of them names the sample it fired
 * on. A defect the report cannot locate is a defect nobody fixes.
 */
function judge(viewportName, card) {
  const hostCount = Math.max(...card.samples.map((s) => s.hosts.length))
  for (let h = 0; h < hostCount; h++) {
    let previous = null
    let previousWidth = null
    for (const sample of card.samples) {
      const m = sample.hosts[h]
      if (!m) continue
      const where = hostCount > 1 ? `host ${h + 1}/${hostCount}` : ''

      // A row whose every visible child is pinned has already hidden everything
      // it was allowed to hide; spilling is then the directive obeying the
      // consumer, not a defect (card 11 exists to demonstrate exactly this).
      // What it still owes in that state is an honest `overflowing`.
      const allVisiblePinned = m.visible > 0 && m.pinnedVisible === m.visible

      // --- the original half: something stuck out, or the host clipped it ---
      if (m.overflowPx > 1 && !allVisiblePinned) {
        note(viewportName, card, where, sample.at, 'over-spill',
          `${m.overflowPx}px past the content edge (${m.visible}/${m.eligible} children visible, ` +
            `${m.pinnedVisible} pinned)`)
      }
      if (m.clipPx > 1 && !allVisiblePinned) {
        note(viewportName, card, where, sample.at, 'clipped',
          `host scrollWidth exceeds clientWidth by ${m.clipPx}px`)
      }
      if (m.overflowPx > 1 && allVisiblePinned && m.state !== 'overflowing') {
        note(viewportName, card, where, sample.at, 'contradiction',
          `${m.overflowPx}px of pinned children spill past the content edge, but ` +
            `data-v-fit-state="${m.state}". A row that cannot hide anything and is visibly ` +
            `clipped is still overflowing (card 11's subject).`)
      }

      // --- the half PG-20 filed: too FEW children visible ---
      // The lower bound. A row emptied of every child reported `overflowPx 0`
      // and PASSED — PG-20's headline.
      //
      // Two corrections a field report earned, both in the "do not cry wolf"
      // direction. It asks about the FIRST hidden child, not the narrowest one
      // anywhere in the row: the library hides a trailing run, so the question
      // is whether the next one would have gone in, and on 08-decorative the
      // narrowest is a 5px separator sitting behind a 38px chip. And it allows
      // the badge offset, because an overflowing row legitimately reserves it.
      const firstHidden = m.hiddenWidthsPx?.[0] ?? 0
      if (m.eligible > 0 && m.visible === 0 && firstHidden > 0 &&
          m.availablePx - OFFSET_ALLOWANCE_PX >= firstHidden) {
        note(viewportName, card, where, sample.at, 'EMPTY ROW',
          `0 of ${m.eligible} eligible children visible, yet the row has ${m.availablePx}px to work ` +
            `with and its first hidden child is only ${firstHidden}px wide ` +
            `(${OFFSET_ALLOWANCE_PX}px badge allowance already deducted). ` +
            `This is the failure that used to report overflowPx 0 and PASS.`)
      }
      // The lower bound, measured rather than guessed: the directive hides a
      // trailing run, so the first hidden child is the one that should have
      // gone in next. `hiddenWidthsPx[0]` is its real width, read off an
      // offscreen clone — see the probe.
      const nextHidden = m.hiddenWidthsPx?.[0]
      if (m.hidden > 0 && nextHidden !== undefined &&
          m.freePx - OFFSET_ALLOWANCE_PX >= nextHidden + m.gapPx) {
        note(viewportName, card, where, sample.at, 'over-hiding',
          `${m.hidden} child(ren) hidden with ${m.freePx}px free, and the FIRST hidden child is ` +
            `only ${nextHidden}px wide (+${m.gapPx}px gap, ${OFFSET_ALLOWANCE_PX}px badge allowance) ` +
            `— it would have fitted`)
      }
      if (m.state === 'fits' && m.hidden > 0) {
        note(viewportName, card, where, sample.at, 'contradiction',
          `data-v-fit-state="fits" while ${m.hidden} child(ren) carry data-v-fit-hidden`)
      }

      // --- the event, cross-checked against the DOM it describes (FIT-1 F2) ---
      if (m.detail) {
        if (m.detail.hiddenChildrenCount !== m.hidden) {
          note(viewportName, card, where, sample.at, 'event drift',
            `event says hiddenChildrenCount=${m.detail.hiddenChildrenCount}, the DOM has ${m.hidden} hidden`)
        }
        if (m.detail.isOverflowing !== (m.state === 'overflowing')) {
          note(viewportName, card, where, sample.at, 'event drift',
            `event says isOverflowing=${m.detail.isOverflowing}, data-v-fit-state="${m.state}"`)
        }
      }
      // FIT-1 F1: the hidden set moved and the consumer was never told.
      if (previous && previous.hidden !== m.hidden && m.events === previous.events) {
        note(viewportName, card, where, sample.at, 'silent change',
          `hidden went ${previous.hidden} → ${m.hidden} since "${previous.at}" and ` +
            `fit-children-updated did not fire (still ${m.events} event(s))`)
      }

      // --- widening the row must never hide more of it ---
      const width = /^w=(\d+)px$/.exec(sample.at)
      if (width && previousWidth && Number(width[1]) > previousWidth.px) {
        const prev = previousWidth.m
        if (prev.eligible === m.eligible && m.visible < prev.visible) {
          note(viewportName, card, where, sample.at, 'non-monotonic',
            `${prev.visible} visible at ${previousWidth.px}px, only ${m.visible} at ${width[1]}px — ` +
              `a wider container hid MORE children`)
        }
      }
      if (width) previousWidth = { px: Number(width[1]), m }
      previous = { ...m, at: sample.at }
    }
  }
}

let exitCode = 0
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(BASE)).ok) break } catch { /* not up */ }
    await sleep(500)
    if (i === 79) throw new Error(`Dev server never came up on ${BASE}:\n${viteLog}`)
  }

  chrome = await launchChrome({ port: Number(process.env.CDP_PORT) || (await freePort()), windowSize: '1400,1000' })
  cdp = await Cdp.connect(chrome.wsUrl)
  const page = await newPage(cdp, BASE)

  console.log(`Geometry — ${TAB}, ${TARGET} target, ${BASE}`)

  // The first browser load is what makes Vite's optimizer discover the app's
  // dependencies, and it answers by full-reloading the page. Absorb that here,
  // before anything is being measured — PG-21 is what happens when it lands
  // mid-command instead.
  await sleep(4000)

  const results = []
  for (const viewport of VIEWPORTS) {
    await page.setViewport(viewport.width, viewport.height)
    const measured = await throughReload(
      async () => {
        // A fresh document per viewport: a row that was measured at 1400px and then
        // reflowed is not the same as one mounted at 375px, and only the second is
        // what a visitor sees.
        await page.navigate(`${BASE}/?geometry=${viewport.width}&r=${Math.random().toString(36).slice(2)}#${TAB}`)

        // PG-22. A library that did not load renders an error card instead of the
        // demos, and "no measurable demos" would otherwise be this script's way
        // of reporting it. `waitForBoot` separates that from "not booted yet".
        const boot = await waitForBoot(page, { serverLog: viteLog })
        if (boot.libraryFailures.length) {
          throw new Error(
            `${boot.libraryFailures.length} library/libraries failed to load, so nothing measured ` +
              `below would mean anything:\n` +
              boot.libraryFailures.map((f) => `  • ${f.specifier}: ${f.message}`).join('\n'),
          )
        }

        // Not a fixed sleep, and not a count of card shells either.
        //
        // Both shortcuts have now been caught reporting a fraction of the tab as
        // a clean run: 3000ms measured 2 of 11 cards on a cold load, and
        // counting `.demo__stage` measured 5 of 11 — the stage exists as soon as
        // DemoCard renders, but the demo inside it is compiled in the browser
        // and arrives later. So wait for every stage to have CONTENT, then for
        // the host count to stop moving, then check it against the manifest.
        const mounted = await page.evaluate(`(async () => {
          const end = Date.now() + 60000
          const stages = () => [...document.querySelectorAll('section[id^="demo-"] .demo__stage')]
          const hosts = () => document.querySelectorAll('[data-v-fit-state]').length
          const filled = () => stages().filter((s) => s.children.length > 0).length
          let stable = 0
          let last = -1
          for (;;) {
            const ready = stages().length >= ${EXPECTED_CARDS} && filled() >= ${EXPECTED_CARDS}
            const n = hosts()
            stable = ready && n === last && n > 0 ? stable + 1 : 0
            last = n
            if (stable >= 3) break
            if (Date.now() > end) break
            await new Promise((r) => setTimeout(r, 300))
          }
          return { stages: stages().length, filled: filled(), hosts: hosts() }
        })()`)
        if (mounted.filled < EXPECTED_CARDS) {
          throw new Error(
            `Only ${mounted.filled} of ${EXPECTED_CARDS} cards finished compiling on #${TAB} at ` +
              `${viewport.name} within 60s (${mounted.stages} card shells, ${mounted.hosts} fit hosts).\n` +
              (page.pageErrors[0] ? `First page error: ${page.pageErrors[0].split('\n')[0]}\n` : '') +
              (page.consoleErrors[0] ? `First console error: ${page.consoleErrors[0]}\n` : '') +
              `A partial tab is not a clean tab — see src/demos/${TAB}/manifest.ts.`,
          )
        }
        // One more settle so the last card's ResizeObservers have run.
        await sleep(800)

        const cards = await page.evaluateWithin(PROBE_BUDGET_MS, PROBE)
        if (!cards.length) {
          throw new Error(
            `No host carrying data-v-fit-state on tab "${TAB}" at ${viewport.name}. ` +
              `Either the tab is wrong, or the directive did not mount — which is a defect, not an ` +
              `empty run. ${page.pageErrors[0] ?? ''}`,
          )
        }
        return cards
      },
      {
        onRetry: (err, attempt) =>
          console.log(`  (attempt ${attempt} at ${viewport.name} was cut short by a page reload; retrying)`),
      },
    )
    // `GEOMETRY_DUMP=<card id fragment>` prints the raw samples for a card.
    // The thing this whole pass is about is instruments that cannot be
    // interrogated; this is the interrogation.
    if (process.env.GEOMETRY_DUMP) {
      for (const card of measured.filter((c) => c.id.includes(process.env.GEOMETRY_DUMP))) {
        console.log(`\n--- ${viewport.name} ${card.id} ---`)
        for (const sample of card.samples.slice(0, 4)) console.log(JSON.stringify(sample))
      }
    }
    for (const card of measured) judge(viewport.name, card)
    results.push({ viewport, cards: measured })

    // Every viewport must see the same cards. They did not once: 1400x1000
    // measured 11 and 1024x800 measured 5, and the five all said PASS. A run
    // that quietly measured less than the last one is the bug this whole pass
    // is about.
    const first = results[0].cards.map((c) => c.id)
    const here = measured.map((c) => c.id)
    const missing = first.filter((id) => !here.includes(id))
    const extra = here.filter((id) => !first.includes(id))
    if (missing.length || extra.length) {
      throw new Error(
        `${viewport.name} measured a different set of cards than ${results[0].viewport.name}: ` +
          (missing.length ? `missing ${missing.join(' ')}. ` : '') +
          (extra.length ? `unexpected ${extra.join(' ')}. ` : '') +
          `A viewport that sees fewer cards is not a viewport that passed.`,
      )
    }
  }

  // --- report ------------------------------------------------------------
  for (const { viewport, cards } of results) {
    const gating = viewport.gates
    const here = defects.filter((d) => d.viewport === viewport.name)
    console.log(
      `\n${viewport.name}${gating ? '' : '  (reported, not gating — set GEOMETRY_NARROW=fail)'}`,
    )
    for (const card of cards) {
      const mine = here.filter((d) => d.card === card)
      const hosts = Math.max(...card.samples.map((s) => s.hosts.length))
      if (!mine.length) {
        console.log(
          `  PASS  ${card.id.padEnd(26)} ${card.samples.length} states × ${hosts} host(s), clean`,
        )
        continue
      }
      console.log(`  ${gating ? 'FAIL' : 'WARN'}  ${card.id.padEnd(26)} ${mine.length} defect(s)`)
      for (const d of mine.slice(0, 6)) {
        console.log(`          ${d.kind}${d.host ? ` [${d.host}]` : ''} at ${d.at}`)
        console.log(`            ${d.detail}`)
      }
      if (mine.length > 6) console.log(`          … and ${mine.length - 6} more`)
    }
  }

  if (SELFTEST) {
    /**
     * Two-sided, deliberately.
     *
     * Only the FIRST card is sabotaged, so a control that "holds" has to do two
     * things at once: report the injected defect on that card, and stay silent
     * on the other ten, which are sweeping the same widths with real layouts.
     * A detector that goes red on everything passes the first half and is
     * useless — and worse than useless, because it gets muted, and then PG-20
     * is back with the extra step of somebody having trusted it.
     *
     * The quiet half is not a token: the ten clean cards cover every width the
     * sweep visits, including the narrowest, where "nothing fits" is the
     * correct answer and the cry-wolf risk is highest.
     */
    const want = SELFTEST_EXPECTS[SELFTEST]
    const sabotaged = results[0]?.cards[0]
    const hits = defects.filter((d) => d.kind === want && d.card === sabotaged)
    const smear = defects.filter((d) => d.card !== sabotaged)
    const rule = '─'.repeat(78)
    console.log(`\n${rule}`)
    console.log(`  SELFTEST ${SELFTEST}: injected into ${sabotaged?.id ?? '(no card)'} only.`)

    if (!hits.length) {
      console.log(`  CONTROL FAILED (blind) — no "${want}" reported on the card that was sabotaged.`)
      console.log(`  Kinds seen: ${[...new Set(defects.map((d) => d.kind))].join(', ') || 'none'}`)
      console.log('  This instrument cannot see the thing it claims to check.')
      console.log(rule)
      cleanup()
      process.exit(1)
    }
    if (smear.length) {
      console.log(`  CONTROL FAILED (cries wolf) — ${smear.length} defect(s) on cards that were NOT`)
      console.log('  touched, so this detector fires on correct layouts as well as broken ones:')
      for (const d of smear.slice(0, 5)) console.log(`    ${d.card.id} ${d.kind} at ${d.at}: ${d.detail}`)
      console.log(rule)
      cleanup()
      process.exit(1)
    }
    console.log(`  CONTROL HELD, both ways:`)
    console.log(`    RED   ${hits.length} "${want}" on ${sabotaged.id} — e.g. ${hits[0].at}: ${hits[0].detail}`)
    console.log(`    GREEN ${results[0].cards.length - 1} untouched cards clean across every swept width,`)
    console.log(`          including the narrowest, where "nothing fits" is the correct answer.`)
    console.log(rule)
    cleanup()
    process.exit(0)
  }

  const gatingDefects = defects.filter((d) => VIEWPORTS.find((v) => v.name === d.viewport)?.gates)
  const warnOnly = defects.length - gatingDefects.length

  // The library talks to the console when its `data` contract is broken — that
  // is a designed signal and the harness used to throw it away.
  const libWarnings = page.consoleWarnings.filter((w) => w.includes('[v-fit-children]'))
  if (libWarnings.length) {
    console.log(`\n${libWarnings.length} [v-fit-children] console warning(s):`)
    for (const w of [...new Set(libWarnings)].slice(0, 5)) console.log(`  ${w.slice(0, 220)}`)
  }
  if (page.consoleErrors.length || page.pageErrors.length) {
    console.log(`\nConsole/page errors during the sweep:`)
    for (const e of [...new Set([...page.pageErrors, ...page.consoleErrors])].slice(0, 8)) {
      console.log(`  ${e.split('\n')[0].slice(0, 220)}`)
    }
  }

  const totalCards = results[0]?.cards.length ?? 0
  if (totalCards < EXPECTED_CARDS) {
    console.log(
      `\n  Note: ${EXPECTED_CARDS - totalCards} of ${EXPECTED_CARDS} cards on this tab have no ` +
        `data-v-fit-state host, so this script cannot see them.`,
    )
  }
  const totalSamples = results.reduce(
    (n, r) => n + r.cards.reduce((m, c) => m + c.samples.length * Math.max(...c.samples.map((s) => s.hosts.length)), 0),
    0,
  )

  console.log(`\n${'─'.repeat(78)}`)
  if (gatingDefects.length || page.consoleErrors.length || page.pageErrors.length) {
    console.log(`  ${gatingDefects.length} geometry defect(s) across ${totalCards} cards.`)
    if (page.consoleErrors.length || page.pageErrors.length) {
      console.log(`  ${page.consoleErrors.length + page.pageErrors.length} console/page error(s) — see above.`)
    }
    exitCode = 1
  } else {
    console.log(`  ${totalCards} cards clean over ${totalSamples} host measurements.`)
  }
  if (warnOnly) console.log(`  ${warnOnly} defect(s) at non-gating viewports (FIT-1 F8 territory: the card stage, not the library).`)
  // PG-20's last line: "9/9 demos laid out correctly" claimed far more than it
  // had measured. Say what was actually checked.
  console.log(
    `  Checked, per host, at ${VIEWPORTS.map((v) => v.name).join(' / ')}: nothing spilled past the\n` +
      `  content edge; the host did not clip; the row was never empty; no child was hidden with room\n` +
      `  to spare; widening never hid more; data-v-fit-state agreed with the hidden set; and every\n` +
      `  change to that set was announced by fit-children-updated. NOT checked: visual styling,\n` +
      `  vertical layout, ordering, or any card without a data-v-fit-state host.`,
  )
  console.log('─'.repeat(78))
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : err}`)
  exitCode = 1
} finally {
  cleanup()
}

process.exit(exitCode)
