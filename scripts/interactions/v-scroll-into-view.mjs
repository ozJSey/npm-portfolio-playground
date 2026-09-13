/**
 * v-scroll-into-view interaction spec.
 *
 * Every defect this file pins was invisible to 236 unit tests, because jsdom
 * has no layout: a `display:none` element and a rendered one report the same
 * all-zero rect there, and a 400px target in a 200px pane is the same nothing
 * as a 40px one. The library's arithmetic is now unit-tested against mocked
 * rects, but the *inputs* to that arithmetic can only be wrong in a browser —
 * so these checks read the real thing back out of the live DOM.
 *
 * The three library defects (SIV-1):
 *   B1  a hidden target with `container` scrolled the pane to the top
 *       (measured 300 → 0) while the container-less path correctly stayed put.
 *   B2  `nearest` + `container` aligned the FAR edge of a target taller than
 *       its pane — landing on its bottom, 220px past where native lands.
 *   B3  `nearest` + `offset` clipped 40px off a target the exact height of the
 *       pane, when showing all of it was available.
 *
 * Card 12 is the important shape here: the directive and native
 * `scrollIntoView` run on two identical panes, and the check compares them.
 * "Parity" asserted against a hard-coded number is a number someone chose;
 * asserted against the browser doing the same job beside it, it is a measurement.
 */

const PRELUDE = `
window.__siv = Object.assign(Object.create(window.__pg), {
  pane(file, index = 0) {
    const p = this.stage(file).querySelectorAll('.pg-scroller')[index]
    if (!p) throw new Error('no scroller ' + index + ' in ' + file)
    return p
  },
  /** Text of one of a card's readouts, e.g. 'readout-library'. */
  out(file, cls = 'readout') {
    const el = this.stage(file).querySelector('.' + cls)
    if (!el) throw new Error('no .' + cls + ' in ' + file)
    return this.txt(el)
  },
  nums(text) { return (text.match(/-?\\d+/g) ?? []).map(Number) },
  /**
   * Wait for a readout to complete one cycle: the demo's 'scrolling…' marker
   * appears, then a value replaces it.
   *
   * Waiting only for "not scrolling" is not enough. Vue renders on the next
   * tick, so the readout still holds the PREVIOUS run's text the instant
   * \`click()\` returns — the first draft of this file read that, and reported
   * "the pane did not move" about a pane that had not been asked to yet.
   */
  async settled(file, cls = 'readout') {
    const started = await this.until(() => this.out(file, cls).indexOf('scrolling') !== -1, 3000)
    const t = await this.until(() => {
      const v = this.out(file, cls)
      return v && v.indexOf('scrolling') === -1 && v !== '—' ? v : null
    }, 8000)
    return (started ? '' : '[never entered the scrolling state] ') + (t ?? this.out(file, cls))
  },
  select(file, needle, value) {
    const label = this.label(file, needle)
    const sel = label && label.querySelector('select')
    if (!sel) throw new Error('no select labelled ' + needle + ' in ' + file)
    this.set(sel, value)
    return sel
  },
  range(file, needle, value) {
    const label = this.label(file, needle)
    const input = label && label.querySelector('input[type=range]')
    if (!input) throw new Error('no range labelled ' + needle + ' in ' + file)
    this.set(input, value)
    return input
  },
  /** Wait for a scroller to stop moving. For cards that report nothing themselves. */
  async still(el, budget = 2500) {
    let last = NaN
    let same = 0
    const end = Date.now() + budget
    while (Date.now() < end) {
      const now = Math.round(el.scrollTop) + Math.round(el.scrollLeft) / 1000
      same = now === last ? same + 1 : 0
      last = now
      if (same >= 6) return true
      await this.sleep(30)
    }
    return false
  },
  checkbox(file, needle, on) {
    const label = this.label(file, needle)
    const box = label && label.querySelector('input[type=checkbox]')
    if (!box) throw new Error('no checkbox labelled ' + needle + ' in ' + file)
    this.set(box, on)
    return box
  },
  /** Where the target sits inside its pane, in pane pixels. */
  topIn(pane, target) {
    return Math.round(target.getBoundingClientRect().top - pane.getBoundingClientRect().top)
  },
  /** Sample a scroller over time. Smooth animates through many values; instant does not. */
  async trace(el, ms = 700, step = 16) {
    const seen = []
    const end = Date.now() + ms
    while (Date.now() < end) {
      seen.push(Math.round(el.scrollTop))
      await this.sleep(step)
    }
    return seen
  },
  /** Distinct positions after the starting one — 1 for a jump, many for an animation. */
  moves(trace) {
    const set = new Set(trace)
    set.delete(trace[0])
    return [...set]
  },
})
'ready'
`

const CHECKS = [
  // -------------------------------------------------------------------------
  // 10 — the bare binding and the container-less native path. No card exercised
  // either before SIV-1: every one of the first nine passes a `container`.
  // -------------------------------------------------------------------------
  {
    demo: '10-native-path.vue',
    name: 'bare binding on mount: a target already in view is a no-op, not a scroll',
    fn: async () => {
      const file = '10-native-path.vue'
      await __siv.sleep(500)
      const pane = __siv.pane(file)
      return {
        pass: pane.scrollTop === 0,
        detail: `pane scrollTop=${pane.scrollTop} after mount (target starts in view)`,
      }
    },
  },
  {
    demo: '10-native-path.vue',
    name: 'bare binding, no container: the browser scrolls the pane back to the target',
    fn: async () => {
      const file = '10-native-path.vue'
      const pane = __siv.pane(file)
      __siv.button(file, 'Scroll the pane away').click()
      await __siv.sleep(120)
      const away = pane.scrollTop
      __siv.button(file, 'Remount the target').click()
      const text = await __siv.settled(file)
      const target = __siv.stage(file).querySelector('.target')
      const top = __siv.topIn(pane, target)
      return {
        pass: away > 100 && pane.scrollTop === 0 && Math.abs(top) <= 2,
        detail: `scrolled away to ${away}, back to ${pane.scrollTop}, target top ${top} — readout "${text}"`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 11 — B1. The regression that matters most: a pane that jumps to the top is
  // worse than one that does nothing, and it happened on a `v-show="false"`.
  // -------------------------------------------------------------------------
  {
    demo: '11-hidden-target.vue',
    name: 'B1 container: scrolling to a hidden target leaves the pane where it was',
    fn: async () => {
      const file = '11-hidden-target.vue'
      __siv.checkbox(file, 'container', true)
      __siv.checkbox(file, 'target rendered', false)
      await __siv.sleep(120)
      const pane = __siv.pane(file)
      __siv.button(file, 'Scroll to the target').click()
      const text = await __siv.settled(file)
      return {
        pass: pane.scrollTop === 300,
        detail: `pane scrollTop=${pane.scrollTop}, expected 300 — readout "${text}"`,
      }
    },
  },
  {
    demo: '11-hidden-target.vue',
    name: 'B1 native path: the same hidden target is the same no-op',
    fn: async () => {
      const file = '11-hidden-target.vue'
      __siv.checkbox(file, 'container', false)
      __siv.checkbox(file, 'target rendered', false)
      await __siv.sleep(120)
      const pane = __siv.pane(file)
      __siv.button(file, 'Scroll to the target').click()
      const text = await __siv.settled(file)
      return {
        pass: pane.scrollTop === 300,
        detail: `pane scrollTop=${pane.scrollTop}, expected 300 — readout "${text}"`,
      }
    },
  },
  {
    demo: '11-hidden-target.vue',
    name: 'B1 control: the same button on a RENDERED target still scrolls',
    fn: async () => {
      const file = '11-hidden-target.vue'
      __siv.checkbox(file, 'container', true)
      __siv.checkbox(file, 'target rendered', true)
      await __siv.sleep(200)
      const pane = __siv.pane(file)
      __siv.button(file, 'Scroll to the target').click()
      const text = await __siv.settled(file)
      const target = __siv.stage(file).querySelector('.target')
      const top = __siv.topIn(pane, target)
      return {
        pass: pane.scrollTop > 300 && Math.abs(top) <= 2,
        detail: `pane scrollTop=${pane.scrollTop} (was 300), target top in pane ${top} — readout "${text}"`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 12 — B2 and B3, measured against the browser's own scrollIntoView on an
  // identical pane beside it.
  // -------------------------------------------------------------------------
  {
    demo: '12-nearest-oversized.vue',
    name: 'B2 nearest: a target taller than the pane lands on the same pixel as native',
    fn: async () => {
      const file = '12-nearest-oversized.vue'
      __siv.select(file, 'target height', 400)
      __siv.select(file, 'approach from', 'above')
      __siv.select(file, 'offset.top', 0)
      await __siv.sleep(200)
      __siv.button(file, 'Run both').click()
      const lib = await __siv.settled(file, 'readout-library')
      const nat = await __siv.settled(file, 'readout-native')
      const l = __siv.nums(lib)
      const n = __siv.nums(nat)
      return {
        // [scrollTop, top, bottom]; the old code returned top -220 here.
        pass: Math.abs(l[1] - n[1]) <= 2 && l[1] >= -2,
        detail: `library "${lib}" vs native "${nat}"`,
      }
    },
  },
  {
    demo: '12-nearest-oversized.vue',
    name: 'B3 nearest + offset: a target the exact height of the pane is not clipped',
    fn: async () => {
      const file = '12-nearest-oversized.vue'
      __siv.select(file, 'target height', 200)
      __siv.select(file, 'approach from', 'above')
      __siv.select(file, 'offset.top', 40)
      await __siv.sleep(200)
      __siv.button(file, 'Run both').click()
      const lib = await __siv.settled(file, 'readout-library')
      const l = __siv.nums(lib)
      const pane = __siv.pane(file, 0)
      return {
        // top 0 / bottom 200 inside a 200px pane. The old code landed at
        // top 40 / bottom 240 — 40px of the target below the fold.
        pass: Math.abs(l[1]) <= 2 && l[2] <= pane.clientHeight + 2,
        detail: `library "${lib}", pane clientHeight ${pane.clientHeight}`,
      }
    },
  },
  {
    demo: '12-nearest-oversized.vue',
    name: 'B3 control: an offset that DOES fit still opens its gap',
    fn: async () => {
      const file = '12-nearest-oversized.vue'
      __siv.select(file, 'target height', 120)
      __siv.select(file, 'approach from', 'below')
      __siv.select(file, 'offset.top', 40)
      await __siv.sleep(200)
      __siv.button(file, 'Run both').click()
      const lib = await __siv.settled(file, 'readout-library')
      const nat = await __siv.settled(file, 'readout-native')
      const l = __siv.nums(lib)
      const n = __siv.nums(nat)
      return {
        // Coming from below, `nearest` aligns the near edge — so the sticky
        // gap is visible: 40px, where native (which has no offset) gives 0.
        pass: Math.abs(l[1] - 40) <= 2 && Math.abs(n[1]) <= 2,
        detail: `library "${lib}" vs native "${nat}"`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 13 — B5. Not a bug, a documented asymmetry, but one a consumer discovers by
  // their sticky header eating a heading.
  // -------------------------------------------------------------------------
  {
    demo: '13-scroll-margin.vue',
    name: 'B5: CSS scroll-margin-top is honoured on the native path and dropped with a container',
    fn: async () => {
      const file = '13-scroll-margin.vue'
      __siv.checkbox(file, 'mirror it', false)
      await __siv.sleep(150)
      __siv.button(file, 'Run both').click()
      const nat = await __siv.settled(file, 'readout-native')
      const con = await __siv.settled(file, 'readout-container')
      const n = __siv.nums(nat)[0]
      const c = __siv.nums(con)[0]
      return {
        pass: Math.abs(n - 40) <= 2 && Math.abs(c) <= 2,
        detail: `native gap ${n}px (expects 40), container gap ${c}px (expects 0)`,
      }
    },
  },
  {
    demo: '13-scroll-margin.vue',
    name: 'B5 workaround: offset { top: 40 } reproduces the CSS gap under a container',
    fn: async () => {
      const file = '13-scroll-margin.vue'
      __siv.checkbox(file, 'mirror it', true)
      await __siv.sleep(150)
      __siv.button(file, 'Run both').click()
      const con = await __siv.settled(file, 'readout-container')
      const c = __siv.nums(con)[0]
      return { pass: Math.abs(c - 40) <= 2, detail: `container gap ${c}px (expects 40)` }
    },
  },

  // -------------------------------------------------------------------------
  // 14 — B4. The directive is not broken here; it is silently outvoted, which
  // is worse, because the code looks like it is in charge.
  // -------------------------------------------------------------------------
  {
    demo: '14-focus.vue',
    name: 'B4: focus() before the directive moves the resting position away from the one asked for',
    fn: async () => {
      const file = '14-focus.vue'
      __siv.select(file, 'order', 'none')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const alone = __siv.nums(await __siv.settled(file))[0]

      __siv.select(file, 'order', 'focus')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const focused = __siv.nums(await __siv.settled(file))[0]

      return {
        pass: Math.abs(alone - focused) > 20,
        detail: `directive alone top ${alone}, after focus() top ${focused} — they must disagree`,
      }
    },
  },
  {
    demo: '14-focus.vue',
    name: 'B4 remedy: focus({ preventScroll: true }) lands exactly where the directive alone does',
    fn: async () => {
      const file = '14-focus.vue'
      __siv.select(file, 'order', 'none')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const alone = __siv.nums(await __siv.settled(file))[0]

      __siv.select(file, 'order', 'prevent')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const text = await __siv.settled(file)
      const prevented = __siv.nums(text)[0]

      return {
        pass: Math.abs(alone - prevented) <= 2 && text.indexOf('focused true') !== -1,
        detail: `directive alone top ${alone}, preventScroll top ${prevented} — readout "${text}"`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 06 — the alignment matrix. This is the regression pin for the audit's
  // longest confirmed-working line ("start/center/end/nearest × both axes ×
  // positive and negative offsets, all within ~1px"), because rewriting
  // `scrollFor` for B2 and B3 touched every one of those paths.
  //
  // Vertical axis only: the grid is 8 × 8rem wide against a pane barely
  // narrower, so a horizontal alignment clamps at the scroll limit and would
  // be asserting the clamp rather than the alignment. The inline axis is
  // covered by the unit tests, where the geometry is chosen rather than
  // measured.
  // -------------------------------------------------------------------------
  {
    demo: '06-alignment.vue',
    name: 'start / center / end each land within 2px of the alignment they name',
    fn: async () => {
      const file = '06-alignment.vue'
      const pane = __siv.stage(file).querySelector('#grid-pane')
      const measure = async (block) => {
        __siv.select(file, 'block', block)
        await __siv.sleep(150)
        __siv.button(file, 'Scroll').click()
        await __siv.still(pane)
        const t = __siv.stage(file).querySelector('.cell.target span').getBoundingClientRect()
        const p = pane.getBoundingClientRect()
        return { top: t.top - p.top, height: t.height }
      }
      const start = await measure('start')
      const center = await measure('center')
      const end = await measure('end')
      const h = pane.clientHeight
      const err = [
        Math.abs(start.top),
        Math.abs(center.top + center.height / 2 - h / 2),
        Math.abs(end.top + end.height - h),
      ]
      return {
        pass: err.every((e) => e <= 2),
        detail:
          `pane clientHeight ${h} — start top ${start.top.toFixed(1)}, ` +
          `center mid ${(center.top + center.height / 2).toFixed(1)}, ` +
          `end bottom ${(end.top + end.height).toFixed(1)}; errors ${err.map((e) => e.toFixed(1)).join(' / ')}`,
      }
    },
  },
  {
    demo: '06-alignment.vue',
    name: 'offset.top shifts a start-aligned target by exactly that many pixels, sign included',
    fn: async () => {
      const file = '06-alignment.vue'
      const pane = __siv.stage(file).querySelector('#grid-pane')
      __siv.select(file, 'block', 'start')
      const at = async (offset) => {
        __siv.range(file, 'offset.top', offset)
        await __siv.sleep(150)
        __siv.button(file, 'Scroll').click()
        await __siv.still(pane)
        const t = __siv.stage(file).querySelector('.cell.target span').getBoundingClientRect()
        return t.top - pane.getBoundingClientRect().top
      }
      const plus = await at(40)
      const minus = await at(-40)
      return {
        pass: Math.abs(plus - 40) <= 2 && Math.abs(minus + 40) <= 2,
        detail: `offset +40 → top ${plus.toFixed(1)} (expects 40); offset -40 → top ${minus.toFixed(1)} (expects -40)`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 04 — the sticky-header offset in a `v-for`. PG-14 meant this card received
  // ZERO `updated` calls until 2026-09-06, so nothing about it was ever
  // verified in a browser.
  // -------------------------------------------------------------------------
  {
    demo: '04-offset.vue',
    name: 'offset in a v-for: the jumped-to section clears the 56px sticky header',
    fn: async () => {
      const file = '04-offset.vue'
      const pane = __siv.pane(file)
      const before = pane.scrollTop
      __siv.button(file, 'section 3').click()
      await __siv.sleep(900)
      const section = __siv.stage(file).querySelectorAll('section.sec')[2]
      const top = __siv.topIn(pane, section)
      return {
        pass: pane.scrollTop > before && Math.abs(top - 56) <= 3,
        detail: `pane ${before} → ${pane.scrollTop}, section 3 top in pane ${top} (expects 56)`,
      }
    },
  },
]

/**
 * Reduced motion can only be produced by the browser, so these go through
 * `Emulation.setEmulatedMedia` and read the scroll trace back. Each one clears
 * the emulation afterwards — the runner reuses one page across every check, so
 * a leaked media override would quietly re-run every later check under it.
 */
async function withReducedMotion(ctx, fn) {
  await ctx.cdp.send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
    ctx.sessionId,
  )
  try {
    return await fn()
  } finally {
    await ctx.cdp.send('Emulation.setEmulatedMedia', { features: [] }, ctx.sessionId)
  }
}

const TRACE_DEFAULT = `(async () => {
  const file = '01-boolean-edge.vue'
  const pane = __siv.pane(file)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  __siv.button(file, 'Set condition = true').click()
  const trace = await __siv.trace(pane, 900)
  return { reduce, moves: __siv.moves(trace), last: trace[trace.length - 1] }
})()`

const NATIVE_CHECKS = [
  {
    demo: '01-boolean-edge.vue',
    name: 'B6: under prefers-reduced-motion the default behavior is one jump, not an animation',
    async run(ctx) {
      const out = await withReducedMotion(ctx, () => ctx.page.evaluate(TRACE_DEFAULT))
      return {
        pass: out.reduce && out.moves.length === 1 && out.last > 0,
        detail: `reduce=${out.reduce}, ${out.moves.length} distinct position(s) after the start, settled at ${out.last}`,
      }
    },
  },
  {
    demo: '01-boolean-edge.vue',
    name: 'B6 control: with motion allowed, the same default animates',
    async run(ctx) {
      const out = await ctx.page.evaluate(TRACE_DEFAULT)
      return {
        pass: !out.reduce && out.moves.length >= 4,
        detail: `reduce=${out.reduce}, ${out.moves.length} distinct positions, settled at ${out.last}`,
      }
    },
  },
  {
    demo: '03-container.vue',
    name: "B6 opt-in: an EXPLICIT behavior: 'smooth' still animates under reduced motion",
    async run(ctx) {
      const out = await withReducedMotion(ctx, () =>
        ctx.page.evaluate(`(async () => {
          const file = '03-container.vue'
          const pane = __siv.pane(file)
          const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
          __siv.button(file, 'Scroll to the last message').click()
          const trace = await __siv.trace(pane, 900)
          return { reduce, moves: __siv.moves(trace), last: trace[trace.length - 1] }
        })()`),
      )
      return {
        pass: out.reduce && out.moves.length >= 4,
        detail: `reduce=${out.reduce}, ${out.moves.length} distinct positions, settled at ${out.last}`,
      }
    },
  },
]

export default {
  library: '@ozjsey/v-scroll-into-view',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
