/**
 * Interaction checks for the `v-teleport-to` tab.
 *
 * This library's whole job is a decision taken from a measurement, and jsdom
 * has no layout — so its unit suite can only drive a stub of the very thing
 * that was wrong. Three P0 tickets (TT-17, TT-18, TT-19) were all the same
 * defect, all invisible to 806 green tests, and all trivially visible in a
 * browser: the fit test was handed the host's CURRENT BOX when the question it
 * was asking was about the host's CONTENT.
 *
 *   TT-17  the box was ABSENT     — `display: none`, from a `v-show` written
 *                                   after the directive (the README's order)
 *   TT-18  the box was COLLAPSED  — `max-height: 0` in the consumer's closed
 *                                   state, or a flow width that re-wraps
 *   TT-19  the box was OUR CLAMP  — so the content's real size never entered
 *                                   the decision at all
 *
 * Every check here therefore ends at something a user could see: which side
 * the popover went to, and how many of its words are painted inside its own
 * content box. "The attribute changed" is not evidence for this family — the
 * tooltip bug shipped with `fit: 'fits'`, no `data-teleport-collapsed`, and
 * thirteen of thirty-six words on screen.
 *
 * Every check is negative-controlled: the same card, the same geometry, a
 * shorter host, and the opposite verdict. Without that, "it flipped" only
 * proves the library flips.
 */

const PRELUDE = `
window.__tt = {
  /** The demo's own host, by class, inside one card. */
  host(file, cls) {
    const h = __pg.stage(file).querySelector(cls)
    if (!h) throw new Error('no ' + cls + ' on ' + file)
    return h
  },
  /** The card's reference button. */
  trigger(file, cls) {
    const t = __pg.stage(file).querySelector(cls || '.pg-btn--primary')
    if (!t) throw new Error('no reference button on ' + file)
    return t
  },
  /** Everything the tickets ask to be read back off a host. */
  read(h) {
    return {
      fit: h.dataset.teleportFit || null,
      placement: h.dataset.teleportPlacement || null,
      state: h.dataset.teleportState || null,
      truncated: h.dataset.teleportTruncated !== undefined,
      collapsed: h.dataset.teleportCollapsed !== undefined,
      maxHeight: getComputedStyle(h).maxHeight,
      rect: Math.round(h.getBoundingClientRect().height * 100) / 100,
    }
  },
  /** Compact verdict string, for logging a whole sweep on one line. */
  verdict(h) {
    const r = this.read(h)
    return r.placement + '/' + r.fit + '/' + r.maxHeight + (r.truncated ? '/cut' : '')
  },
  /**
   * How many words are painted INSIDE the host's content box. Range rects,
   * because the bug this exists to catch left every attribute reading healthy.
   */
  words(h) {
    const cs = getComputedStyle(h)
    // \`overflow: hidden\` clips at the PADDING box, so that edge is the line
    // between "on screen" and "cut". Derived from the rect rather than from
    // \`clientHeight\`, which is an integer and rounds the boundary away from
    // where the browser actually painted it.
    const limit = h.getBoundingClientRect().bottom - parseFloat(cs.borderBottomWidth) + 1
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT)
    let total = 0, visible = 0, over = 0, node
    while ((node = walker.nextNode())) {
      const re = /\\S+/g
      let m
      while ((m = re.exec(node.nodeValue))) {
        const range = document.createRange()
        range.setStart(node, m.index)
        range.setEnd(node, m.index + m[0].length)
        const rects = [...range.getClientRects()]
        if (!rects.length) continue
        total++
        const bottom = Math.max(...rects.map((r) => r.bottom))
        if (bottom <= limit) visible++
        else over = Math.max(over, bottom - limit)
      }
    }
    return { total, visible, over: Math.round(over * 100) / 100, limit: Math.round(limit * 100) / 100 }
  },
  /**
   * Scroll the page so an element's top edge sits \`top\` px below the viewport
   * top, then let the RAF-batched recalc settle. Returns where it landed, so a
   * check asserts the geometry it thinks it set up.
   */
  async park(el, top) {
    window.scrollBy(0, Math.round(el.getBoundingClientRect().top - top))
    await __pg.sleep(400)
    return Math.round(el.getBoundingClientRect().top)
  },
  slider(file, needle) {
    const l = __pg.label(file, needle)
    if (!l) throw new Error('no slider labelled ' + needle + ' on ' + file)
    return l.querySelector('input[type=range]')
  },
  select(file, needle) {
    const l = __pg.label(file, needle)
    if (!l) throw new Error('no select labelled ' + needle + ' on ' + file)
    return l.querySelector('select')
  },
}
'ready'
`

const TIP = '13-content-measurement.vue'
const ORDER = '14-vshow-order.vue'
const FLIP = '02-placement-flip.vue'

const CHECKS = [
  {
    demo: TIP,
    // TT-18, the owner's report, end to end. A closed state that collapses the
    // box, an explicit `placement: 'top'`, and wrapping text taller than the
    // room above. The host was measured mid-collapse at 18px of padding, so
    // the cramped side "fitted" and the user read a third of the sentence.
    // The negative control is the same card, the same geometry, three words.
    name: 'a tooltip animating out of a collapsed closed state flips, and shows every word',
    fn: async () => {
      const file = '13-content-measurement.vue'
      const tip = __tt.host(file, '.tip')
      const trigger = __tt.trigger(file)

      __pg.set(__tt.select(file, 'placement'), 'top')
      __pg.set(__tt.select(file, 'closed state'), 'collapse')
      await __pg.sleep(200)

      // 60px above the reference — less than the tooltip needs, far more than
      // the 18px of padding a collapsed box reports.
      const parked = await __tt.park(trigger, 60)

      const short = __tt.slider(file, 'content')
      __pg.set(short, 3)
      await __pg.sleep(500)
      const controlVerdict = __tt.verdict(tip)
      const controlWords = __tt.words(tip)

      __pg.set(short, 36)
      await __pg.sleep(500)

      // Three consecutive open/close cycles, not one: the defect was permanent
      // per host, so a single open cannot tell a fixed measurement from a lucky
      // first tick. Each open must show the whole sentence.
      const openBox = __pg.stage(file).querySelector('input[type=checkbox]')
      const opens = []
      for (let i = 0; i < 3; i++) {
        __pg.set(openBox, false)
        await __pg.sleep(300)
        __pg.set(openBox, true)
        await __pg.sleep(450)
        const r = __tt.read(tip)
        const w = __tt.words(tip)
        opens.push({ v: __tt.verdict(tip), shown: w.visible + '/' + w.total, ok:
          r.placement === 'bottom' && r.fit === 'flipped' && r.truncated === false &&
          w.total >= 30 && w.visible === w.total })
      }
      const long = __tt.read(tip)
      const longWords = __tt.words(tip)
      const room = Math.round(trigger.getBoundingClientRect().top)

      return {
        pass:
          parked > 40 && parked < 90 &&
          // Control: a short tooltip belongs on the side that was asked for.
          controlVerdict.startsWith('top/fits') &&
          controlWords.visible === controlWords.total &&
          // The regression: the long one must move, and must not be cut — on
          // every open, not just the first.
          opens.every((o) => o.ok) &&
          long.placement === 'bottom' &&
          long.fit === 'flipped' &&
          long.truncated === false &&
          longWords.total >= 30 &&
          longWords.visible === longWords.total,
        detail:
          `parked ${parked}px from the top, ${room}px above the reference · ` +
          `3 words → ${controlVerdict} (${controlWords.visible}/${controlWords.total} shown) · ` +
          `36 words × 3 opens → ${opens.map((o) => o.v + ' ' + o.shown).join(' | ')} ` +
          `(worst word ${longWords.over}px past the ${longWords.limit} clip line, ` +
          `host rect ${long.rect}, scroll ${tip.scrollHeight}/${tip.clientHeight})`,
      }
    },
  },
  {
    demo: TIP,
    // The axis card 02 could not express. Nothing about the page moves — only
    // the tooltip's own height — and the placement still changes. A fit test
    // reading anything other than the content cannot produce this.
    name: 'content height alone moves the popover, with the geometry pinned',
    fn: async () => {
      const file = '13-content-measurement.vue'
      const tip = __tt.host(file, '.tip')
      const trigger = __tt.trigger(file)
      __pg.set(__tt.select(file, 'placement'), 'top')
      await __pg.sleep(200)
      await __tt.park(trigger, 120)

      const before = trigger.getBoundingClientRect().top
      const slider = __tt.slider(file, 'content')
      const seen = []
      for (const n of [3, 8, 16, 28, 40]) {
        __pg.set(slider, n)
        await __pg.sleep(400)
        const r = __tt.read(tip)
        seen.push(`${n}w:${r.placement}`)
      }
      const after = trigger.getBoundingClientRect().top
      const sides = seen.map((s) => s.split(':')[1])

      return {
        pass:
          Math.abs(after - before) < 2 &&
          sides[0] === 'top' &&
          sides[sides.length - 1] === 'bottom' &&
          // Monotone: it moves once and stays moved. A verdict that oscillates
          // with content length is the livelock in slow motion.
          sides.filter((s, i) => i > 0 && s !== sides[i - 1]).length === 1,
        detail: `reference at ${Math.round(before)}px → ${Math.round(after)}px · ${seen.join(' ')}`,
      }
    },
  },
  {
    demo: TIP,
    // The signal that did not exist while the bug was open. `fit` cannot carry
    // this: a host clamped by `maxHeight` fits on both sides and is cut on
    // both, so the fit verdict is *correct* and useless. Control at 3 words.
    name: 'content past maxHeight raises data-teleport-truncated while fit stays "fits"',
    fn: async () => {
      const file = '13-content-measurement.vue'
      const tip = __tt.host(file, '.tip')
      const trigger = __tt.trigger(file)
      __pg.set(__tt.select(file, 'placement'), 'bottom')
      __pg.set(__tt.select(file, 'closed state'), 'opacity')
      await __pg.sleep(200)
      await __tt.park(trigger, 120)

      const slider = __tt.slider(file, 'content')
      __pg.set(slider, 3)
      await __pg.sleep(400)
      const control = __tt.read(tip)
      // The CHIP, not the word — the card's own prose names the attribute, so a
      // text search would read true whatever the host is doing.
      const chip = () => !!__pg.stage(file).querySelector('.pg-chip.is-cut')
      const controlChip = chip()

      __pg.set(slider, 90)
      await __pg.sleep(500)
      const cut = __tt.read(tip)
      const cutChip = chip()
      const words = __tt.words(tip)

      return {
        pass:
          control.truncated === false && controlChip === false && control.fit === 'fits' &&
          cut.truncated === true && cutChip === true && cut.fit === 'fits' &&
          cut.maxHeight === '240px' &&
          // And it really is cut — the flag is not decorative.
          words.visible < words.total,
        detail:
          `3 words → ${control.fit}, truncated=${control.truncated} · ` +
          `90 words → ${cut.fit}, truncated=${cut.truncated}, maxHeight ${cut.maxHeight}, ` +
          `${words.visible}/${words.total} words shown`,
      }
    },
  },
  {
    demo: TIP,
    // TT-18 asked for this one by name: with a `max-height` transition the
    // host's rect is a function of the clamp this library just wrote, so
    // re-measuring per frame converges — but it can converge by flipping the
    // tooltip mid-animation, which is a visible lurch nobody asked for. The
    // measurement is taken with the transition disabled, so the side is
    // decided once and the animation just plays.
    name: 'the placement does not change during the open animation, frame by frame',
    fn: async () => {
      const file = '13-content-measurement.vue'
      const tip = __tt.host(file, '.tip')
      const trigger = __tt.trigger(file)
      __pg.set(__tt.select(file, 'placement'), 'top')
      __pg.set(__tt.select(file, 'closed state'), 'collapse')
      __pg.set(__tt.slider(file, 'content'), 36)
      await __pg.sleep(300)
      await __tt.park(trigger, 60)

      const openBox = __pg.stage(file).querySelector('input[type=checkbox]')
      __pg.set(openBox, false)
      await __pg.sleep(350)
      __pg.set(openBox, true)

      // Every frame of the 180ms transition, forcing a recalc on each one —
      // the worst case, not the quiet one.
      const seen = []
      const end = performance.now() + 400
      while (performance.now() < end) {
        window.dispatchEvent(new Event('resize'))
        await new Promise((r) => requestAnimationFrame(r))
        const p = tip.dataset.teleportPlacement
        if (p) seen.push(p)
      }
      const changes = seen.filter((p, i) => i > 0 && p !== seen[i - 1]).length

      return {
        pass: seen.length > 8 && changes === 0 && seen[0] === 'bottom',
        detail: `${seen.length} frames, ${changes} placement change(s), settled on ${seen[seen.length - 1]}`,
      }
    },
  },
  {
    demo: ORDER,
    // TT-17. The two hosts differ in one thing only: which directive Vue runs
    // first. The left one is the ordering the README teaches, and it used to
    // report `unmeasured` forever and keep the cramped side.
    name: 'v-show written after the directive reaches the same verdict as v-show written first',
    fn: async () => {
      const file = '14-vshow-order.vue'
      const stage = __pg.stage(file)
      const open = stage.querySelector('input[type=checkbox]')

      const verdicts = []
      for (let i = 0; i < 3; i++) {
        __pg.set(open, true)
        await __pg.sleep(450)
        const [a, b] = [...stage.querySelectorAll('.menu')]
        verdicts.push([__tt.verdict(a), __tt.verdict(b)])
        __pg.set(open, false)
        await __pg.sleep(350)
      }

      const agree = verdicts.every(([a, b]) => a === b)
      const flipped = verdicts.every(([a]) => a.startsWith('bottom/flipped/240px'))
      // Three opens, not one: the defect was permanent per host, so a single
      // open cannot tell a fixed measurement from a lucky first tick.
      const stable = verdicts.every(([a]) => a === verdicts[0][0])

      return {
        pass: agree && flipped && stable,
        detail: verdicts.map(([a, b], i) => `open ${i + 1}: ${a} | ${b}`).join(' · '),
      }
    },
  },
  {
    demo: FLIP,
    // Card 02's new axis, checked where the card's own numbers are exact: the
    // boundary is a fixed-size box, so the room does not depend on the page
    // scroll. Content alone must be able to reach `neither`.
    name: 'card 02: the content slider alone walks the fit ladder from fits to neither',
    fn: async () => {
      const file = '02-placement-flip.vue'
      const pop = __tt.host(file, '.popover')
      // 70% down the box: ~228px above, ~98px below. The short popover fits
      // above and not below, so `flip` has somewhere to go; the tall one fits
      // on neither. Only the content moves between the two readings.
      __pg.set(__tt.slider(file, 'reference height in the box'), 70)
      await __pg.sleep(400)

      const rows = __tt.slider(file, 'popover content')
      __pg.set(rows, 0)
      await __pg.sleep(400)
      const start = __tt.read(pop)

      __pg.set(rows, 10)
      await __pg.sleep(500)
      const end = __tt.read(pop)

      return {
        pass:
          start.fit === 'flipped' && start.placement === 'top' &&
          end.fit === 'neither' &&
          // Both readings are on the same side, so the room is the same and
          // the ONLY thing that moved the verdict is the popover's own height.
          end.placement === 'top',
        detail:
          `+0 rows → ${start.placement}/${start.fit}/${start.maxHeight} · ` +
          `+10 rows → ${end.placement}/${end.fit}/${end.maxHeight}`,
      }
    },
  },
  {
    demo: FLIP,
    // The livelock control, measured rather than assumed. Card 02's popover
    // carries an arrow pinned to whichever edge faces the reference — the
    // decoration that made `scrollHeight` report a different height on each
    // side, so the two sides took turns forever. Sixty forced recalcs at the
    // knife edge: the placement must settle and stay settled.
    name: 'an arrow-bearing popover does not take turns between the two sides',
    fn: async () => {
      const file = '02-placement-flip.vue'
      const pop = __tt.host(file, '.popover')
      __pg.set(__tt.slider(file, 'popover content'), 2)
      await __pg.sleep(400)

      const seen = []
      // Sweep the reference through the middle of the box, where the two sides
      // are within a few px of each other and of the popover's own height.
      const slider = __tt.slider(file, 'reference height in the box')
      for (let i = 0; i < 60; i++) {
        __pg.set(slider, 44 + (i % 6))
        window.dispatchEvent(new Event('resize'))
        await new Promise((r) => requestAnimationFrame(r))
        seen.push(pop.dataset.teleportPlacement)
      }
      // Park it and let it settle; the last twenty reads at one slider value
      // must be identical.
      __pg.set(slider, 46)
      await __pg.sleep(400)
      const settled = []
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new Event('resize'))
        await new Promise((r) => requestAnimationFrame(r))
        settled.push(pop.dataset.teleportPlacement)
      }

      return {
        pass: new Set(settled).size === 1 && settled[0] !== undefined,
        detail:
          `sweep: ${new Set(seen).size} distinct side(s) across 60 recalcs · ` +
          `settled: ${new Set(settled).size} distinct across 20 (${settled[0]})`,
      }
    },
  },
]

export default {
  library: 'v-teleport-to',
  prelude: PRELUDE,
  checks: CHECKS,
}
