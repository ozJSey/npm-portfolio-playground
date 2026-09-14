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
const CSS_ONLY = '04-css-only.vue'
const TICK = '06-resize-tick.vue'
const BRACKETS = '07-resize-breakpoints.vue'
const ORIENT = '09-resize-orientation.vue'
const BOXES = '10-resize-box-debounce.vue'
const ATTR = '11-mutate-attr.vue'
const CHILDREN = '12-mutate-children.vue'
const TEXT = '13-mutate-text.vue'
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
