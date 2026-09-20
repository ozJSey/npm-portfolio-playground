/**
 * Interaction checks for the `v-observe` tab — the package's first browser
 * spec.
 *
 * `v-observe` wraps IntersectionObserver, ResizeObserver and MutationObserver,
 * and jsdom implements none of them in a way that can answer the questions
 * that matter: there is no layout, so there are no intersection ratios, no box
 * sizes and no `device-pixel-content-box`. Its unit suite drives mocks the
 * suite itself constructs — which is how the package shipped for months with
 * `root` never reaching the observer, `box` never reaching `observe()`, and
 * `mutate: { on: 'attr:*' }` freezing the tab.
 *
 * So every check here reads a consequence out of the live DOM after a real
 * scroll, a real box change or a real DOM edit:
 *
 * - `root` / `rootMargin` — a probe BELOW the pane's bottom edge lights up as
 *   the margin grows, without the page moving at all. A viewport-rooted
 *   observer cannot do that: the pane clips the probe whatever the margin is.
 * - `box` — with `box-sizing: content-box` and a fixed width, a padding change
 *   moves the border box and leaves the content box alone. `box: 'border'`
 *   must report it and `box: 'content'` must not, which is only true if the
 *   box reaches `observe()`.
 * - `attr:*` — the freeze check. It is deliberately LAST: a renderer that
 *   locks up takes the CDP connection with it (`cdp.mjs` has no send timeout,
 *   ticket PG-21), so it races its own reads and anything after it would be
 *   collateral.
 *
 * Note for anyone extending this file: `__pg.txt()` collapses whitespace, so
 * every `pre.pg-log` read here is a single line. Match with regexes, never by
 * splitting on newlines.
 */
import { setTimeout as sleep } from 'node:timers/promises'

const PRELUDE = `
window.__obs = {
  scroller(file) {
    const s = __pg.stage(file).querySelector('.pg-scroller')
    if (!s) throw new Error('no .pg-scroller on ' + file)
    return s
  },
  /** Whitespace-collapsed, newest entry first. */
  log(file, i) { return __pg.txt(__pg.stage(file).querySelectorAll('pre.pg-log')[i || 0]) },
  kv(file, i) { return __pg.txt(__pg.stage(file).querySelectorAll('.pg-kv')[i || 0]) },
  state(el) { return el ? el.getAttribute('data-observe-state') : null },
  segment(el, mode) {
    const m = new RegExp(mode + ':([^;]+)').exec(this.state(el) || '')
    return m ? m[1] : null
  },
  slider(file, needle) {
    const l = __pg.label(file, needle)
    if (!l) throw new Error('no slider labelled ' + needle + ' on ' + file)
    return l.querySelector('input[type=range]')
  },
  select(file) { return __pg.stage(file).querySelector('select') },
  /** Scroll a pane so that \`el\`'s top sits \`gap\` px below the pane's bottom edge. */
  async park(scroller, el, gap) {
    const d = () => el.getBoundingClientRect().top - scroller.getBoundingClientRect().bottom
    scroller.scrollTop += d() - gap
    await __pg.sleep(400)
    return Math.round(d())
  },
  opacity(el) { return Number(getComputedStyle(el).opacity) },
}
'ready'
`

const ROOT_MARGIN = '05-root-margin.vue'
const LAZY = '01-lazy-once.vue'
const CROSSED = '02-thresholds-crossed.vue'
const DIRECTION = '03-direction.vue'
const CSS_ONLY = '04-css-only.vue'
const TICK = '06-resize-tick.vue'
const BRACKETS = '07-resize-breakpoints.vue'
const RESIZE_CROSSED = '08-resize-crossed.vue'
const ORIENT = '09-resize-orientation.vue'
const BOXES = '10-resize-box-debounce.vue'
const ATTR = '11-mutate-attr.vue'
const CHILDREN = '12-mutate-children.vue'
const TEXT = '13-mutate-text.vue'
const REMOVED = '14-mutate-removed.vue'
const MULTI = '15-mutate-multi.vue'
const GATE = '16-gate-on-intersect.vue'
const COMBINED = '17-combined.vue'

const CHECKS = [
  {
    demo: ROOT_MARGIN,
    // The whole `root` story in one check, with nothing moving. The eager
    // probe sits a measured distance below the pane's bottom edge, and the
    // preload distance is swept to just under and just over it: the hit line
    // is bracketed to within one slider step of where the pane's edge actually
    // is. A viewport-rooted observer cannot produce this — the pane's overflow
    // clips the probe whatever the margin is — and a margin frozen at mount
    // cannot produce it either, because nothing here moves except the slider.
    // The second probe has no `rootMargin` at all and is the control: it stays
    // dark throughout, so the effect belongs to the option and not to the
    // scroll position.
    name: 'sweeping rootMargin brackets the hit line at the pane edge — `root` IS the pane, live',
    fn: async () => {
      const file = '05-root-margin.vue'
      const stage = __pg.stage(file)
      const scroller = __obs.scroller(file)
      const [eager, plain] = [...stage.querySelectorAll('.probe')]
      const hit = (el) => el.classList.contains('hit')
      const slider = __obs.slider(file, 'rootMargin')

      // A little scroll so the far probe sits comfortably inside the slider's
      // 220px ceiling — the margins below are then derived from what was
      // actually measured rather than from numbers baked into this file.
      scroller.scrollTop = 40
      await __pg.sleep(400)
      const gaps = [eager, plain].map((el) =>
        Math.round(el.getBoundingClientRect().top - scroller.getBoundingClientRect().bottom),
      )
      // The slider steps by 20, so bracket the measured gap from both sides.
      const under = Math.max(0, Math.floor((gaps[0] - 10) / 20) * 20)
      const over = Math.min(220, Math.ceil((gaps[0] + 15) / 20) * 20)

      const at = async (margin) => {
        __pg.button(file, 'Reset flags').click()
        await __pg.sleep(150)
        __pg.set(slider, margin)
        await __pg.sleep(700)
        return `${hit(eager) ? 'eager' : '-'}/${hit(plain) ? 'plain' : '-'}`
      }

      const none = await at(0)
      const justUnder = await at(under)
      const justOver = await at(over)

      return {
        pass:
          gaps[0] > 40 &&
          gaps[1] > gaps[0] &&
          under < gaps[0] && over > gaps[0] &&
          none === '-/-' &&
          justUnder === '-/-' &&
          justOver === 'eager/-',
        detail:
          `eager probe ${gaps[0]}px below the pane edge, plain probe ${gaps[1]}px · ` +
          `margin 0 → ${none} · ${under} (under) → ${justUnder} · ${over} (over) → ${justOver}`,
      }
    },
  },
  {
    demo: ROOT_MARGIN,
    name: 'with no preload distance the near probe only lights up once it really enters the pane',
    fn: async () => {
      const file = '05-root-margin.vue'
      const scroller = __obs.scroller(file)
      const eager = __pg.stage(file).querySelectorAll('.probe')[0]

      __pg.set(__obs.slider(file, 'rootMargin'), 0)
      await __pg.sleep(300)
      scroller.scrollTop = 0
      __pg.button(file, 'Reset flags').click()
      await __pg.sleep(400)

      const parkedOutside = await __obs.park(scroller, eager, 40)
      const outside = eager.classList.contains('hit')
      const parkedInside = await __obs.park(scroller, eager, -30)
      const inside = await __pg.until(() => eager.classList.contains('hit'), 3000)

      return {
        pass: parkedOutside > 20 && outside === false && parkedInside < 0 && inside === true,
        detail: `${parkedOutside}px below the edge → hit=${outside}; ${parkedInside}px (inside) → hit=${inside}`,
      }
    },
  },
  {
    demo: LAZY,
    name: 'once: true really disconnects — the callback count freezes across four more passes',
    fn: async () => {
      const file = '01-lazy-once.vue'
      const scroller = __obs.scroller(file)
      const card = __pg.stage(file).querySelector('.card')
      const calls = () => Number(/callbacks:\s*(\d+)/.exec(__obs.kv(file))?.[1] ?? -1)

      await __obs.park(scroller, card, -40) // fully inside the pane
      const loaded = await __pg.until(() => __obs.kv(file).includes('loaded: true'), 3000)
      const afterFirst = calls()

      for (const gap of [600, -40, 600, -40]) await __obs.park(scroller, card, gap)
      await __pg.sleep(500)

      return {
        pass: loaded === true && afterFirst > 0 && calls() === afterFirst,
        detail: `loaded=${loaded} callbacks after the first hit=${afterFirst}, after four more passes=${calls()}`,
      }
    },
  },
  {
    demo: CROSSED,
    // `lastRatio` used to start at a fabricated 0, so an element that merely
    // mounted part-visible emitted `up` crossings for everything below its
    // ratio — README recipe 2 would call loadNextPage() during mount.
    name: 'no crossings at mount; a real scroll then reports them in ascending order',
    fn: async () => {
      const file = '02-thresholds-crossed.vue'
      const scroller = __obs.scroller(file)
      const sentinel = __pg.stage(file).querySelector('.sentinel')
      const atMount = __obs.log(file)
      const pagesAtMount = /pages loaded:\s*(\d+)/.exec(__pg.txt(sentinel))?.[1]

      await __obs.park(scroller, sentinel, -80)
      await __pg.until(() => __obs.log(file) !== atMount, 3000)
      await __pg.sleep(500)

      // Newest first in the log, so reverse for chronological order.
      const ups = [...__obs.log(file).matchAll(/threshold ([\d.]+) crossed up/g)]
        .map((m) => Number(m[1]))
        .reverse()
      const ascending = ups.every((v, i, a) => i === 0 || v >= a[i - 1])

      return {
        pass:
          atMount.startsWith('— nothing crossed yet') &&
          pagesAtMount === '1' &&
          ups.length >= 2 &&
          ascending,
        detail: `atMount="${atMount}" pages=${pagesAtMount} ups=${JSON.stringify(ups)}`,
      }
    },
  },
  {
    demo: CROSSED,
    name: 'scrolling back out emits the matching down crossings, newest first',
    fn: async () => {
      const file = '02-thresholds-crossed.vue'
      const scroller = __obs.scroller(file)
      const sentinel = __pg.stage(file).querySelector('.sentinel')

      await __obs.park(scroller, sentinel, -80)
      await __pg.sleep(600)
      await __obs.park(scroller, sentinel, 400)
      await __pg.sleep(600)

      const log = __obs.log(file)
      // Newest first, so reverse each list to read it chronologically.
      const downs = [...log.matchAll(/threshold ([\d.]+) crossed down/g)]
        .map((m) => Number(m[1]))
        .reverse()
      const ups = [...log.matchAll(/threshold ([\d.]+) crossed up/g)].map((m) => Number(m[1]))
      const descending = downs.every((v, i, a) => i === 0 || v <= a[i - 1])

      return {
        pass:
          downs.length >= 2 &&
          ups.length >= 1 &&
          descending &&
          // The downs are the newest entries: leaving happened after entering.
          log.indexOf('down') < log.indexOf('up'),
        detail: `downs (chronological)=${JSON.stringify(downs)} ups=${JSON.stringify(ups)}`,
      }
    },
  },
  {
    demo: DIRECTION,
    // `direction` is inferred from where the element's top was on the PREVIOUS
    // tick, so it is the one piece of intersect data that cannot be read off a
    // single entry — and the one jsdom can never produce, because nothing there
    // has a top. The card is driven through a full pass: in from below, out
    // over the top, and back in from above, with the pane's own geometry
    // measured at every stop so a layout change fails the check instead of
    // silently inverting it.
    //
    // An inverted delta would report `enter-from-above` for a scroll DOWN and
    // animate the panel in from the wrong edge. A `direction` that only ever
    // described entries would leave `leave-to-above` unreported.
    name: 'a pass through the pane reports enter-from-below, leave-to-above, then enter-from-above',
    fn: async () => {
      const file = '03-direction.vue'
      const scroller = __obs.scroller(file)
      const reveal = __pg.stage(file).querySelector('.reveal')
      const dir = () => /last direction:\s*(\S+)/.exec(__pg.txt(reveal))?.[1] ?? '(unreadable)'
      const badge = () => reveal.getAttribute('data-reveal')
      const anim = () => getComputedStyle(reveal).animationName

      scroller.scrollTop = 0
      await __pg.sleep(500)
      const pane = Math.round(scroller.getBoundingClientRect().height)
      const tall = Math.round(reveal.getBoundingClientRect().height)

      // Parked below the pane's bottom edge: nothing has been crossed yet.
      const belowGap = await __obs.park(scroller, reveal, 60)
      const hidden = { dir: dir(), badge: badge() }

      // Down into the pane — the section's top travels UP the viewport.
      const inGap = await __obs.park(scroller, reveal, -40)
      await __pg.until(() => dir() !== '—', 3000)
      const entered = { dir: dir(), badge: badge(), anim: anim() }

      // Further down, until the whole section clears the pane's TOP edge.
      const aboveGap = await __obs.park(scroller, reveal, -(pane + tall + 40))
      await __pg.until(() => dir().startsWith('leave'), 3000)
      const left = { dir: dir(), badge: badge() }

      // Back up: the top now travels DOWN, so it comes in from above.
      const backGap = await __obs.park(scroller, reveal, -40)
      await __pg.until(() => dir() === 'enter-from-above', 3000)
      const reentered = { dir: dir(), badge: badge(), anim: anim() }

      return {
        pass:
          belowGap > 40 &&
          hidden.dir === '—' &&
          hidden.badge === null &&
          inGap < 0 &&
          entered.dir === 'enter-from-below' &&
          entered.badge === 'from-below' &&
          // Clear of the top edge, not merely scrolled a bit.
          aboveGap + pane + tall < 0 &&
          left.dir === 'leave-to-above' &&
          // Leaving is not an entry: the reveal animation keeps its direction.
          left.badge === 'from-below' &&
          backGap < 0 &&
          reentered.dir === 'enter-from-above' &&
          reentered.badge === 'from-above' &&
          // …and the two directions really paint differently.
          entered.anim !== 'none' &&
          reentered.anim !== 'none' &&
          entered.anim !== reentered.anim,
        detail:
          `pane ${pane}px, section ${tall}px · ` +
          `${belowGap}px below → ${hidden.dir}/${hidden.badge} · ` +
          `${inGap}px inside → ${entered.dir}/${entered.badge}/${entered.anim} · ` +
          `${aboveGap}px (clear of the top) → ${left.dir}/${left.badge} · ` +
          `${backGap}px inside again → ${reentered.dir}/${reentered.badge}/${reentered.anim}`,
      }
    },
  },
  {
    demo: DIRECTION,
    // The card's handler bails on `if (!e.direction) return`, so everything it
    // shows depends on `direction` being null whenever visibility did NOT flip.
    // The first-tick fallback is the risk: it compares the element's top
    // against the root's centre, and running it for an entry that never
    // happened would announce a direction — and start an animation — for a
    // section the reader has not reached yet.
    name: 'silent at mount and across scrolls that never flip visibility; speaks the moment it enters',
    fn: async () => {
      const file = '03-direction.vue'
      const scroller = __obs.scroller(file)
      const reveal = __pg.stage(file).querySelector('.reveal')
      const dir = () => /last direction:\s*(\S+)/.exec(__pg.txt(reveal))?.[1] ?? '(unreadable)'
      const gap = () =>
        Math.round(reveal.getBoundingClientRect().top - scroller.getBoundingClientRect().bottom)

      scroller.scrollTop = 0
      await __pg.sleep(600)
      const mounted = {
        dir: dir(),
        badge: reveal.getAttribute('data-reveal'),
        anim: getComputedStyle(reveal).animationName,
        gap: gap(),
      }

      // Two scrolls that move the section without ever putting it in the pane.
      const steps = []
      for (const target of [Math.max(30, mounted.gap - 40), Math.max(15, mounted.gap - 80)]) {
        const parked = await __obs.park(scroller, reveal, target)
        steps.push(`${parked}px→${dir()}`)
      }
      const stillSilent = dir()
      const stillDark = reveal.getAttribute('data-reveal')

      // …and now one that does.
      const inGap = await __obs.park(scroller, reveal, -50)
      await __pg.until(() => dir() !== '—', 3000)
      const spoke = dir()

      return {
        pass:
          mounted.gap > 0 &&
          mounted.dir === '—' &&
          mounted.badge === null &&
          mounted.anim === 'none' &&
          steps.every((s) => s.endsWith('→—')) &&
          stillSilent === '—' &&
          stillDark === null &&
          inGap < 0 &&
          spoke === 'enter-from-below' &&
          getComputedStyle(reveal).animationName !== 'none',
        detail:
          `at mount ${mounted.gap}px below the edge: "${mounted.dir}" badge=${mounted.badge} ` +
          `animation=${mounted.anim} · outside scrolls ${steps.join(' ')} · ` +
          `${inGap}px inside → "${spoke}" animation=${getComputedStyle(reveal).animationName}`,
      }
    },
  },
  {
    demo: CSS_ONLY,
    name: 'the state attribute drives real computed opacity',
    fn: async () => {
      const file = '04-css-only.vue'
      const scroller = __obs.scroller(file)
      const cards = [...__pg.stage(file).querySelectorAll('.card')]
      const last = cards[cards.length - 1]
      await __pg.sleep(600)

      const firstState = __obs.state(cards[0])
      const firstOpacity = __obs.opacity(cards[0])
      const lastHiddenState = __obs.state(last)
      const lastHiddenOpacity = __obs.opacity(last)

      scroller.scrollTop = scroller.scrollHeight
      await __pg.until(() => __obs.state(last)?.includes('intersect:visible'), 3000)
      await __pg.sleep(500)

      return {
        pass:
          firstState === 'intersect:visible;resize:-;mutate:-' &&
          firstOpacity === 1 &&
          lastHiddenState === 'intersect:hidden;resize:-;mutate:-' &&
          lastHiddenOpacity === 0 &&
          __obs.state(last) === 'intersect:visible;resize:-;mutate:-' &&
          __obs.opacity(last) === 1,
        detail:
          `first="${firstState}" opacity=${firstOpacity} · ` +
          `last before="${lastHiddenState}" opacity=${lastHiddenOpacity} · ` +
          `after="${__obs.state(last)}" opacity=${__obs.opacity(last)}`,
      }
    },
  },
  {
    demo: TICK,
    name: 'a real resize delivers from / to / delta measured off the live box',
    fn: async () => {
      const file = '06-resize-tick.vue'
      const box = __pg.stage(file).querySelector('.box')
      await __pg.sleep(400)
      const firstTickIsNull = __obs.kv(file).includes('from === null: true')

      box.style.width = '320px'
      box.style.height = '160px'
      await __pg.until(() => __obs.kv(file).includes('from === null: false'), 3000)
      await __pg.sleep(300)

      const shown = __pg.txt(box)
      const kv = __obs.kv(file)
      const delta = /delta:\s*(-?\d+) × (-?\d+)/.exec(kv)
      const rect = box.getBoundingClientRect()

      return {
        pass:
          firstTickIsNull &&
          shown === `${Math.round(rect.width)} × ${Math.round(rect.height)}` &&
          Number(delta?.[1]) === 60 &&
          Number(delta?.[2]) === 50,
        detail: `first from===null: ${firstTickIsNull} · reads "${shown}" · measured ${Math.round(rect.width)}×${Math.round(rect.height)} · ${kv}`,
      }
    },
  },
  {
    demo: BRACKETS,
    // The label used to be computed from `width` whatever `axis` said, so a
    // handler logging `e.bracket` and a stylesheet keyed on the same element's
    // attribute could disagree at the same instant. Here they are read back
    // together, against a bracket recomputed from the MEASURED width.
    name: 'the bracket the handler reports is the bracket the stylesheet sees',
    fn: async () => {
      const file = '07-resize-breakpoints.vue'
      const grid = __pg.stage(file).querySelector('.grid')
      const slider = __obs.slider(file, 'width')
      const named = { xs: 0, sm: 320, md: 640, lg: 960 }
      const expected = (w) => (w >= named.lg ? 'lg' : w >= named.md ? 'md' : w >= named.sm ? 'sm' : 'xs')

      const rows = []
      for (const w of [200, 400, 700, 1000]) {
        __pg.set(slider, w)
        await __pg.sleep(500)
        const measured = grid.getBoundingClientRect().width
        rows.push({
          asked: w,
          measured: Math.round(measured),
          reported: /→\s*(\S+)/.exec(__pg.txt(grid.querySelector('span')))?.[1],
          segment: __obs.segment(grid, 'resize'),
          expected: expected(measured),
        })
      }

      const bad = rows.filter((r) => r.reported !== r.expected || r.segment !== r.expected)
      return {
        pass: bad.length === 0 && new Set(rows.map((r) => r.reported)).size >= 3,
        detail: rows
          .map((r) => `${r.measured}px: handler ${r.reported}, css ${r.segment}, expected ${r.expected}`)
          .join(' | '),
      }
    },
  },
  {
    demo: RESIZE_CROSSED,
    // Every event of a multi-bracket jump used to be stamped with the FINAL
    // bracket, so a 180px → 520px drag told the handler the element was
    // already `>=400` at the moment it crossed 240. A consumer swapping
    // layouts per event then mounted the desktop layout twice and never the
    // tablet one. Each crossing here is read back with the label it is
    // supposed to carry: the bracket THAT crossing entered.
    name: 'nothing at mount; a two-bracket jump labels each crossing with the bracket it entered',
    fn: async () => {
      const file = '08-resize-crossed.vue'
      const box = __pg.stage(file).querySelector('.box')
      const width = () => Math.round(box.getBoundingClientRect().width)
      // Newest first, so reverse for the order the handler saw them.
      const crossings = () =>
        [...__obs.log(file).matchAll(/(width|height) crossed (\d+) going (up|down) → (\S+)/g)]
          .map((m) => `${m[1]}:${m[2]}:${m[3]}:${m[4]}`)
          .reverse()

      await __pg.sleep(600)
      const atMount = __obs.log(file)
      const startWidth = width()

      box.style.width = '180px' // 300 → 180: one crossing, downward
      await __pg.sleep(500)
      const afterDown = crossings()
      const downWidth = width()

      box.style.width = '520px' // 180 → 520: 240 and then 400, upward
      await __pg.sleep(500)
      const afterJump = crossings()
      const upWidth = width()

      return {
        pass:
          atMount.startsWith('— resize past a threshold') &&
          startWidth > 240 && startWidth < 400 &&
          downWidth < 240 &&
          upWidth > 400 &&
          afterDown.length === 1 &&
          afterDown[0] === 'width:240:down:<240' &&
          afterJump.length === 3 &&
          // Ascending, and each labelled with where that crossing landed.
          afterJump[1] === 'width:240:up:240-400' &&
          afterJump[2] === 'width:400:up:>=400',
        detail:
          `at mount "${atMount.slice(0, 34)}" @${startWidth}px · ` +
          `→${downWidth}px ${JSON.stringify(afterDown)} · ` +
          `→${upWidth}px ${JSON.stringify(afterJump)}`,
      }
    },
  },
  {
    demo: RESIZE_CROSSED,
    // The two claims the card's own blurb makes, measured: nothing fires while
    // you stay inside a bracket (that is the whole difference from tick mode),
    // and `axis` decides which dimension is compared — a width drag past 240
    // must be silent while the observer is watching height.
    name: 'inside a bracket is silent; axis picks the dimension; both emits one event per axis',
    fn: async () => {
      const file = '08-resize-crossed.vue'
      const box = __pg.stage(file).querySelector('.box')
      const select = __obs.select(file)
      const rect = () => {
        const r = box.getBoundingClientRect()
        return `${Math.round(r.width)}×${Math.round(r.height)}`
      }
      const crossings = () =>
        [...__obs.log(file).matchAll(/(width|height) crossed (\d+) going (up|down) → (\S+)/g)]
          .map((m) => `${m[1]}:${m[2]}:${m[3]}:${m[4]}`)
          .reverse()

      await __pg.sleep(600)
      box.style.width = '360px' // 300 → 360, still inside 240-400
      await __pg.sleep(500)
      const insideBracket = { log: __obs.log(file), at: rect() }

      // Watching HEIGHT now: a width drag straight through 240 is not ours.
      __pg.set(select, 'height')
      await __pg.sleep(350)
      box.style.width = '180px'
      await __pg.sleep(500)
      const widthWhileHeight = { log: __obs.log(file), at: rect() }

      box.style.height = '300px' // 200 → 300 crosses 240 upward
      await __pg.sleep(500)
      const heightMoved = { crossings: crossings(), at: rect() }

      // Both axes, one diagonal change, opposite directions.
      __pg.button(file, 'Clear log').click()
      __pg.set(select, 'both')
      await __pg.sleep(350)
      box.style.width = '300px' // 180 → 300: up through 240
      box.style.height = '180px' // 300 → 180: down through 240
      await __pg.sleep(600)
      const diagonal = { crossings: crossings(), at: rect() }

      return {
        pass:
          insideBracket.log.startsWith('— resize past a threshold') &&
          widthWhileHeight.log.startsWith('— resize past a threshold') &&
          heightMoved.crossings.length === 1 &&
          heightMoved.crossings[0] === 'height:240:up:240-400' &&
          diagonal.crossings.length === 2 &&
          diagonal.crossings[0] === 'width:240:up:240-400' &&
          diagonal.crossings[1] === 'height:240:down:<240',
        detail:
          `inside the bracket @${insideBracket.at}: "${insideBracket.log.slice(0, 30)}" · ` +
          `width past 240 while axis=height @${widthWhileHeight.at}: "${widthWhileHeight.log.slice(0, 30)}" · ` +
          `height moved @${heightMoved.at}: ${JSON.stringify(heightMoved.crossings)} · ` +
          `axis=both diagonal @${diagonal.at}: ${JSON.stringify(diagonal.crossings)}`,
      }
    },
  },
  {
    demo: ORIENT,
    // Before the fix an orientation-mode consumer got NOTHING until the user
    // dragged the box: the first measurable orientation was swallowed as "the
    // baseline". The card showed '—' with no `data-orientation` at first paint,
    // and the demo's own `e.from ?? '(initial)'` branch was unreachable.
    name: 'the first measurable orientation arrives at first paint, with from: null',
    fn: async () => {
      const file = '09-resize-orientation.vue'
      const box = __pg.stage(file).querySelector('.box')
      await __pg.sleep(600)
      const initialLabel = __pg.txt(box)
      const initialAttr = box.getAttribute('data-orientation')
      const initialLog = __obs.log(file)

      box.style.width = '160px'
      box.style.height = '300px'
      await __pg.until(() => __pg.txt(box) === 'portrait', 3000)
      await __pg.sleep(300)
      const afterDrag = __obs.log(file)

      return {
        pass:
          initialLabel === 'landscape' &&
          initialAttr === 'landscape' &&
          /^\(initial\) → landscape/.test(initialLog) &&
          /^landscape → portrait/.test(afterDrag),
        detail: `at paint: label="${initialLabel}" attr="${initialAttr}" log="${initialLog}" · after: "${afterDrag.slice(0, 60)}"`,
      }
    },
  },
  {
    demo: ORIENT,
    // A `display: none` box reports 0x0. That is not square, it is unmeasured
    // — reporting `square` made every hide/show emit a phantom flip and paint
    // the square branch of the stylesheet on the way through.
    name: 'hiding the box emits no phantom square flip',
    fn: async () => {
      const file = '09-resize-orientation.vue'
      const box = __pg.stage(file).querySelector('.box')
      await __pg.sleep(600)
      const before = __obs.log(file)

      box.style.display = 'none'
      await __pg.sleep(600)
      const whileHidden = __obs.log(file)
      const attrWhileHidden = box.getAttribute('data-orientation')
      box.style.display = ''
      await __pg.sleep(600)
      const after = __obs.log(file)

      return {
        pass:
          whileHidden === before &&
          after === before &&
          attrWhileHidden === 'landscape' &&
          !after.includes('square'),
        detail: `before="${before}" · hidden: attr=${attrWhileHidden} log="${whileHidden}" · restored log="${after}"`,
      }
    },
  },
  {
    demo: BOXES,
    // The proof that `box` decides WHEN a callback fires, not just what it
    // reports. With `box-sizing: content-box` and a fixed width, changing the
    // padding moves the border box and leaves the content box exactly where it
    // was. `observe(el)` with no init always watched the content box, so
    // `box: 'border'` could not see this at all.
    name: 'a padding-only change reaches box:"border" and is invisible to box:"content"',
    fn: async () => {
      const file = '10-resize-box-debounce.vue'
      const stage = __pg.stage(file)
      const padded = stage.querySelector('.padded')
      const select = __obs.select(file)
      const ticks = () => Number(/ticks on the top box:\s*(\d+)/.exec(__obs.kv(file))?.[1] ?? -1)
      const reading = () => /:\s*(\d+) × (\d+)/.exec(__pg.txt(padded))?.slice(1).map(Number)

      // A fixed CONTENT box, so padding moves only the border box.
      padded.style.boxSizing = 'content-box'
      padded.style.width = '240px'
      padded.style.height = '80px'
      __pg.set(select, 'border')
      await __pg.sleep(700)
      const borderBase = { ticks: ticks(), size: reading() }

      padded.style.padding = '30px'
      await __pg.sleep(700)
      const borderAfter = { ticks: ticks(), size: reading() }

      __pg.set(select, 'content')
      await __pg.sleep(700)
      const contentBase = { ticks: ticks(), size: reading() }

      padded.style.padding = '12px'
      await __pg.sleep(700)
      const contentAfter = { ticks: ticks(), size: reading() }

      return {
        pass:
          // border-box: 240 content + 2×30 padding + 2×4 border = 308
          borderAfter.ticks === borderBase.ticks + 1 &&
          borderBase.size[0] === 272 && // 240 content + 2×12 padding + 2×4 border
          borderAfter.size[0] === 308 &&
          // content-box: unchanged at 240 either side of the padding change
          contentBase.size[0] === 240 &&
          contentAfter.ticks === contentBase.ticks &&
          contentAfter.size[0] === 240,
        detail:
          `border: ${borderBase.ticks} ticks @${borderBase.size} → ${borderAfter.ticks} ticks @${borderAfter.size} · ` +
          `content: ${contentBase.ticks} ticks @${contentBase.size} → ${contentAfter.ticks} ticks @${contentAfter.size}`,
      }
    },
  },
  {
    demo: BOXES,
    name: 'debounce coalesces a continuous drag into one trailing call',
    fn: async () => {
      const file = '10-resize-box-debounce.vue'
      const debounced = __pg.stage(file).querySelectorAll('.padded')[1]
      const calls = () =>
        Number(/debounced handler calls on the bottom box:\s*(\d+)/.exec(__obs.kv(file))?.[1] ?? -1)
      await __pg.sleep(700)
      const start = calls()

      for (let i = 0; i < 24; i++) {
        debounced.style.width = `${240 + i * 8}px`
        await __pg.sleep(25)
      }
      const during = calls()
      await __pg.sleep(800)
      const end = calls()

      return {
        pass: start >= 0 && during === start && end === start + 1,
        detail: `24 resizes over ~600ms: before=${start} during=${during} after the 200ms window=${end}`,
      }
    },
  },
  {
    demo: CHILDREN,
    name: 'match filters real DOM children, and turning it off lets the rest through',
    fn: async () => {
      const file = '12-mutate-children.vue'
      __pg.button(file, 'Add .note').click()
      await __pg.sleep(400)
      const filtered = __obs.log(file)

      __pg.button(file, 'Add .card').click()
      await __pg.sleep(400)
      const withCard = __obs.log(file)

      __pg.set(__pg.label(file, "match: '.card'").querySelector('input'), false)
      await __pg.sleep(250)
      __pg.button(file, 'Add .note').click()
      await __pg.sleep(400)
      const unfiltered = __obs.log(file)

      return {
        pass:
          filtered.startsWith('— add or remove a child') &&
          withCard.startsWith('children:added: card') &&
          unfiltered.startsWith('children:added: note'),
        detail: `note (filtered)="${filtered}" · card="${withCard.slice(0, 40)}" · note (unfiltered)="${unfiltered.slice(0, 40)}"`,
      }
    },
  },
  {
    demo: TEXT,
    // The validator on this card is README recipe 15 verbatim. `to` used to be
    // the changed NODE's content, so the first Enter in a contenteditable —
    // which splits the content into two text nodes — made it start judging one
    // line, and a full box reported "too short".
    name: 'a multi-node contenteditable is validated on the whole text, not the last node',
    fn: async () => {
      const file = '13-mutate-text.vue'
      const editor = __pg.stage(file).querySelector('.editor')
      const chip = __pg.stage(file).querySelector('.pg-chip')

      editor.textContent = 'a long enough first line'
      await __pg.sleep(500)
      const afterLong = __pg.txt(chip)

      // What Enter does to a contenteditable: the content becomes two text
      // nodes. Nothing is validated yet — the text is unchanged in total.
      const second = document.createTextNode('')
      editor.appendChild(second)
      await __pg.sleep(400)

      // Now the user types two characters into the SECOND node only. That is a
      // characterData record whose target holds 'hi' — the whole reason `to`
      // must be the host's text and not the record's node.
      second.data = 'hi'
      await __pg.sleep(500)
      const afterSplit = __pg.txt(chip)
      const log = __obs.log(file)

      return {
        pass:
          afterLong === 'valid' &&
          afterSplit === 'valid' &&
          log.includes('a long enough first linehi') &&
          !log.includes('"hi"'),
        detail: `one node → "${afterLong}"; edit in the second node → "${afterSplit}"; log "${log.slice(0, 110)}"`,
      }
    },
  },
  {
    demo: REMOVED,
    // `removed` is the only mode whose observer is on the PARENT, watching a
    // childList that every sibling shares. Firing on any removal from it would
    // tear down a live chart the first time a neighbouring node blinked, so the
    // noise is driven first and the real removal second.
    name: 'a sibling appearing and leaving is not the host being removed — ripping the host is',
    fn: async () => {
      const file = '14-mutate-removed.vue'
      const host = __pg.stage(file).querySelector('.host')
      const rip = __pg.button(file, 'Rip the node out')
      await __pg.sleep(500)
      const before = { status: __obs.kv(file), attached: document.contains(host), disabled: rip.disabled }

      // Noise on exactly the childList the removal observer watches.
      const decoy = document.createElement('div')
      decoy.className = 'decoy'
      host.parentNode.appendChild(decoy)
      await __pg.sleep(400)
      const afterSiblingAdded = __obs.kv(file)
      decoy.remove()
      await __pg.sleep(400)
      const afterSiblingRemoved = __obs.kv(file)

      rip.click()
      await __pg.until(() => __obs.kv(file).startsWith('removed'), 3000)
      await __pg.sleep(250)
      const after = { status: __obs.kv(file), attached: document.contains(host), disabled: rip.disabled }

      return {
        pass:
          before.status === 'mounted — chart instance alive' &&
          before.attached === true &&
          before.disabled === false &&
          afterSiblingAdded === before.status &&
          afterSiblingRemoved === before.status &&
          after.status === 'removed — tearDownChartInstance() ran' &&
          after.attached === false &&
          after.disabled === true,
        detail:
          `before: "${before.status}" attached=${before.attached} · ` +
          `sibling added → "${afterSiblingAdded}" · sibling removed → "${afterSiblingRemoved}" · ` +
          `after the rip: "${after.status}" attached=${after.attached} button disabled=${after.disabled}`,
      }
    },
  },
  {
    demo: REMOVED,
    // What `container.innerHTML = ''` actually looks like to a MutationObserver:
    // ONE record whose `removedNodes` carries the host somewhere in the middle
    // of its siblings. That is how Bootstrap and jQuery dispose of a subtree, so
    // a scan that only looked at `removedNodes[0]` would leave the chart
    // instance alive for the most common teardown there is.
    //
    // The status paragraph goes with the wipe, so its element is captured
    // first: Vue keeps patching it while it is detached, which is what makes
    // the handler's effect readable at all.
    name: 'the host is found inside a batch removal that takes every sibling with it',
    fn: async () => {
      const file = '14-mutate-removed.vue'
      const stage = __pg.stage(file)
      const host = stage.querySelector('.host')
      const kv = stage.querySelector('.pg-kv')
      await __pg.sleep(500)
      const before = __pg.txt(kv)

      const parent = host.parentNode
      const siblings = parent.childNodes.length
      const position = [...parent.childNodes].indexOf(host)

      parent.replaceChildren() // one record, every child in removedNodes
      const detached = !document.contains(host)
      await __pg.until(() => __pg.txt(kv).startsWith('removed'), 3000)
      await __pg.sleep(250)
      const after = __pg.txt(kv)

      return {
        pass:
          before === 'mounted — chart instance alive' &&
          siblings > 2 &&
          // Not first in the record: the scan has to look past index 0.
          position > 0 &&
          detached === true &&
          after === 'removed — tearDownChartInstance() ran',
        detail:
          `host was child ${position} of ${siblings} · before "${before}" · ` +
          `detached=${detached} · after "${after}"`,
      }
    },
  },
  {
    demo: MULTI,
    // One click mutates an attribute, appends three children and changes the
    // host's text, all inside a single Vue flush. Three children must arrive as
    // ONE `children:added` carrying three nodes — a handler that re-lays out a
    // grid would otherwise do it three times — and each event must describe the
    // host as it is now: the attribute's real old value, and the WHOLE host's
    // text rather than the one node the browser happened to report.
    name: 'one burst is one flush: +3 children in a single event, with the real old class and whole-host text',
    fn: async () => {
      const file = '15-mutate-multi.vue'
      const panel = __pg.stage(file).querySelector('.panel')
      const chips = () => panel.querySelectorAll('.pg-chip').length
      const count = (s, needle) => s.split(needle).length - 1

      await __pg.sleep(500)
      const before = { log: __obs.log(file), chips: chips(), cls: panel.getAttribute('class') }

      __pg.button(file, 'Mutate everything at once').click()
      await __pg.until(() => __obs.log(file) !== before.log, 3000)
      await __pg.sleep(500)

      const log = __obs.log(file)
      const added = /children:added \+(\d+)/.exec(log)?.[1]
      // `to` can be several words if the host's text ever contains spaces, so the
      // entry ends where the next one begins rather than at the first space.
      const text = /text (\S+) → (.+?)(?= children:added| children:removed| attr:class|$)/.exec(log)
      // `attr:class` is pushed first and unshifted first, so it is the oldest
      // line of the flush — the tail of the collapsed log.
      const attr = log.slice(log.indexOf('attr:class ') + 'attr:class '.length).split(' → ')

      return {
        pass:
          before.log.startsWith('— press the button') &&
          before.chips === 1 &&
          chips() === 4 &&
          // One event, three nodes — not three events of one.
          count(log, 'children:added') === 1 &&
          added === '3' &&
          count(log, 'children:removed') === 0 &&
          count(log, 'attr:class') === 1 &&
          attr[0] === before.cls &&
          attr[1] === panel.getAttribute('class') &&
          attr[0] !== attr[1] &&
          // The diff is of the host, and its `to` is what the host now says.
          count(log, 'text ') === 1 &&
          text?.[1] === 'a' &&
          text?.[2] === __pg.txt(panel),
        detail:
          `chips ${before.chips}→${chips()} · class "${before.cls}"→"${panel.getAttribute('class')}" · ` +
          `host text "${__pg.txt(panel)}" · log "${log}"`,
      }
    },
  },
  {
    demo: MULTI,
    // The debounce window, measured from both sides: nothing is reported while
    // it is open even though the DOM has already changed twice, and what comes
    // out is ONE flush describing the window's net effect — six children
    // concatenated across two separate callbacks, and a class that ended the
    // window exactly where it started.
    name: 'a 500ms window holds two bursts back, then reports their net effect once',
    fn: async () => {
      const file = '15-mutate-multi.vue'
      const panel = __pg.stage(file).querySelector('.panel')
      const chips = () => panel.querySelectorAll('.pg-chip').length
      const count = (s, needle) => s.split(needle).length - 1

      __pg.set(__obs.slider(file, 'debounce'), 500)
      await __pg.sleep(400)
      const startCls = panel.getAttribute('class')
      const burst = __pg.button(file, 'Mutate everything at once')

      burst.click()
      await __pg.sleep(120)
      burst.click()
      await __pg.sleep(200) // 200ms into a 500ms window: the DOM has moved, the handler has not
      const during = { log: __obs.log(file), chips: chips(), cls: panel.getAttribute('class') }

      await __pg.sleep(900)
      const log = __obs.log(file)
      const added = /children:added \+(\d+)/.exec(log)?.[1]
      // `to` can be several words if the host's text ever contains spaces, so the
      // entry ends where the next one begins rather than at the first space.
      const text = /text (\S+) → (.+?)(?= children:added| children:removed| attr:class|$)/.exec(log)
      const attr = log.slice(log.indexOf('attr:class ') + 'attr:class '.length).split(' → ')

      return {
        pass:
          during.log.startsWith('— press the button') &&
          during.chips === 7 &&
          // Two bursts, one flush.
          count(log, 'children:added') === 1 &&
          added === '6' &&
          count(log, 'attr:class') === 1 &&
          count(log, 'text ') === 1 &&
          // The window opened on `calm` and closed on `calm`, and the reported
          // `to` is the class the element is actually wearing.
          attr[0] === startCls &&
          attr[1] === panel.getAttribute('class') &&
          attr[1] === startCls &&
          text?.[1] === 'a' &&
          text?.[2] === __pg.txt(panel) &&
          chips() === 7,
        detail:
          `200ms into the window: ${during.chips} chips on screen, class "${during.cls}", log "${during.log.slice(0, 28)}" · ` +
          `after it closed: ${chips()} chips, class "${panel.getAttribute('class')}", log "${log}"`,
      }
    },
  },
  {
    demo: MULTI,
    // The orange outline the card's blurb promises. `mutate:active` is written
    // by the flush and reverted 150ms later, and the only thing that proves the
    // attribute reaches the page is the painted border colour — the stylesheet
    // rule is keyed on `data-observe-state*='mutate:active'`.
    name: 'the flush paints the panel orange and the 150ms cooldown paints it back',
    fn: async () => {
      const file = '15-mutate-multi.vue'
      const panel = __pg.stage(file).querySelector('.panel')
      const border = () => getComputedStyle(panel).borderTopColor

      __pg.set(__obs.slider(file, 'debounce'), 0) // flush on the spot
      await __pg.sleep(400)
      const idleBefore = { seg: __obs.segment(panel, 'mutate'), color: border() }

      __pg.button(file, 'Mutate everything at once').click()
      await __pg.sleep(60) // inside the 150ms cooldown
      const active = { seg: __obs.segment(panel, 'mutate'), color: border() }

      await __pg.sleep(500)
      const cooled = { seg: __obs.segment(panel, 'mutate'), color: border() }

      return {
        pass:
          idleBefore.seg === 'idle' &&
          idleBefore.color === 'rgba(0, 0, 0, 0)' &&
          active.seg === 'active' &&
          active.color === 'rgb(245, 158, 11)' &&
          cooled.seg === 'idle' &&
          cooled.color === 'rgba(0, 0, 0, 0)',
        detail:
          `before: ${idleBefore.seg}/${idleBefore.color} · ` +
          `+60ms: ${active.seg}/${active.color} · +560ms: ${cooled.seg}/${cooled.color}`,
      }
    },
  },
  {
    demo: GATE,
    // "Playground 16's resize ticks counter can only ever read 0": resize
    // observations are delivered BEFORE intersection ones, so the mandatory
    // first RO callback always arrived while the gate still said hidden, and
    // ResizeObserver never re-sends it for a box that has not changed.
    name: 'a gated resize gets a real measurement when the host scrolls back into view',
    fn: async () => {
      const file = '16-gate-on-intersect.vue'
      const scroller = __obs.scroller(file)
      const host = __pg.stage(file).querySelector('.host')
      const counts = () => {
        const t = __pg.txt(host)
        return {
          mutate: Number(/mutate handler calls (\d+)/.exec(t)?.[1] ?? -1),
          resize: Number(/resize ticks (\d+)/.exec(t)?.[1] ?? -1),
          state: __obs.segment(host, 'intersect'),
        }
      }

      // Top of the pane: the host is below the fold. The heartbeat keeps
      // mutating it regardless.
      scroller.scrollTop = 0
      __pg.button(file, 'Reset counters').click()
      await __pg.sleep(1400)
      const hidden = counts()

      await __obs.park(scroller, host, -60)
      await __pg.sleep(1400)
      const visible = counts()

      return {
        pass:
          hidden.state === 'hidden' &&
          hidden.mutate === 0 &&
          hidden.resize === 0 &&
          visible.state === 'visible' &&
          visible.resize >= 1 &&
          visible.mutate >= 1,
        detail:
          `off-screen (${hidden.state}): mutate=${hidden.mutate} resize=${hidden.resize} · ` +
          `back in view (${visible.state}): mutate=${visible.mutate} resize=${visible.resize}`,
      }
    },
  },
  {
    demo: GATE,
    name: 'unchecking gateOnIntersect lets the off-screen host report again',
    fn: async () => {
      const file = '16-gate-on-intersect.vue'
      const scroller = __obs.scroller(file)
      const host = __pg.stage(file).querySelector('.host')
      const mutations = () => Number(/mutate handler calls (\d+)/.exec(__pg.txt(host))?.[1] ?? -1)

      scroller.scrollTop = 0
      __pg.button(file, 'Reset counters').click()
      await __pg.sleep(1200)
      const gated = mutations()

      __pg.set(__pg.label(file, 'gateOnIntersect').querySelector('input'), false)
      await __pg.sleep(1600)
      const ungated = mutations()

      return {
        pass: gated === 0 && ungated >= 1 && __obs.segment(host, 'intersect') === 'hidden',
        detail: `gated=${gated} → ungated=${ungated}, host still ${__obs.segment(host, 'intersect')}`,
      }
    },
  },
  {
    demo: COMBINED,
    name: 'three observers on one element keep three independent segments',
    fn: async () => {
      const file = '17-combined.vue'
      const scroller = __obs.scroller(file)
      const host = __pg.stage(file).querySelector('.host')
      await __pg.sleep(600)

      const seen = []
      const snap = () => (seen.push(__obs.state(host)), seen.at(-1))

      snap()
      __pg.button(file, 'Add child').click()
      await __pg.sleep(60) // inside the 150ms mutate:active cooldown
      const active = snap()
      await __pg.sleep(400)
      const cooled = snap()

      host.style.width = '400px'
      await __pg.sleep(400)
      const md = snap()
      host.style.width = '600px'
      await __pg.sleep(400)
      const lg = snap()

      scroller.scrollTop = scroller.scrollHeight // host scrolls off the top
      await __pg.sleep(600)
      const gone = snap()

      const grammar = /^intersect:(visible|hidden|-);resize:[^;]+;mutate:(active|idle|-)$/
      return {
        pass:
          seen.every((s) => grammar.test(s ?? '')) &&
          active.includes('mutate:active') &&
          cooled.includes('mutate:idle') &&
          md.includes('resize:md') &&
          lg.includes('resize:lg') &&
          // The resize segment survives the intersect flip untouched.
          gone === 'intersect:hidden;resize:lg;mutate:idle',
        detail: seen.join(' → '),
      }
    },
  },
]

const NATIVE_CHECKS = [
  {
    demo: BOXES,
    // The read side of `box` is checkable from the page; the CALL is not,
    // because the directive makes it during mount. This installs a recorder on
    // `ResizeObserver.prototype.observe` before the document runs, so what the
    // real API receives is read back rather than inferred — including that
    // Chrome accepts `device-pixel-content-box` rather than throwing.
    //
    // What is NOT proven here: that a devicePixelRatio change on its own
    // delivers a callback. `Emulation.setDeviceMetricsOverride` moves
    // `devicePixelRatio` but does not re-raster in headless, and a bare
    // ResizeObserver on `device-pixel-content-box` stays just as silent, so the
    // harness cannot tell a working implementation from a broken one. Ticket
    // OBS-2.
    name: 'the real ResizeObserver.observe() receives the configured box, device-pixel included',
    async run({ page, cdp, sessionId }) {
      const file = '10-resize-box-debounce.vue'
      const recorder = `
        (() => {
          window.__roCalls = []
          const original = ResizeObserver.prototype.observe
          ResizeObserver.prototype.observe = function (target, options) {
            let threw = null
            try { return original.call(this, target, options) }
            catch (err) { threw = String(err); throw err }
            finally {
              window.__roCalls.push({
                box: options && options.box ? options.box : null,
                cls: target.className || null,
                threw,
              })
            }
          }
        })()`
      const { identifier } = await cdp.send(
        'Page.addScriptToEvaluateOnNewDocument',
        { source: recorder },
        sessionId,
      )
      try {
        // The recorder only exists for documents loaded after it is installed.
        await page.navigate(`http://localhost:${process.env.PORT ?? 5212}/?roprobe=1#v-observe`)
        await sleep(2600)
        await page.evaluate(`
          window.__pgSel = document.querySelector('section[id="demo-${file}"] .demo__stage select')
          'ok'`)

        const atMount = await page.evaluate(`window.__roCalls.filter((c) => c.box).map((c) => c.box)`)

        const pick = async (value) => {
          await page.evaluate(`(() => {
            const el = window.__pgSel
            el.value = ${JSON.stringify(value)}
            el.dispatchEvent(new Event('change', { bubbles: true }))
            window.__roMark = window.__roCalls.length
            return 'set'
          })()`)
          await sleep(700)
          return page.evaluate(`window.__roCalls.slice(window.__roMark).map((c) => c.box)`)
        }
        // The mark is taken before the event, so the swap's own observe() is
        // what comes back.
        await page.evaluate(`window.__roMark = window.__roCalls.length; 'ok'`)
        const toContent = await pick('content')
        const toDevicePixel = await pick('device-pixel')
        const reading = await page.evaluate(
          `document.querySelector('section[id="demo-${file}"] .demo__stage .padded').textContent.trim()`,
        )

        return {
          pass:
            atMount.length >= 2 &&
            atMount.every((b) => b === 'border-box') &&
            toContent.includes('content-box') &&
            toDevicePixel.includes('device-pixel-content-box') &&
            /^device-pixel: \d+ × \d+$/.test(reading),
          detail:
            `at mount: ${JSON.stringify(atMount)} · → content: ${JSON.stringify(toContent)} · ` +
            `→ device-pixel: ${JSON.stringify(toDevicePixel)} · card reads "${reading}"`,
        }
      } finally {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }, sessionId)
      }
    },
  },
  {
    demo: ATTR,
    // LAST ON PURPOSE. `mutate: { on: 'attr:*' }` used to observe the
    // directive's own `data-observe-state` write and re-enter forever: a
    // microtask loop with no stack and no error, i.e. a frozen tab. A frozen
    // renderer never answers CDP and `cdp.mjs` has no send timeout (PG-21), so
    // this check races its own reads and reports the timeout as the failure it
    // is rather than hanging the command.
    name: "'attr:*' does not turn the directive's own state attribute into a feedback loop",
    async run({ page }) {
      const file = '11-mutate-attr.vue'
      const dead = Symbol('timeout')
      const race = async (expr, ms = 8000) => {
        const out = await Promise.race([page.evaluate(expr), sleep(ms).then(() => dead)])
        if (out === dead) {
          throw new Error('the page stopped answering — a frozen renderer is the symptom of the loop')
        }
        return out
      }

      await race(`__pg.set(__obs.select('${file}'), 'attr:*'); 'set'`)
      await sleep(400)
      await race(`__pg.button('${file}', 'toggle class').click(); 'clicked'`)
      await sleep(2500)

      let log
      let heartbeat
      let stateAttr
      try {
        log = await race(`__obs.log('${file}')`)
        stateAttr = await race(`__obs.state(__pg.stage('${file}').querySelector('.target'))`)
        // A page that still runs timers has not starved its microtask queue.
        heartbeat = await race(`new Promise((r) => setTimeout(() => r(performance.now()), 250))`, 6000)
      } catch (err) {
        return { pass: false, detail: err.message }
      }

      const reported = [...log.matchAll(/attr:([\w-]+)/g)].map((m) => m[1])
      return {
        pass:
          heartbeat > 0 &&
          reported.includes('class') &&
          !reported.includes('data-observe-state') &&
          // Two attributes change per toggle (class and the bound style), and
          // the loop would produce an unbounded stream of a third.
          reported.length <= 4 &&
          stateAttr === 'intersect:-;resize:-;mutate:idle',
        detail:
          `page still answering (t=${Math.round(heartbeat)}) · reported ${JSON.stringify(reported)} · ` +
          `host attribute settled at "${stateAttr}"`,
      }
    },
  },
]

export default {
  library: 'v-observe',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
