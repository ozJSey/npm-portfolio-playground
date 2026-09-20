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
      // Read the numbers by NAME. The readout used to carry one number, so the
      // spec took `nums()[0]`; it now reports where focus() landed the target
      // as well as where it came to rest, and a positional read silently
      // compared the wrong pair.
      const resting = (t) => Number(/resting (-?\d+)/.exec(t)?.[1])
      const landed = (t) => Number(/landed it at (-?\d+)/.exec(t)?.[1])

      __siv.select(file, 'order', 'none')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const alone = resting(await __siv.settled(file))

      __siv.select(file, 'order', 'focus')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const focusText = await __siv.settled(file)
      const focused = resting(focusText)

      // Stricter than "they disagree": the claim is that the directive leaves
      // the browser's landing alone, so the resting position must BE the one
      // focus() produced, not merely some other number.
      return {
        pass: Math.abs(alone - focused) > 20 && focused === landed(focusText),
        detail:
          `directive alone rests at ${alone}; focus() landed it at ${landed(focusText)} and it ` +
          `rested at ${focused} — these must disagree, and the resting one must be the browser's`,
      }
    },
  },
  {
    demo: '14-focus.vue',
    name: 'B4 remedy: focus({ preventScroll: true }) lands exactly where the directive alone does',
    fn: async () => {
      const file = '14-focus.vue'
      const resting = (t) => Number(/resting (-?\d+)/.exec(t)?.[1])

      __siv.select(file, 'order', 'none')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const alone = resting(await __siv.settled(file))

      __siv.select(file, 'order', 'prevent')
      await __siv.sleep(150)
      __siv.button(file, 'Run').click()
      const text = await __siv.settled(file)
      const prevented = resting(text)

      return {
        pass: Math.abs(alone - prevented) <= 2 && text.indexOf('focused true') !== -1,
        detail: `directive alone rests at ${alone}, preventScroll rests at ${prevented} — readout "${text}"`,
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
      __siv.button(file, 'Park sideways, then scroll vertically only').click()
      const text = await __siv.settled(file, 'live')
      const [from, lib, nat, moved] = __siv.nums(text)
      // `moved` is reported by the card rather than derived here on purpose: it
      // is the one number a reader can check against the rail with their own
      // eyes, so the gate asserts the same value the card is showing them.
      return {
        pass: from > 100 && lib === from && lib === nat && moved === 0,
        detail: `readout "${text}" — parked at ${from}, so both panes must still be there and moved must be 0`,
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

  // -------------------------------------------------------------------------
  // 02 and 08 — the two cards on this tab that had no check at all, and between
  // them the two claims nothing else here measures.
  //
  // 02 is the only card where the directive is written once and mounted FORTY
  // times, which is the shape every real list has, and the only one whose
  // correctness is a NON-event: `block: 'nearest'` on an active row that is
  // already on screen must move the pane by zero. Every other `nearest` check
  // in this file drives a target that is off screen, where `nearest` and `end`
  // (approached from above) compute the same answer — so all of them would
  // still pass if `nearest` silently became `end`, and a list that yanks itself
  // by a row on every arrow-key press would ship green. `alignAxis` returns
  // `null` for an in-view target and `scrollOne` then never calls `scrollTo`,
  // so "did not move" is `===`, not a tolerance.
  //
  // 08 owns the CSS hook. Nothing else on the tab reads
  // `data-scroll-into-view-state`, and asserting the attribute is *present*
  // would be worth nothing — `mounted()` writes 'idle' unconditionally, so a
  // directive whose scheduling was entirely removed would still satisfy it.
  // What a consumer actually buys is a ring that LIGHTS: the checks below read
  // the computed `outline-width` at the instant the attribute flips, so the
  // stylesheet in the card has to have matched.
  // -------------------------------------------------------------------------
  {
    demo: '02-v-for-active.vue',
    name: "block: 'nearest' in a v-for: stepping across rows that are already on screen moves the list by zero",
    fn: async () => {
      const file = '02-v-for-active.vue'
      const pane = __siv.pane(file)
      const rows = [...__siv.stage(file).querySelectorAll('.row')]
      const inner = pane.clientHeight
      const origin = () => pane.getBoundingClientRect().top + pane.clientTop
      const seenBottom = (el) => el.getBoundingClientRect().bottom - origin()
      const pitch = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top

      // The last row fully inside the resting pane. Everything up to it is a
      // step `nearest` must decline.
      let lastFull = -1
      for (let i = 0; i < rows.length; i++) if (seenBottom(rows[i]) <= inner + 0.5) lastFull = i
      if (lastFull < 2) {
        // Not a library failure — a card that stopped posing the question. Two
        // visible rows is one step, and one step is not a demonstration.
        return {
          pass: false,
          detail: `only ${lastFull + 1} row(s) of ${rows.length} fit in the ${inner}px pane (pitch ${pitch.toFixed(1)}px) — this check needs at least three so there is something to step ACROSS`,
        }
      }

      const seen = []
      for (let i = 1; i <= lastFull; i++) {
        __siv.button(file, 'next').click()
        await __siv.still(pane)
        seen.push(pane.scrollTop)
      }
      const active = __siv.txt(__siv.stage(file).querySelector('.row.active'))
      return {
        // `===` rather than a tolerance on purpose: `nearest` on an in-view
        // target computes `null` and no `scrollTo` is issued, so the only
        // honest expectation is the same number the pane already held.
        pass: seen.every((v) => v === 0) && active === `Item ${lastFull + 1}`,
        detail:
          `${lastFull} step(s) through the ${lastFull + 1} rows that fit in the ${inner}px pane ` +
          `(pitch ${pitch.toFixed(1)}px): scrollTop ${seen.join(' → ')} — every one must be 0, and a ` +
          `start alignment would have reached ${(lastFull * pitch).toFixed(1)}. Active row "${active}" ` +
          `(expects "Item ${lastFull + 1}")`,
      }
    },
  },
  {
    demo: '02-v-for-active.vue',
    name: "block: 'nearest' in a v-for: the first row past the fold moves the list by its overhang, and lands flush",
    fn: async () => {
      const file = '02-v-for-active.vue'
      const pane = __siv.pane(file)
      const rows = [...__siv.stage(file).querySelectorAll('.row')]
      const inner = pane.clientHeight
      const origin = () => pane.getBoundingClientRect().top + pane.clientTop
      const seenTop = (el) => el.getBoundingClientRect().top - origin()
      const seenBottom = (el) => el.getBoundingClientRect().bottom - origin()
      const pitch = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top

      let first = -1
      for (let i = 0; i < rows.length && first < 0; i++) if (seenBottom(rows[i]) > inner + 0.5) first = i
      if (first < 2) {
        return {
          pass: false,
          detail: `the first row clipped by the ${inner}px pane is index ${first} (pitch ${pitch.toFixed(1)}px) — too near the top for "moved the minimum" to mean anything`,
        }
      }
      const overhang = seenBottom(rows[first]) - inner
      const startWould = seenTop(rows[first])

      // `first` presses from the resting index 0 land ON row `first` — the
      // first one that does not fit. The presses before it are the no-ops the
      // check above owns; this one is the only press that may move anything.
      for (let i = 0; i < first; i++) {
        __siv.button(file, 'next').click()
        await __siv.still(pane)
      }
      const active = __siv.txt(__siv.stage(file).querySelector('.row.active'))
      const flush = seenBottom(rows[first]) - inner
      const moved = pane.scrollTop
      return {
        // Tolerance, not equality: the row pitch is a fractional line box, so
        // the overhang this check predicts is fractional too. It is still far
        // tighter than the thing it separates — `start` would have moved
        // `startWould`, several rows further.
        pass:
          active === `Item ${first + 1}` &&
          Math.abs(moved - overhang) <= 1.5 &&
          Math.abs(flush) <= 1.5 &&
          moved < pitch,
        detail:
          `"${active}" (expects "Item ${first + 1}") overhung the ${inner}px pane by ${overhang.toFixed(1)}px ` +
          `and the list moved ${moved.toFixed(1)}px (a start alignment would have moved ${startWould.toFixed(1)}, ` +
          `an entire row is ${pitch.toFixed(1)}); its bottom edge now sits ${flush.toFixed(1)}px past the ` +
          `pane's inner bottom, so it is flush and unclipped`,
      }
    },
  },
  {
    demo: '02-v-for-active.vue',
    name: "block: 'nearest' is not 'end': stepping BACK to a row already on screen does not drag the list up",
    fn: async () => {
      const file = '02-v-for-active.vue'
      const pane = __siv.pane(file)
      const rows = [...__siv.stage(file).querySelectorAll('.row')]
      const inner = pane.clientHeight

      __siv.button(file, 'jump to last').click()
      await __siv.still(pane)
      const atBottom = pane.scrollTop
      const max = pane.scrollHeight - pane.clientHeight

      __siv.button(file, 'prev').click()
      await __siv.still(pane)
      __siv.button(file, 'prev').click()
      await __siv.still(pane)
      const after = pane.scrollTop

      const row = rows[rows.length - 3]
      const origin = pane.getBoundingClientRect().top + pane.clientTop
      const top = row.getBoundingClientRect().top - origin
      const bottom = row.getBoundingClientRect().bottom - origin
      // Where an `end` alignment would have parked it — the number this check
      // exists to be different from. Every other `nearest` assertion in this
      // file approaches from above, where the two agree.
      const endWould = after + bottom - inner
      const active = __siv.txt(__siv.stage(file).querySelector('.row.active'))

      return {
        pass:
          Math.abs(atBottom - max) <= 1.5 &&
          after === atBottom &&
          top >= -0.5 &&
          bottom <= inner + 0.5 &&
          active === `Item ${rows.length - 2}`,
        detail:
          `jump to last parked the list at ${atBottom.toFixed(1)} of ${max.toFixed(1)}; two ← prev later ` +
          `it is at ${after.toFixed(1)} — unmoved, where an end alignment would have dragged it to ` +
          `${endWould.toFixed(1)}. Active row "${active}" (expects "Item ${rows.length - 2}") sits at ` +
          `${top.toFixed(1)}…${bottom.toFixed(1)} inside the ${inner}px pane`,
      }
    },
  },
  {
    demo: '02-v-for-active.vue',
    name: "behavior: 'smooth' is passed through: the wrap to the last row animates instead of jumping",
    fn: async () => {
      const file = '02-v-for-active.vue'
      const pane = __siv.pane(file)
      // ← prev from the first row wraps to the fortieth: the longest scroll the
      // card can ask for, and the one a human watches.
      __siv.button(file, 'prev').click()
      const trace = await __siv.trace(pane, 1200)
      const moves = __siv.moves(trace)
      await __siv.still(pane)

      const rows = [...__siv.stage(file).querySelectorAll('.row')]
      const last = rows[rows.length - 1]
      const origin = pane.getBoundingClientRect().top + pane.clientTop
      const bottom = last.getBoundingClientRect().bottom - origin
      const max = pane.scrollHeight - pane.clientHeight
      const chip = __siv.txt(__siv.stage(file).querySelector('.pg-chip'))

      return {
        pass:
          moves.length >= 4 &&
          Math.abs(pane.scrollTop - max) <= 1.5 &&
          Math.abs(bottom - pane.clientHeight) <= 1.5 &&
          chip === `active: Item ${rows.length}`,
        detail:
          `${moves.length} distinct scrollTop position(s) between ${trace[0]} and ${Math.round(pane.scrollTop)} ` +
          `of a ${Math.round(max)}px range — an instant scroll is exactly 1; the last row's bottom rests ` +
          `${bottom.toFixed(1)}px into the ${pane.clientHeight}px pane; chip reads "${chip}"`,
      }
    },
  },

  {
    demo: '08-state-attribute.vue',
    name: 'the ring actually lights: idle → pending → idle, and the CSS keyed on it paints 3px of outline',
    fn: async () => {
      const file = '08-state-attribute.vue'
      const target = __siv.stage(file).querySelector('.target')
      const ATTR = 'data-scroll-into-view-state'
      const seen = []
      // `getComputedStyle` inside the callback is the whole point: the record
      // says the attribute changed, the computed outline says the stylesheet
      // MATCHED. A renamed attribute, a state value the CSS does not spell, or
      // a scope id that no longer lands on the host all read as 0px here while
      // the attribute assertion on its own would still be green.
      const obs = new MutationObserver((records) => {
        const now = target.getAttribute(ATTR)
        const outline = getComputedStyle(target).outlineWidth
        for (let i = 0; i < records.length; i++) {
          const last = i + 1 === records.length
          seen.push({
            from: records[i].oldValue,
            to: last ? now : records[i + 1].oldValue,
            // Only the final record of a batch has a computed style that
            // belongs to it. A pending/idle pair delivered in ONE batch means
            // the ring never survived to a frame — which is a failure, and is
            // reported as one rather than silently measured against the wrong
            // state.
            outline: last ? outline : '(batched — never painted)',
          })
        }
      })
      obs.observe(target, { attributes: true, attributeFilter: [ATTR], attributeOldValue: true })

      const before = { value: target.getAttribute(ATTR), outline: getComputedStyle(target).outlineWidth }
      __siv.button(file, 'watch the ring').click()
      await __siv.sleep(1500)
      obs.disconnect()
      const after = { value: target.getAttribute(ATTR), outline: getComputedStyle(target).outlineWidth }

      const pending = seen.find((s) => s.to === 'pending')
      const path = seen.map((s) => `${s.from}→${s.to} @${s.outline}`).join(', ')
      return {
        pass:
          before.value === 'idle' &&
          parseFloat(before.outline) === 0 &&
          !!pending &&
          pending.from === 'idle' &&
          parseFloat(pending.outline) >= 3 &&
          seen.length >= 2 &&
          seen[seen.length - 1].to === 'idle' &&
          after.value === 'idle' &&
          parseFloat(after.outline) === 0,
        detail:
          `at rest ${before.value}/${before.outline}; transitions ${path || '(none — the attribute never moved)'}; ` +
          `settled ${after.value}/${after.outline} — the ring must be unlit before, 3px while pending, and unlit after`,
      }
    },
  },
  {
    demo: '08-state-attribute.vue',
    name: "'pending' is the queued frame, not the journey: the ring lights with the pane still at rest and is out before it arrives",
    fn: async () => {
      const file = '08-state-attribute.vue'
      const pane = __siv.pane(file)
      const target = __siv.stage(file).querySelector('.target')
      const ATTR = 'data-scroll-into-view-state'
      const marks = []
      const obs = new MutationObserver(() => {
        marks.push({ value: target.getAttribute(ATTR), at: performance.now(), scrollTop: pane.scrollTop })
      })
      obs.observe(target, { attributes: true, attributeFilter: [ATTR] })

      __siv.button(file, 'watch the ring').click()
      await __siv.until(() => marks.some((m) => m.value === 'idle'), 3000, 16)
      obs.disconnect()
      await __siv.until(() => pane.scrollTop > 0, 3000, 16)
      await __siv.still(pane, 4000)

      const pi = marks.findIndex((m) => m.value === 'pending')
      const pending = pi >= 0 ? marks[pi] : null
      const idle = pi >= 0 ? marks.slice(pi + 1).find((m) => m.value === 'idle') : null
      const held = pending && idle ? idle.at - pending.at : NaN
      return {
        // The contract the card's blurb sells: 'pending' spans the rAF the
        // directive queued, and the scroll happens on the far side of it. A
        // ring that stayed lit for the whole travel — or one lit after the
        // pane had already started moving — is a different, worse hook, and
        // both of those read here.
        pass: !!pending && pending.scrollTop === 0 && !!idle && held < 100 && pane.scrollTop > 100,
        detail:
          `ring lit with the pane at scrollTop ${pending ? pending.scrollTop : 'n/a'} (must be 0 — nothing ` +
          `has scrolled yet), held ${Number.isFinite(held) ? held.toFixed(1) : 'n/a'}ms (one frame ≈ 17ms), ` +
          `and the pane then travelled to ${Math.round(pane.scrollTop)}; states seen: ` +
          `${marks.map((m) => m.value).join(' → ') || '(none)'}`,
      }
    },
  },
  {
    demo: '08-state-attribute.vue',
    name: "block: 'center' behind the ring: the target parks on the pane's midline, and nothing outside the pane moves",
    fn: async () => {
      const file = '08-state-attribute.vue'
      const pane = __siv.pane(file)
      const target = __siv.stage(file).querySelector('.target')
      // Every scrollable thing above the pane. `container` exists precisely to
      // keep these still; dropping it would leave the centring assertion below
      // green (the pane is the nearest scrollable ancestor, so it moves either
      // way) while the page lurched under the reader.
      const outer = []
      for (let n = pane.parentElement; n; n = n.parentElement) outer.push(n)
      if (document.scrollingElement && !outer.includes(document.scrollingElement)) {
        outer.push(document.scrollingElement)
      }
      const beforeOuter = outer.map((n) => n.scrollTop)
      const before = pane.scrollTop

      __siv.button(file, 'watch the ring').click()
      await __siv.until(() => pane.scrollTop > 0, 3000, 16)
      await __siv.still(pane, 4000)

      const p = pane.getBoundingClientRect()
      const t = target.getBoundingClientRect()
      const mid = t.top + t.height / 2 - (p.top + pane.clientTop + pane.clientHeight / 2)
      const afterOuter = outer.map((n) => n.scrollTop)
      const drifted = outer
        .map((n, i) => (afterOuter[i] === beforeOuter[i] ? null : `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''} ${beforeOuter[i]}→${afterOuter[i]}`))
        .filter(Boolean)
      const max = pane.scrollHeight - pane.clientHeight

      return {
        pass: before === 0 && pane.scrollTop > 100 && Math.abs(mid) <= 2 && drifted.length === 0,
        detail:
          `pane ${before} → ${Math.round(pane.scrollTop)} of ${Math.round(max)}; the target's centre rests ` +
          `${mid.toFixed(1)}px off the ${pane.clientHeight}px pane's midline; ${outer.length} ancestor ` +
          `scroller(s) ${drifted.length ? 'MOVED: ' + drifted.join(', ') : 'all unmoved'}`,
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
