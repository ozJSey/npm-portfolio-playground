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
 * The three container-path divergences (SIV-4, found by the blind re-audit in
 * the paths SIV-1 had just fixed — and by card 12, which was printing them):
 *   S1  every container scroll was off by the container's BORDER width, because
 *       the origin came from `getBoundingClientRect()` (border box) while
 *       `scrollTop`/`clientHeight` are padding-box relative. Exactly 1px in
 *       every pane here, which is why it survived a `<= 2` tolerance.
 *   S2  `nearest` on a target taller than the pane approached from below
 *       disagreed with native by a full pane height (229 vs 430).
 *   S3  `offset.top` applied to `center` and `end` on the container path only;
 *       the native path spells it `scroll-margin-top`, which CSS applies fully
 *       to `start`, half to `center` and not at all to `end`.
 *
 * Card 12 is the important shape here: the directive and native
 * `scrollIntoView` run on two identical panes, and the check compares them.
 * "Parity" asserted against a hard-coded number is a number someone chose;
 * asserted against the browser doing the same job beside it, it is a measurement.
 *
 * TOLERANCES. `<= 2` was the reason S1 shipped: the defect was 1px, on a demo
 * whose readout was measured from the same wrong origin, so the buggy library
 * value read as the rounder of the two. Parity checks here compare the two
 * panes' `scrollTop` EXACTLY. A tolerance is only allowed where the quantity
 * being measured is a laid-out box (card 06's alignment errors, card 04's
 * sticky header), never where it is one integer against another integer the
 * browser produced beside it. Card 15 sweeps the same comparison across 192
 * geometries so no single hand-picked cell can be the whole proof.
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
  // 12 — B2, B3 and SIV-4 S1/S2, measured against the browser's own
  // scrollIntoView on an identical pane beside it. `scrollTop` is compared
  // EXACTLY: both numbers come from the same browser on the same frame, and the
  // defect this card was built to catch was one pixel wide.
  // -------------------------------------------------------------------------
  {
    demo: '12-nearest-oversized.vue',
    name: 'S1 the pane has a border, so a check that cannot see one pixel cannot see the defect',
    fn: async () => {
      const file = '12-nearest-oversized.vue'
      const pane = __siv.pane(file)
      return {
        // Not a behaviour check — a check on the other checks. `clientTop` is
        // the whole of S1, and if the demo ever loses its border every parity
        // assertion below becomes vacuous while still passing.
        pass: pane.clientTop >= 1,
        detail: `pane clientTop=${pane.clientTop} (border width); the S1 error was exactly this many pixels`,
      }
    },
  },
  {
    demo: '12-nearest-oversized.vue',
    name: 'S1/B2 nearest, taller than the pane, from above: the SAME scrollTop as native, not one off',
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
        // [scrollTop, top, bottom]. Coming down to an oversized target aligns
        // its top; the pre-1.3.0 code landed 1px past native on every row here.
        pass: l[0] === n[0] && l[1] === 0,
        detail: `library "${lib}" vs native "${nat}"`,
      }
    },
  },
  {
    demo: '12-nearest-oversized.vue',
    name: 'S2 nearest, taller than the pane, from BELOW: native aligns the bottom, and so must we',
    fn: async () => {
      const file = '12-nearest-oversized.vue'
      __siv.select(file, 'target height', 400)
      __siv.select(file, 'approach from', 'below')
      __siv.select(file, 'offset.top', 0)
      await __siv.sleep(200)
      __siv.button(file, 'Run both').click()
      const lib = await __siv.settled(file, 'readout-library')
      const nat = await __siv.settled(file, 'readout-native')
      const l = __siv.nums(lib)
      const n = __siv.nums(nat)
      const pane = __siv.pane(file, 0)
      return {
        // The exact case the card is named after, and the one it got backwards:
        // directive 229 against native 430, while the blurb asserted agreement.
        // The target's BOTTOM edge lands on the scrollport's bottom edge.
        pass: l[0] === n[0] && Math.abs(l[2] - pane.clientHeight) <= 1,
        detail: `library "${lib}" vs native "${nat}", pane clientHeight ${pane.clientHeight}`,
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
        // top 0 / bottom 200 inside a 200px scrollport. The old code landed at
        // top 40 / bottom 240 — 40px of the target below the fold.
        pass: l[1] === 0 && l[2] <= pane.clientHeight,
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
        pass: l[1] === 40 && n[1] === 0,
        detail: `library "${lib}" vs native "${nat}"`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 15 — the sweep. One hand-picked geometry is one hand-picked geometry; this
  // is 192 of them, and it is the check that would have caught S1 on the day it
  // was written. It takes ~20s, which is the price of not choosing the cell.
  // -------------------------------------------------------------------------
  {
    demo: '15-parity-matrix.vue',
    name: 'S1/S2/S3: 192 geometries, every one landing on native\'s pixel',
    fn: async () => {
      const file = '15-parity-matrix.vue'
      __siv.button(file, 'Run the sweep').click()
      const summary = await __siv.until(() => {
        const t = __siv.out(file, 'summary')
        return t && t !== '—' ? t : null
      }, 120000, 500)
      const failures = [...__siv.stage(file).querySelectorAll('.fails tbody tr')].map((tr) =>
        [...tr.children].map((td) => __siv.txt(td)).join(' '),
      )
      return {
        pass: !!summary && summary.indexOf('disagree') === -1 && failures.length === 0,
        detail: `${summary ?? 'never finished'}${failures.length ? ' — ' + failures.slice(0, 4).join(' | ') : ''}`,
      }
    },
  },
  {
    demo: '15-parity-matrix.vue',
    name: 'sweep control: the border and padding columns are actually being varied',
    fn: async () => {
      const file = '15-parity-matrix.vue'
      // A sweep that silently stopped sweeping would report a clean 192 rows
      // forever. Drive one cell by hand and confirm the pane geometry responds.
      const pane = __siv.stage(file).querySelector('.sweep')
      const before = { top: pane.clientTop, h: pane.clientHeight }
      __siv.button(file, 'Run the sweep').click()
      const changed = await __siv.until(
        () => (pane.clientTop !== before.top || pane.clientHeight !== before.h ? { t: pane.clientTop, h: pane.clientHeight } : null),
        20000,
        50,
      )
      await __siv.until(() => (__siv.out(file, 'summary') !== '—' ? true : null), 120000, 500)
      return {
        pass: !!changed,
        detail: `pane started at clientTop ${before.top} / clientHeight ${before.h}` +
          (changed ? `, observed ${changed.t} / ${changed.h} mid-sweep` : ', never changed'),
      }
    },
  },

  // -------------------------------------------------------------------------
  // 13 — SIV-2. The container path reads CSS `scroll-margin` / `scroll-padding`
  // since 1.3.0, so this card no longer demonstrates a divergence; it
  // demonstrates the convergence, and `offset` as the per-side override.
  // -------------------------------------------------------------------------
  {
    demo: '13-scroll-margin.vue',
    name: 'SIV-2: CSS scroll-margin-top opens the same gap on BOTH paths',
    fn: async () => {
      const file = '13-scroll-margin.vue'
      __siv.select(file, 'offset', 'none')
      await __siv.sleep(150)
      __siv.button(file, 'Run both').click()
      const nat = await __siv.settled(file, 'readout-native')
      const con = await __siv.settled(file, 'readout-container')
      const n = __siv.nums(nat)[0]
      const c = __siv.nums(con)[0]
      return {
        pass: n === 40 && c === 40,
        detail: `native gap ${n}px, container gap ${c}px — both expect 40`,
      }
    },
  },
  {
    demo: '13-scroll-margin.vue',
    name: 'offset { top: 0 } removes the CSS gap on both paths, rather than doing nothing',
    fn: async () => {
      const file = '13-scroll-margin.vue'
      __siv.select(file, 'offset', 'zero')
      await __siv.sleep(150)
      __siv.button(file, 'Run both').click()
      const nat = await __siv.settled(file, 'readout-native')
      const con = await __siv.settled(file, 'readout-container')
      const n = __siv.nums(nat)[0]
      const c = __siv.nums(con)[0]
      return { pass: n === 0 && c === 0, detail: `native gap ${n}px, container gap ${c}px — both expect 0` }
    },
  },
  {
    demo: '13-scroll-margin.vue',
    name: 'offset { top: 80 } overrides the CSS gap on both paths — it does not stack with it',
    fn: async () => {
      const file = '13-scroll-margin.vue'
      __siv.select(file, 'offset', 'eighty')
      await __siv.sleep(150)
      __siv.button(file, 'Run both').click()
      const nat = await __siv.settled(file, 'readout-native')
      const con = await __siv.settled(file, 'readout-container')
      const n = __siv.nums(nat)[0]
      const c = __siv.nums(con)[0]
      // 80, not 120: `offset` replaces `scroll-margin-top`, it is not added to it.
      return { pass: n === 80 && c === 80, detail: `native gap ${n}px, container gap ${c}px — both expect 80` }
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
  // These four measure the VERTICAL axis; the two after them measure the
  // horizontal one, which was not measurable at all until SIV-6 — the grid was
  // 8 × 8rem against a pane barely narrower, so every `inline` alignment
  // clamped at the scroll limit and three of the four were indistinguishable.
  // The grid is 16 columns now and the target sits where all four are
  // reachable from both ends.
  //
  // They read `.cell.target`, not a `span` inside it, because the directive is
  // on the cell: bound to the 23px emoji it used to hold, `block: 'start'`
  // aligned the emoji and clipped the cell.
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
        const t = __siv.stage(file).querySelector('.cell.target').getBoundingClientRect()
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
        const t = __siv.stage(file).querySelector('.cell.target').getBoundingClientRect()
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

  {
    demo: '06-alignment.vue',
    name: 'S3: offset.top is a LEADING-edge gap — none of it reaches an end alignment',
    fn: async () => {
      const file = '06-alignment.vue'
      const pane = __siv.stage(file).querySelector('#grid-pane')
      const bottomGap = async (offset) => {
        __siv.range(file, 'offset.top', offset)
        await __siv.sleep(150)
        __siv.button(file, 'Scroll').click()
        await __siv.still(pane)
        const t = __siv.stage(file).querySelector('.cell.target').getBoundingClientRect()
        const p = pane.getBoundingClientRect()
        return t.bottom - (p.top + pane.clientTop + pane.clientHeight)
      }
      __siv.select(file, 'block', 'end')
      const none = await bottomGap(0)
      const sixty = await bottomGap(60)
      return {
        // `offset` is the same request as `scroll-margin-top`, and CSS does not
        // apply that to an end alignment at all. The container path used to
        // subtract it from every alignment, so a chat pane pinned with
        // `block: 'end'` and a global offset rested 60px above the bottom while
        // the native path rested on it.
        pass: Math.abs(none) <= 2 && Math.abs(sixty - none) <= 2,
        detail: `bottom gap with no offset ${none.toFixed(1)}px, with offset 60 ${sixty.toFixed(1)}px — they must be the same`,
      }
    },
  },
  {
    demo: '06-alignment.vue',
    name: 'S3: a centred alignment moves by HALF the offset, as a scroll-margin does',
    fn: async () => {
      const file = '06-alignment.vue'
      const pane = __siv.stage(file).querySelector('#grid-pane')
      const centreError = async (offset) => {
        __siv.range(file, 'offset.top', offset)
        await __siv.sleep(150)
        __siv.button(file, 'Scroll').click()
        await __siv.still(pane)
        const t = __siv.stage(file).querySelector('.cell.target').getBoundingClientRect()
        const p = pane.getBoundingClientRect()
        return t.top + t.height / 2 - (p.top + pane.clientTop + pane.clientHeight / 2)
      }
      __siv.select(file, 'block', 'center')
      const none = await centreError(0)
      const sixty = await centreError(60)
      return {
        // Growing the scroll box by 60 on its leading edge moves the box's
        // centre up by 30, so the pane stops 30px earlier and the target comes
        // to rest 30px BELOW the scrollport's centre — half the gap, visible
        // above it. The pre-1.3.0 code moved it by the full 60.
        pass: Math.abs(none) <= 2 && Math.abs(sixty - none - 30) <= 2,
        detail: `centre error with no offset ${none.toFixed(1)}px, with offset 60 ${sixty.toFixed(1)}px (expects ${(none + 30).toFixed(1)}, i.e. half)`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 07 and 09 — two cards whose own prose was the finding. 07 showcased
  // `cancel()` through a button that is disabled every time a human looks at
  // it; 09 promised silence for a misconfigured `container`, which was the
  // complaint rather than the feature.
  // -------------------------------------------------------------------------
  {
    demo: '07-composable.vue',
    name: 'cancel() actually cancels: the queued frame never moves the pane',
    fn: async () => {
      const file = '07-composable.vue'
      const pane = __siv.pane(file)
      __siv.button(file, 'scroll() then cancel()').click()
      const text = await __siv.until(() => {
        const t = __siv.out(file, 'readout')
        return t && t !== '—' ? t : null
      }, 6000)
      return {
        pass: !!text && text.indexOf('never ran') !== -1 && text.indexOf("state was 'pending'") !== -1,
        detail: `readout "${text}", pane scrollTop ${pane.scrollTop}`,
      }
    },
  },
  {
    demo: '07-composable.vue',
    name: 'cancel() control: without it, the same scroll() does move the pane',
    fn: async () => {
      const file = '07-composable.vue'
      const pane = __siv.pane(file)
      pane.scrollTop = 0
      __siv.button(file, 'scroll()').click()
      await __siv.still(pane)
      return { pass: pane.scrollTop > 100, detail: `pane scrollTop ${pane.scrollTop} after an uncancelled scroll()` }
    },
  },
  {
    demo: '09-resilience.vue',
    name: 'each of the six broken containers warns, once — not one warning for all six',
    fn: async () => {
      const file = '09-resilience.vue'
      const seen = []
      const original = console.warn
      console.warn = (...args) => { seen.push(String(args[0])) ; original.apply(console, args) }
      try {
        __siv.button(file, 'Trigger every broken binding at once').click()
        await __siv.sleep(600)
      } finally {
        console.warn = original
      }
      const mine = seen.filter((m) => m.indexOf('[v-scroll-into-view]') === 0)
      const resolved = mine.filter((m) => m.indexOf('resolved to null') !== -1)
      return {
        // SIV-6 finding 3. Six broken bindings on six different elements, all
        // reaching the same sentence. Through 1.3.0 the latch was one global
        // set of strings, so the first of them spent it for the session and the
        // other five — and every misconfiguration anywhere on the page after
        // them — said nothing. Six elements, six lines.
        pass: resolved.length === 6 && mine.length === 6,
        detail: `${mine.length} warning(s), ${resolved.length} of them the null/detached one`,
      }
    },
  },
  {
    demo: '09-resilience.vue',
    name: 'and nothing throws, and no pane moves',
    fn: async () => {
      const file = '09-resilience.vue'
      const before = [...document.querySelectorAll('.pg-scroller')].map((p) => p.scrollTop)
      let threw = null
      try {
        __siv.button(file, 'Trigger every broken binding at once').click()
        await __siv.sleep(600)
      } catch (err) {
        threw = err.message
      }
      const after = [...document.querySelectorAll('.pg-scroller')].map((p) => p.scrollTop)
      return {
        pass: !threw && before.join() === after.join(),
        detail: threw ? `threw: ${threw}` : `${before.length} scrollers, all unmoved`,
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

  // -------------------------------------------------------------------------
  // 16 — SIV-6 finding 1. The horizontal axis, which nothing in this file
  // touched before: card 15's 192-row sweep pins `inline` to `'nearest'` on
  // equal-width panes, so a fix to the direction handling could regress without
  // a single check going red. It did, and the certifier found it in the live
  // 1.3.0 tarball. These five rows are the reason it cannot happen quietly again.
  //
  // Negative control: revert either half of the fix in
  // `v-scroll-into-view/src/execute-scroll.ts` (take the clamp sign from
  // `geo.targetRtl` again, or re-clamp a `null` axis) and run this file against
  // `dist` — the two single-row checks and the sweep all go red.
  // -------------------------------------------------------------------------
  {
    demo: '16-direction.vue',
    name: 'the direction sweep: 36 rows, both axes, every one on native\'s pixel',
    fn: async () => {
      const file = '16-direction.vue'
      __siv.button(file, 'Run the direction sweep').click()
      const summary = await __siv.until(() => {
        const t = __siv.out(file, 'summary')
        return t && t !== '—' ? t : null
      }, 60000, 300)
      const failures = [...__siv.stage(file).querySelectorAll('.fails tbody tr')].map((tr) =>
        [...tr.children].map((td) => __siv.txt(td)).join(' '),
      )
      return {
        pass: !!summary && summary.indexOf('disagree') === -1 && failures.length === 0,
        detail: `${summary ?? 'never finished'}${failures.length ? ' — ' + failures.slice(0, 6).join(' | ') : ''}`,
      }
    },
  },
  {
    demo: '16-direction.vue',
    name: 'sweep control: the rails really do change direction mid-sweep',
    fn: async () => {
      const file = '16-direction.vue'
      // A sweep that stopped sweeping would report a clean 36 rows forever.
      const rail = __siv.stage(file).querySelector('.rail')
      const seen = new Set([getComputedStyle(rail).direction])
      __siv.button(file, 'Run the direction sweep').click()
      const end = Date.now() + 30000
      while (Date.now() < end && seen.size < 2) {
        seen.add(getComputedStyle(rail).direction)
        await __siv.sleep(40)
      }
      await __siv.until(() => (__siv.out(file, 'summary') !== '—' ? true : null), 60000, 300)
      return {
        pass: seen.size === 2,
        detail: `pane directions observed during the run: ${[...seen].join(', ')}`,
      }
    },
  },
  {
    demo: '16-direction.vue',
    name: "an RTL card in an LTR rail: `inline: 'start'` lands where native lands, not on 0",
    fn: async () => {
      const file = '16-direction.vue'
      // The certifier's realistic repro: an LTR rail of cards whose items use
      // `dir="auto"` for user-generated text. 1.3.0: lib 0, native 223/559/1231.
      __siv.select(file, 'pane dir', 'ltr')
      __siv.select(file, 'target dir', 'rtl')
      __siv.select(file, 'inline', 'start')
      __siv.select(file, 'block', 'nearest')
      await __siv.sleep(120)
      __siv.button(file, 'Scroll both').click()
      const text = await __siv.settled(file, 'live')
      const [, lib, nat] = __siv.nums(text)
      return {
        pass: lib === nat && lib > 0,
        detail: `readout "${text}" — the LTR rail must reach a POSITIVE scrollLeft`,
      }
    },
  },
  {
    demo: '16-direction.vue',
    name: "an LTR card in an RTL rail: `inline: 'start'` reaches a NEGATIVE scrollLeft, not 0",
    fn: async () => {
      const file = '16-direction.vue'
      __siv.select(file, 'pane dir', 'rtl')
      __siv.select(file, 'target dir', 'ltr')
      __siv.select(file, 'inline', 'start')
      __siv.select(file, 'block', 'nearest')
      await __siv.sleep(120)
      __siv.button(file, 'Scroll both').click()
      const text = await __siv.settled(file, 'live')
      const [, lib, nat] = __siv.nums(text)
      return {
        pass: lib === nat && lib < 0,
        detail: `readout "${text}" — an RTL scroller runs 0…-max, so this must go negative`,
      }
    },
  },
  {
    demo: '16-direction.vue',
    name: 'a VERTICAL-only scroll leaves scrollLeft exactly where it was',
    fn: async () => {
      const file = '16-direction.vue'
      // The regression half, and the part that is strictly worse than 1.2.0:
      // `inline: 'nearest'` computes `null` for a target that is already
      // horizontally visible, and 1.3.0 ran that null through the clamp anyway.
      // Measured against the published artifact: a pane at 650 went to 0.
      __siv.select(file, 'pane dir', 'ltr')
      __siv.select(file, 'target dir', 'rtl')
      __siv.select(file, 'inline', 'nearest')
      __siv.select(file, 'block', 'start')
      await __siv.sleep(120)
      __siv.button(file, 'Scroll both, vertically only').click()
      const text = await __siv.settled(file, 'live')
      const [from, lib, nat] = __siv.nums(text)
      return {
        pass: from > 100 && lib === from && lib === nat,
        detail: `readout "${text}" — started at ${from}, so both panes must still be there`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 06 — SIV-6 finding 4. The card advertised "every native alignment including
  // the horizontal axis" while three of the four `inline` values landed on the
  // same `scrollLeft 0` at desktop width, because the content was only 87px
  // wider than the scrollport. A control nobody can tell apart from a broken
  // one is not a demonstration.
  // -------------------------------------------------------------------------
  {
    demo: '06-alignment.vue',
    name: 'the inline control moves the pane to three DIFFERENT places',
    fn: async () => {
      const file = '06-alignment.vue'
      const pane = __siv.stage(file).querySelector('#grid-pane')
      const at = {}
      for (const align of ['start', 'center', 'end']) {
        pane.scrollLeft = 0
        __siv.select(file, 'inline', align)
        __siv.select(file, 'block', 'start')
        __siv.select(file, 'behavior', 'instant')
        await __siv.sleep(120)
        __siv.button(file, 'Scroll').click()
        await __siv.still(pane)
        at[align] = Math.round(pane.scrollLeft)
      }
      const max = Math.round(pane.scrollWidth - pane.clientWidth)
      return {
        pass: at.start > at.center && at.center > at.end && at.end > 0 && at.start < max,
        detail: `start ${at.start} > center ${at.center} > end ${at.end} > 0, all under the ${max}px maximum`,
      }
    },
  },
  {
    demo: '06-alignment.vue',
    name: 'the directive is on the CELL, so a start alignment does not clip it',
    fn: async () => {
      const file = '06-alignment.vue'
      // It used to be bound to the 23px emoji inside the 128x80 cell, so
      // `block: 'start'` aligned the emoji and sliced the top off the thing the
      // eye reads as the target.
      const pane = __siv.stage(file).querySelector('#grid-pane')
      const cell = __siv.stage(file).querySelector('.cell.target')
      pane.scrollTop = 0
      __siv.select(file, 'block', 'start')
      __siv.select(file, 'inline', 'nearest')
      __siv.select(file, 'behavior', 'instant')
      await __siv.sleep(120)
      __siv.button(file, 'Scroll').click()
      await __siv.still(pane)
      const top = __siv.topIn(pane, cell)
      return {
        pass: Math.abs(top - pane.clientTop) <= 2,
        detail: `the highlighted cell rests ${top}px below the pane's border box (border ${pane.clientTop}px), so it is flush, not clipped`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 03 — SIV-6 finding 2. `container: paneRef.value ?? undefined` is what the
  // type used to force, and on the MOUNT-time scroll it means "no container":
  // native path, every ancestor moves, page included. The getter form is the
  // one that survives, because it is resolved at scroll time.
  // -------------------------------------------------------------------------
  {
    demo: '03-container.vue',
    name: 'mount-time, getter form: the pane scrolls and the box around it does not',
    fn: async () => {
      const file = '03-container.vue'
      __siv.select(file, 'on mount', 'getter')
      await __siv.sleep(120)
      __siv.button(file, 'Remount, scrolling on mount').click()
      const text = await __siv.settled(file)
      const [pane, outer] = __siv.nums(text)
      return {
        pass: pane > 300 && outer === 0,
        detail: `readout "${text}" — the pinned pane moved and the outer scroller did not`,
      }
    },
  },
  {
    demo: '03-container.vue',
    name: 'mount-time, `?? undefined`: the outer scroller moves — the trap, still visible',
    fn: async () => {
      const file = '03-container.vue'
      // Not a defect being asserted as fixed: `undefined` legitimately means
      // "no container". What 1.3.1 changes is that it is no longer SILENT, and
      // that the honest spelling (`paneRef.value`, raw null) now type-checks.
      __siv.select(file, 'on mount', 'coalesced')
      await __siv.sleep(120)
      __siv.button(file, 'Remount, scrolling on mount').click()
      const text = await __siv.settled(file)
      const [, outer] = __siv.nums(text)
      return {
        pass: outer > 50,
        detail: `readout "${text}" — native walks the whole ancestor chain, which is the thing \`container\` exists to stop`,
      }
    },
  },
  {
    demo: '03-container.vue',
    name: 'mount-time, raw null: nothing scrolls at all, and there is no native fallback',
    fn: async () => {
      const file = '03-container.vue'
      __siv.select(file, 'on mount', 'raw')
      await __siv.sleep(120)
      __siv.button(file, 'Remount, scrolling on mount').click()
      const text = await __siv.settled(file)
      const [pane, outer] = __siv.nums(text)
      return {
        pass: pane === 0 && outer === 0,
        detail: `readout "${text}" — a container that resolved to nothing scrolls nothing`,
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
  // -------------------------------------------------------------------------
  // SIV-6 finding 3's false alarm. This one is here rather than in CHECKS
  // because what it asserts about is the console at PAGE LOAD, before any check
  // has run — which only the Node side of the harness is still holding.
  // (Card 09's six-warnings check is an ordinary in-page check: it patches
  // `console.warn` around its own click, so it does not need this.)
  // -------------------------------------------------------------------------
  {
    demo: '05-always.vue',
    name: 'a correctly configured chat pane that is not full yet says nothing at page load',
    async run(ctx) {
      // The false alarm that used to spend the latch for the whole session, on
      // a demo that is working perfectly: an empty chat pane has `overflow-y:
      // auto` and nothing to scroll, which is a chat nobody has written in, not
      // a misconfiguration. Nothing on this tab should produce that sentence.
      const noisy = ctx.page.consoleWarnings.filter((w) => w.includes('no scrollable overflow'))
      return {
        pass: noisy.length === 0,
        detail: noisy.length
          ? `"${noisy[0].slice(0, 120)}" — fired on a pane that is simply not full`
          : 'no "no scrollable overflow" warning anywhere on the tab, at load or since',
      }
    },
  },
]

export default {
  library: 'v-scroll-into-view',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
