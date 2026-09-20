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
  /**
   * Card 11 renders its host through a Teleport to body, so it is NOT inside
   * the card's stage and __pg.stage() cannot reach it. The class name is
   * load-bearing for exactly this reason (see the card's unscoped style block)
   * and it is unique across the tab.
   */
  teleported() {
    const h = document.querySelector('.composable-pop')
    if (!h) throw new Error('no .composable-pop in the document')
    return h
  },
  /** The text of a card's chips, joined — the card's own readout. */
  chips(file) {
    return [...__pg.stage(file).querySelectorAll('.pg-chip')].map((c) => __pg.txt(c)).join(' | ')
  },
  /**
   * How many of an element's direct children are painted fully inside its own
   * content box. words() answers this for text; a menu's rows are elements,
   * and a row half past the clip line is the user-visible face of the P0.
   */
  rows(h) {
    const cs = getComputedStyle(h)
    const limit = h.getBoundingClientRect().bottom - parseFloat(cs.borderBottomWidth) + 1
    const kids = [...h.children]
    return {
      total: kids.length,
      visible: kids.filter((k) => k.getBoundingClientRect().bottom <= limit).length,
    }
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
  /** A checkbox inside the demo's own labelled control. */
  toggle(file, needle) {
    const l = __pg.label(file, needle)
    if (!l) throw new Error('no checkbox labelled ' + needle + ' on ' + file)
    const b = l.querySelector('input[type=checkbox]')
    if (!b) throw new Error('the label ' + needle + ' on ' + file + ' has no checkbox')
    return b
  },
  /**
   * An element's box rounded to 1/100px, with the centres a cross-axis
   * assertion needs. Every geometry check below reports in these units: the
   * library writes full-precision px strings, so a correct answer lands inside
   * a tenth of a pixel and the misses this file exists to catch are tens of
   * pixels wide (127px of arrow, 438px of absolute origin).
   */
  box(el) {
    const r = el.getBoundingClientRect()
    const n = (v) => Math.round(v * 100) / 100
    return {
      top: n(r.top),
      left: n(r.left),
      right: n(r.right),
      bottom: n(r.bottom),
      width: n(r.width),
      height: n(r.height),
      cx: n((r.left + r.right) / 2),
      cy: n((r.top + r.bottom) / 2),
    }
  },
  /**
   * The uniform scale a CSS transform is painting at — 1 when there is none.
   * \`data-teleport-state\` is only worth anything if the consumer's transition
   * actually runs off it, so the state checks read the painted scale rather
   * than the attribute that is supposed to cause it.
   */
  scale(el) {
    const t = getComputedStyle(el).transform
    const m = t && t.match(/matrix\\(([^)]+)\\)/)
    return m ? Math.round(parseFloat(m[1].split(',')[0]) * 1000) / 1000 : 1
  },
  /** One of a card's chips by index — the card's own rendered readout. */
  chipAt(file, i) {
    return __pg.txt(__pg.stage(file).querySelectorAll('.pg-chip')[i])
  },
  /** The non-blank lines of a card's \`<pre class="pg-log">\`, newest first. */
  logLines(file) {
    const pre = __pg.stage(file).querySelector('.pg-log')
    if (!pre) throw new Error('no .pg-log on ' + file)
    return (pre.textContent || '').split('\\n').map((l) => l.trim()).filter(Boolean)
  },
}
'ready'
`

const TIP = '13-content-measurement.vue'
const ORDER = '14-vshow-order.vue'
const FLIP = '02-placement-flip.vue'
const COMPOSABLE = '11-composable.vue'
const OVERFLOW = '05-overflow.vue'
const VIRTUAL = '09-virtual-reference.vue'
const ABSOLUTE = '12-strategy-absolute.vue'
const BASIC = '01-basic-dropdown.vue'
const SIZING = '03-sizing.vue'
const BOUNDARY = '04-boundary-scroll.vue'
const ARROW = '06-arrow.vue'
const CROSS = '07-cross-axis-offsets.vue'
const AUTO = '08-auto-update.vue'
const EVENTS = '10-events-state.vue'

const CHECKS = [
  {
    demo: COMPOSABLE,
    // TT-22 finding 1, face one — the P0, and the reason this card was
    // reshaped. `enabled: open` and a `v-if` on the popover's rows flip in ONE
    // reactive tick, so a recalculation that runs before Vue patches the rows
    // in measures an empty box. The old card could not express this at all: its
    // content was always rendered.
    //
    // Ends at something a user could see — which side it opened on, and how
    // many of its eight rows are painted inside its own box. Every attribute
    // read healthy while three of eight were on screen.
    name: 'card 11: contents mounting in the same tick as `enabled` are measured, not the empty box',
    fn: async () => {
      const file = '11-composable.vue'
      const trigger = __tt.trigger(file)
      const openBox = __pg.stage(file).querySelector('input[type=checkbox]')

      // Park the reference low enough that the 240px of rows cannot fit below
      // it, and high enough that it is comfortably on screen (a reference fully
      // out of view would be hidden by `hideWhenReferenceHidden` instead).
      __pg.set(openBox, false)
      await __pg.sleep(250)
      const parked = await __tt.park(trigger, Math.round(window.innerHeight - 170))
      const below = Math.round(window.innerHeight - trigger.getBoundingClientRect().bottom)
      const above = Math.round(trigger.getBoundingClientRect().top)

      // Three open/close cycles: the defect was permanent per host, so one open
      // cannot tell a fixed measurement from a lucky first tick.
      const opens = []
      for (let i = 0; i < 3; i++) {
        __pg.set(openBox, false)
        await __pg.sleep(300)
        __pg.set(openBox, true)
        await __pg.sleep(500)
        const host = __tt.teleported()
        const hr = host.getBoundingClientRect()
        const tr = trigger.getBoundingClientRect()
        const r = __tt.rows(host)
        opens.push({
          fit: host.dataset.teleportFit,
          shown: `${r.visible}/${r.total}`,
          h: Math.round(hr.height),
          ok:
            host.dataset.teleportFit === 'flipped' &&
            // It really opened upwards, and it is not sitting on its trigger.
            hr.bottom <= tr.top + 1 &&
            r.total === 9 &&
            r.visible === r.total,
        })
      }

      // Control: the same card, the same tick, plenty of room below. If every
      // popover flipped, none of the above would be evidence.
      __pg.set(openBox, false)
      await __pg.sleep(250)
      await __tt.park(trigger, 120)
      __pg.set(openBox, true)
      await __pg.sleep(500)
      const ctlHost = __tt.teleported()
      const ctl = {
        fit: ctlHost.dataset.teleportFit,
        below: ctlHost.getBoundingClientRect().top >= __tt.trigger(file).getBoundingClientRect().bottom - 1,
        rows: __tt.rows(ctlHost),
      }

      return {
        pass:
          below > 60 && below < 220 && above > 300 &&
          opens.every((o) => o.ok) &&
          ctl.fit === 'fits' && ctl.below && ctl.rows.visible === ctl.rows.total,
        detail:
          `parked ${parked}px from the top — ${below}px below, ${above}px above · ` +
          `3 opens → ${opens.map((o) => `${o.fit} ${o.shown} rows ${o.h}px`).join(' | ')} · ` +
          `control (120px from the top) → ${ctl.fit}, opened ${ctl.below ? 'below' : 'ABOVE'}, ` +
          `${ctl.rows.visible}/${ctl.rows.total} rows shown · chips: ${__tt.chips(file)}`,
      }
    },
  },
  {
    demo: COMPOSABLE,
    // TT-22 finding 1, face two. The slider changes NO option — the options
    // getter never reads it — so no dependency of the composable's effect
    // changes. The component merely re-renders and the reference's box moves.
    // The directive tracks this because a re-render IS its `updated` hook.
    name: 'card 11: the popover follows a reference moved by state no option reads',
    fn: async () => {
      const file = '11-composable.vue'
      const trigger = __tt.trigger(file)
      const openBox = __pg.stage(file).querySelector('input[type=checkbox]')
      const push = __tt.slider(file, 'push the reference down')

      __pg.set(push, 0)
      __pg.set(openBox, true)
      await __pg.sleep(400)
      await __tt.park(trigger, 200)
      await __pg.sleep(300)

      const at = () => {
        const h = __tt.teleported().getBoundingClientRect()
        const t = trigger.getBoundingClientRect()
        return { host: Math.round(h.top), ref: Math.round(t.bottom), gap: Math.round(h.top - t.bottom) }
      }
      const before = at()

      __pg.set(push, 240)
      // Two frames plus the RAF batch — no scroll, no resize, no option change.
      await __pg.sleep(600)
      const after = at()

      return {
        pass:
          // The reference really moved…
          after.ref - before.ref > 150 &&
          // …the popover was anchored to it before…
          Math.abs(before.gap) <= 2 &&
          // …and still is.
          Math.abs(after.gap) <= 2,
        detail:
          `reference bottom ${before.ref} → ${after.ref} (moved ${after.ref - before.ref}px) · ` +
          `host top ${before.host} → ${after.host} · ` +
          `gap ${before.gap}px → ${after.gap}px · anchored chip: ${__tt.chips(file)}`,
      }
    },
  },
  {
    demo: COMPOSABLE,
    // The guard on the fix rather than on the defect. `styles` is bound into
    // the template, so a post-render re-measure that always re-assigns it
    // re-renders, which re-measures, forever — Vue bails out with "Maximum
    // recursive updates exceeded" and the card dies. The composable compares
    // before assigning; this drives the card hard enough to prove it.
    name: 'card 11: the post-render re-measure converges instead of feeding itself',
    fn: async () => {
      const file = '11-composable.vue'
      const openBox = __pg.stage(file).querySelector('input[type=checkbox]')
      const push = __tt.slider(file, 'push the reference down')

      const seen = []
      const warn = console.warn
      const error = console.error
      console.warn = (...a) => { seen.push(String(a[0])); warn.apply(console, a) }
      console.error = (...a) => { seen.push(String(a[0])); error.apply(console, a) }
      try {
        for (let i = 0; i < 10; i++) {
          __pg.set(openBox, i % 2 === 0)
          __pg.set(push, (i % 5) * 60)
          await __pg.sleep(120)
        }
        __pg.set(openBox, true)
        await __pg.sleep(600)
      } finally {
        console.warn = warn
        console.error = error
      }

      // Settled: twenty forced recalcs at one configuration must all agree.
      const settled = []
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new Event('resize'))
        await new Promise((r) => requestAnimationFrame(r))
        settled.push(__tt.teleported().dataset.teleportFit)
      }
      const recursive = seen.filter((m) => /Maximum recursive updates/.test(m))

      return {
        pass: recursive.length === 0 && new Set(settled).size === 1 && settled[0] !== undefined,
        detail:
          `${seen.length} console message(s), ${recursive.length} recursive-update bail-out(s) · ` +
          `settled on ${settled[0]} across 20 forced recalcs (${new Set(settled).size} distinct)`,
      }
    },
  },
  {
    demo: TIP,
    // TT-22 finding 6, the user-visible half. The README ships
    // `.dropdown[data-teleport-truncated] { … }` as a recipe, and a disabled
    // host that keeps the attribute is a host the consumer's CSS is still
    // styling as cut with nothing on it to explain why. The unit suite pins the
    // attribute set exactly; this pins that a real card reaches the state and
    // leaves it.
    name: 'card 13: unticking `open` drops data-teleport-truncated instead of leaving it on a dormant host',
    fn: async () => {
      const file = '13-content-measurement.vue'
      const tip = __tt.host(file, '.tip')
      const openBox = __pg.stage(file).querySelector('input[type=checkbox]')

      __pg.set(__tt.select(file, 'placement'), 'bottom')
      __pg.set(__tt.select(file, 'closed state'), 'opacity')
      __pg.set(__tt.slider(file, 'content'), 90)
      __pg.set(openBox, true)
      await __pg.sleep(600)
      const cut = __tt.read(tip)

      __pg.set(openBox, false)
      await __pg.sleep(500)
      const dormant = __tt.read(tip)

      // …and it comes back when the directive does, so this is not "cleared by
      // accident and never re-stamped".
      __pg.set(openBox, true)
      await __pg.sleep(600)
      const again = __tt.read(tip)

      return {
        pass:
          cut.truncated === true && cut.state === 'open' &&
          dormant.truncated === false && dormant.collapsed === false &&
          dormant.placement === null && dormant.fit === null &&
          dormant.state === 'closed' &&
          again.truncated === true && again.state === 'open',
        detail:
          `open → truncated=${cut.truncated} state=${cut.state} · ` +
          `disabled → truncated=${dormant.truncated} collapsed=${dormant.collapsed} ` +
          `placement=${dormant.placement} fit=${dormant.fit} state=${dormant.state} · ` +
          `re-opened → truncated=${again.truncated} state=${again.state}`,
      }
    },
  },
  {
    demo: VIRTUAL,
    // TT-22 finding 8, second bullet. The card promised the menu flips when you
    // right-click near the bottom of the box; the fit test measures against the
    // BOUNDARY, which defaulted to the viewport, so at 900px and 700px of
    // window height it never flipped and the reader saw the card contradict
    // itself. Both directions on the same box, so "it flips" is not a property
    // of every right-click.
    name: 'card 09: a virtual reference near the bottom of the boundary flips, near the top it does not',
    fn: async () => {
      const file = '09-virtual-reference.vue'
      const surface = __pg.stage(file).querySelector('.surface')
      const menu = __tt.host(file, '.menu')

      const rightClickAt = async (fraction) => {
        const r = surface.getBoundingClientRect()
        const x = Math.round(r.left + r.width / 2)
        const y = Math.round(r.top + r.height * fraction)
        surface.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
        )
        await __pg.sleep(400)
        const m = menu.getBoundingClientRect()
        return {
          y,
          placement: menu.dataset.teleportPlacement,
          fit: menu.dataset.teleportFit,
          // The user-visible fact, not the attribute: is the menu above the
          // cursor or below it?
          above: Math.round(m.bottom) <= y + 1,
          below: Math.round(m.top) >= y - 1,
          h: Math.round(m.height),
        }
      }

      const low = await rightClickAt(0.92)
      const high = await rightClickAt(0.08)

      return {
        pass:
          low.placement === 'top' && low.fit === 'flipped' && low.above &&
          high.placement === 'bottom' && high.fit === 'fits' && high.below &&
          low.h > 60,
        detail:
          `surface ${Math.round(surface.getBoundingClientRect().height)}px tall, ` +
          `viewport ${window.innerHeight}px · ` +
          `92% down (y=${low.y}) → ${low.placement}/${low.fit}, menu ${low.h}px, ` +
          `${low.above ? 'ABOVE' : 'below'} the cursor · ` +
          `8% down (y=${high.y}) → ${high.placement}/${high.fit}, ` +
          `${high.below ? 'BELOW' : 'above'} the cursor`,
      }
    },
  },
  {
    demo: OVERFLOW,
    // TT-22 finding 7, pinned in both directions. The README used to promise a
    // clamp that horizontal placement can never perform, and this card's
    // `overflow` control was dead in its `right` mode as a result. What the
    // clamp CAN do is reclaim the `offsetX` gap and nothing beyond it, because
    // its floor is the reference's own edge — so the test is: identical boxes
    // at `offsetX: 0`, and a real difference the moment there is a gap.
    name: "card 05: overflow 'shift' is inert on a horizontal placement, and moves exactly offsetX when there is one",
    fn: async () => {
      const file = '05-overflow.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)

      __pg.set(__tt.select(file, 'placement'), 'right')
      __pg.set(__tt.slider(file, 'widthMultiplier'), 6)
      await __pg.sleep(250)
      __pg.button(file, 'Push the reference').click()
      await __pg.sleep(1200)

      const readAt = async (mode) => {
        __pg.set(__tt.select(file, 'overflow'), mode)
        await __pg.sleep(350)
        const r = pop.getBoundingClientRect()
        return { left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100 }
      }

      __pg.set(__tt.slider(file, 'offsetX'), 0)
      await __pg.sleep(250)
      const noneAt0 = await readAt('none')
      const shiftAt0 = await readAt('shift')

      __pg.set(__tt.slider(file, 'offsetX'), 120)
      await __pg.sleep(250)
      const noneAt120 = await readAt('none')
      const shiftAt120 = await readAt('shift')

      const refRight = Math.round(trigger.getBoundingClientRect().right * 100) / 100
      const reclaimed = Math.round((noneAt120.left - shiftAt120.left) * 100) / 100
      // The card has to SAY so, not merely behave so — a dead control that
      // explains itself is the other half of the fix.
      __pg.set(__tt.select(file, 'overflow'), 'shift')
      __pg.set(__tt.slider(file, 'offsetX'), 0)
      await __pg.sleep(350)
      const notice = !!__pg.stage(file).querySelector('.inert')

      return {
        pass:
          // The host really is hanging off the right edge, or there is nothing
          // for the clamp to have declined to do.
          noneAt0.right > window.innerWidth &&
          // 1. At offsetX 0 the two modes are the same box. This is the claim.
          shiftAt0.left === noneAt0.left &&
          // 2. With a gap, shift reclaims it — all of it, and no more.
          reclaimed > 0 && Math.abs(reclaimed - 120) <= 1 &&
          // 3. …and lands back on the reference's edge, never past it.
          Math.abs(shiftAt120.left - refRight) <= 1 &&
          notice,
        detail:
          `reference right edge ${refRight}, viewport ${window.innerWidth} · ` +
          `offsetX 0 → none left ${noneAt0.left} / right ${noneAt0.right}, shift left ${shiftAt0.left} ` +
          `(${shiftAt0.left === noneAt0.left ? 'IDENTICAL' : 'differs'}) · ` +
          `offsetX 120 → none left ${noneAt120.left}, shift left ${shiftAt120.left} ` +
          `(reclaimed ${reclaimed}px) · card explains the no-op: ${notice}`,
      }
    },
  },
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
  {
    demo: ABSOLUTE,
    // `strategy: 'absolute'` resolves its coordinates against the host's
    // offsetParent — and through 1.1.2 it resolved them against that parent's
    // BORDER BOX, UNSCROLLED. Both are wrong: the containing block for an
    // absolutely-positioned child is the parent's PADDING box, laid out in the
    // parent's scrolled content coordinates.
    //
    // jsdom cannot see this at all — it has no layout, so `clientTop`,
    // `clientWidth` and `scrollTop` are 0 on every element and the two
    // formulas agree exactly. Measured here instead: a 20px-bordered pane
    // scrolled 450px put the host 438px above its trigger, in Chrome, with the
    // published artifact.
    //
    // The assertion is the only one that matters to a user: the popover's top
    // edge is on the trigger's bottom edge, at every scroll offset.
    name: "card 12: 'absolute' stays welded to its trigger while the offsetParent scrolls",
    fn: async () => {
      const file = '12-strategy-absolute.vue'
      const pane = __pg.stage(file).querySelector('.pane')
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      __pg.set(__tt.select(file, 'strategy'), 'absolute')
      // Park the card mid-screen first. `placement: 'bottom'` is fit-based:
      // a trigger sitting below the fold has no room underneath it, the host
      // legitimately flips to `top`, and the gap this check measures becomes
      // the height of the host plus the trigger instead of zero.
      __pg.sec(file).scrollIntoView({ block: 'center' })
      await __pg.sleep(400)

      // The card can only carry this check if the pane really is the origin
      // AND really scrolls — record both rather than assuming them.
      const origin = pop.offsetParent === pane ? 'pane' : (pop.offsetParent?.className ?? 'none')
      const border = Math.round(pane.clientTop)
      const max = pane.scrollHeight - pane.clientHeight

      const at = async (scrollTop) => {
        pane.scrollTop = scrollTop
        pane.dispatchEvent(new Event('scroll', { bubbles: true }))
        await __pg.sleep(350)
        const gap = pop.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom
        return {
          scrollTop: Math.round(pane.scrollTop),
          gap: Math.round(gap * 100) / 100,
          // Recorded so a flip reads as a flip in the detail line rather than
          // as an unexplained constant offset.
          side: pop.dataset.teleportPlacement,
        }
      }

      const seen = []
      for (const t of [0, Math.round(max / 3), Math.round((max * 2) / 3), max]) seen.push(await at(t))

      return {
        pass:
          origin === 'pane' &&
          border >= 1 &&
          max > 60 &&
          // Distinct scroll offsets, or the sweep proves nothing.
          new Set(seen.map((s) => s.scrollTop)).size >= 3 &&
          // Sub-pixel tolerance only: the released build was out by 438px.
          seen.every((s) => s.side === 'bottom' && Math.abs(s.gap) <= 1),
        detail:
          `offsetParent=${origin} border=${border}px scrollable=${max}px · ` +
          seen.map((s) => `@${s.scrollTop}→${s.side} gap ${s.gap}px`).join(' '),
      }
    },
  },
  {
    demo: FLIP,
    // The claim card 02's source comment now makes, measured rather than
    // asserted. The comment it replaces said the boundary was what made
    // horizontal space vary, and TT-22 finding 8 reported that `left` never
    // flipped in 30 rows — both true only because neither SLIDER touches the
    // horizontal axis. Scrolling the box sideways does, and both flips are
    // reachable that way.
    name: 'card 02: scrolling the box sideways reaches both horizontal flips',
    fn: async () => {
      const file = '02-placement-flip.vue'
      const box = __pg.stage(file).querySelector('.stage')
      const pop = __tt.host(file, '.popover')
      const select = __tt.select(file, 'placement')

      const at = async (side, scrollLeft) => {
        __pg.set(select, side)
        await __pg.sleep(200)
        box.scrollLeft = scrollLeft
        box.dispatchEvent(new Event('scroll', { bubbles: true }))
        await __pg.sleep(350)
        return `${pop.dataset.teleportPlacement}/${pop.dataset.teleportFit}`
      }

      const max = box.scrollWidth - box.clientWidth
      const rightAtLeftEnd = await at('right', 0)
      const leftAtRightEnd = await at('left', max)
      const middleFromLeft = await at('left', Math.round(max / 2))
      const middleFromRight = await at('right', Math.round(max / 2))

      return {
        pass:
          max > 200 &&
          rightAtLeftEnd === 'left/flipped' &&
          leftAtRightEnd === 'right/flipped' &&
          middleFromLeft.endsWith('/neither') &&
          middleFromRight.endsWith('/neither'),
        detail:
          `scrollable by ${max}px · right @0 → ${rightAtLeftEnd} · left @${max} → ${leftAtRightEnd} · ` +
          `middle: left → ${middleFromLeft}, right → ${middleFromRight}`,
      }
    },
  },
  {
    demo: BASIC,
    // The card with no options at all, which is the one most people copy. Its
    // claim is entirely geometric: a plain block that would otherwise lay out
    // at the stage's full width, under the clipper, instead renders as a menu
    // welded to the trigger's own left and bottom edges — and a user can click
    // the rows where they are painted.
    //
    // What makes it red: `to` never resolving (a template ref is null on the
    // render pass that reads it, so the FIRST mounted call always sees
    // `to: null` — this card is the shortest path to that regression) leaves
    // the menu in flow, the full width of the stage, with no `min-width` floor
    // and no anchor. The hit test is the half an attribute cannot carry: it
    // fails if the menu is painted somewhere the user cannot reach it.
    name: 'card 01: a bare binding pins the menu to its trigger at a positioned width, and its rows are clickable where they are painted',
    fn: async () => {
      const file = '01-basic-dropdown.vue'
      const menu = __tt.host(file, '.menu')
      const trigger = __tt.trigger(file)
      const stage = __tt.box(__pg.stage(file))

      __pg.button(file, 'menu').click()
      await __pg.sleep(300)
      const parked = await __tt.park(trigger, 300)

      const m = __tt.box(menu)
      const t = __tt.box(trigger)
      const side = menu.dataset.teleportPlacement
      const items = [...menu.querySelectorAll('.item')]
      const third = items[2]
      const tb = __tt.box(third)
      const hit = document.elementFromPoint(tb.cx, tb.cy)
      const hitName = hit === third ? 'the row itself' : `${hit ? hit.className || hit.tagName : 'nothing'}`

      // Click it the way a user would — at the coordinates it is painted at,
      // through the element the browser says is on top there.
      let after = null
      if (hit) {
        hit.click()
        await __pg.sleep(350)
        after = {
          display: getComputedStyle(menu).display,
          label: __pg.txt(__pg.button(file, 'menu')),
        }
      }

      return {
        pass:
          side === 'bottom' &&
          items.length === 5 &&
          // Welded to the reference, not laid out under it.
          Math.abs(m.top - t.bottom) <= 1 &&
          Math.abs(m.left - t.left) <= 1 &&
          // Between the `min-width` floor (the reference) and the `max-width`
          // ceiling (1.5x it) — and nowhere near the width a block in flow
          // would have taken.
          m.width >= t.width - 1 &&
          m.width <= t.width * 1.5 + 1 &&
          m.width < stage.width / 3 &&
          hit === third &&
          after !== null &&
          after.display === 'none' &&
          /Open menu/.test(after.label),
        detail:
          `reference parked ${parked}px from the top, ${t.width}px wide · ` +
          `menu ${side} at ${m.left},${m.top} (${m.width}x${m.height}) — ` +
          `top gap ${Math.round((m.top - t.bottom) * 100) / 100}px, ` +
          `left offset ${Math.round((m.left - t.left) * 100) / 100}px, ` +
          `vs ${stage.width}px of stage a block in flow would have filled · ` +
          `${items.length} rows, hit test at row 3 (${tb.cx},${tb.cy}) → ${hitName} · ` +
          `after clicking it: display ${after ? after.display : '(never clicked)'}, ` +
          `trigger says "${after ? after.label : '—'}"`,
      }
    },
  },
  {
    demo: BASIC,
    // The other half of a bare binding: `position: fixed` coordinates are
    // rewritten on every page scroll, so the menu has to stay on the trigger
    // while the page moves under it. A dropped scroll listener does not throw
    // and does not change one attribute — the menu simply stays where the
    // viewport last put it, which is the exact drift measured here.
    name: 'card 01: the open menu stays welded to its trigger across four page-scroll positions',
    fn: async () => {
      const file = '01-basic-dropdown.vue'
      const menu = __tt.host(file, '.menu')
      const trigger = __tt.trigger(file)

      __pg.button(file, 'menu').click()
      await __pg.sleep(300)

      // Only downward travel is guaranteed on any page, so measure the room
      // from the top of the document and step through it.
      window.scrollTo(0, 0)
      await __pg.sleep(500)
      const start = Math.round(trigger.getBoundingClientRect().top)
      const step = Math.max(0, (start - 140) / 3)

      const seen = []
      for (let i = 0; i < 4; i++) {
        const at = await __tt.park(trigger, Math.round(start - step * i))
        const m = __tt.box(menu)
        const t = __tt.box(trigger)
        const side = menu.dataset.teleportPlacement
        // The weld is measured against whichever edge the menu is anchored to.
        // `placement` here is the default `'auto'`, which prefers the roomier
        // side — 663px down a 1313px window really is more room above than
        // below once the edge buffers are charged — so pinning one side would
        // be testing the scroll position rather than the tracking.
        seen.push({
          at,
          side,
          weld:
            side === 'top'
              ? Math.round((t.top - m.bottom) * 100) / 100
              : Math.round((m.top - t.bottom) * 100) / 100,
          dx: Math.round((m.left - t.left) * 100) / 100,
          // …and the box really is on the side the attribute claims, so a
          // stale attribute over a mispositioned menu cannot read as a weld.
          onSide: side === 'top' ? m.bottom <= t.top + 1 : m.top >= t.bottom - 1,
        })
      }
      const tops = seen.map((s) => s.at)
      const spread = Math.max(...tops) - Math.min(...tops)

      return {
        pass:
          spread > 250 &&
          seen.every(
            (s) =>
              (s.side === 'top' || s.side === 'bottom') &&
              s.onSide &&
              Math.abs(s.weld) <= 1 &&
              Math.abs(s.dx) <= 1,
          ),
        detail:
          `reference starts ${start}px down a ${window.innerHeight}px viewport; ` +
          `swept ${spread}px of travel · ` +
          seen.map((s) => `@${s.at} ${s.side} weld ${s.weld}px dx ${s.dx}px`).join(' | '),
      }
    },
  },
  {
    demo: SIZING,
    // The card's own headline defect, in both of its forms. `min-width` was
    // written unconditionally — "at least as wide as the reference" — so it
    // beat every ceiling: on this 220px reference `widthMultiplier: 0.5`
    // rendered 220px and the README's own `maxWidth: 0` rendered 220px. Two
    // narrowing knobs, both documented, both silently dead.
    //
    // Red when the floor stops yielding: the panel snaps back to the
    // reference's width and both measurements read 220.
    name: 'card 03: widthMultiplier below 1 and a maxWidth under the reference both really narrow the panel',
    fn: async () => {
      const file = '03-sizing.vue'
      const panel = __tt.host(file, '.panel')
      const trigger = __tt.trigger(file, '.pg-btn')
      __pg.sec(file).scrollIntoView({ block: 'center' })
      __pg.set(__tt.toggle(file, 'matchWidth'), false)
      __pg.set(__tt.toggle(file, 'maxWidth'), false)
      await __pg.sleep(450)

      const ref = __tt.box(trigger).width
      const widthAt = async () => {
        await __pg.sleep(400)
        return __tt.box(panel).width
      }

      __pg.set(__tt.slider(file, 'widthMultiplier'), 1.5)
      const wide = await widthAt()
      __pg.set(__tt.slider(file, 'widthMultiplier'), 0.5)
      const half = await widthAt()

      // …and the same claim through the other knob. Back to a multiplier that
      // would leave the panel wide, so only `maxWidth` can narrow it.
      __pg.set(__tt.slider(file, 'widthMultiplier'), 1.5)
      await __pg.sleep(300)
      __pg.set(__tt.toggle(file, 'maxWidth'), true)
      await __pg.sleep(200)
      __pg.set(__pg.stage(file).querySelector('input.pg-input'), 140)
      const capped = await widthAt()

      return {
        pass:
          // The premise: this really is the 220px reference the prose names.
          ref > 200 &&
          // 1.5x: the floor is the reference, and nothing is cut below it.
          wide >= ref - 1 &&
          wide <= ref * 1.5 + 1 &&
          // 0.5x: the ceiling wins, to the pixel.
          Math.abs(half - ref * 0.5) <= 1.5 &&
          half < ref - 90 &&
          // maxWidth 140 < 220: same story, different knob.
          Math.abs(capped - 140) <= 1.5,
        detail:
          `reference ${ref}px wide · widthMultiplier 1.5 → ${wide}px · ` +
          `widthMultiplier 0.5 → ${half}px (want ${Math.round(ref * 0.5)}px, ` +
          `the old floor would have held it at ${ref}px) · ` +
          `maxWidth 140 → ${capped}px`,
      }
    },
  },
  {
    demo: SIZING,
    // "Toggle matchWidth on and off again and the panel returns to its previous
    // width: the pinned `width` is cleared, not left welded on." That sentence
    // exists because `width` used to be set and never written back, so
    // `matchWidth: true → false` pinned the host at the reference's width
    // forever — the invariant is now "every style key is written every tick,
    // '' where it does not apply", and this is what that looks like on screen.
    name: 'card 03: matchWidth pins the panel to the reference and unticking it releases the pin instead of welding it on',
    fn: async () => {
      const file = '03-sizing.vue'
      const panel = __tt.host(file, '.panel')
      const trigger = __tt.trigger(file, '.pg-btn')
      __pg.sec(file).scrollIntoView({ block: 'center' })
      __pg.set(__tt.toggle(file, 'maxWidth'), false)
      __pg.set(__tt.toggle(file, 'matchWidth'), false)
      // A multiplier that makes "pinned" and "released" two obviously
      // different boxes: half the reference, versus exactly the reference.
      __pg.set(__tt.slider(file, 'widthMultiplier'), 0.5)
      await __pg.sleep(500)

      const ref = __tt.box(trigger).width
      const before = __tt.box(panel).width
      __pg.set(__tt.toggle(file, 'matchWidth'), true)
      await __pg.sleep(450)
      const pinned = __tt.box(panel).width
      __pg.set(__tt.toggle(file, 'matchWidth'), false)
      await __pg.sleep(450)
      const released = __tt.box(panel).width
      // Twice, because a clear that only works on the first cycle is still a leak.
      __pg.set(__tt.toggle(file, 'matchWidth'), true)
      await __pg.sleep(400)
      const pinnedAgain = __tt.box(panel).width
      __pg.set(__tt.toggle(file, 'matchWidth'), false)
      await __pg.sleep(400)
      const releasedAgain = __tt.box(panel).width

      return {
        pass:
          Math.abs(before - ref * 0.5) <= 1.5 &&
          Math.abs(pinned - ref) <= 1 &&
          Math.abs(pinnedAgain - ref) <= 1 &&
          Math.abs(released - before) <= 1.5 &&
          Math.abs(releasedAgain - before) <= 1.5 &&
          // And the two states really are distinguishable, or none of it means
          // anything.
          Math.abs(pinned - released) > 60,
        detail:
          `reference ${ref}px · at widthMultiplier 0.5 the panel is ${before}px · ` +
          `matchWidth on → ${pinned}px, off → ${released}px, on → ${pinnedAgain}px, ` +
          `off → ${releasedAgain}px (a welded pin would read ${ref}px after every untick)`,
      }
    },
  },
  {
    demo: SIZING,
    // `maxHeight` is a cap on the host AND the number clamped to the room on
    // the chosen side, and the user-visible face of it is how many of the
    // twelve lines they can read. Reported, not inferred: the rendered box,
    // the scroll overflow inside it, the truncation flag, and the row count.
    //
    // Red if the cap stops being written (twelve rows at every setting), if it
    // is written but the content is not scrollable (a cut with no way to see
    // the rest), or if `data-teleport-truncated` stops noticing a real cut.
    name: 'card 03: maxHeight is the panel\'s rendered height, and the lines past it scroll instead of vanishing',
    fn: async () => {
      const file = '03-sizing.vue'
      const panel = __tt.host(file, '.panel')
      const trigger = __tt.trigger(file, '.pg-btn')
      __pg.set(__tt.toggle(file, 'matchWidth'), false)
      __pg.set(__tt.toggle(file, 'maxWidth'), false)
      __pg.set(__tt.slider(file, 'widthMultiplier'), 1.5)
      await __pg.sleep(400)
      // High on the page, so the room below is never what clamps the cap.
      const parked = await __tt.park(trigger, 200)
      const room = Math.round(window.innerHeight - trigger.getBoundingClientRect().bottom)

      const at = async (px) => {
        __pg.set(__tt.slider(file, 'maxHeight'), px)
        await __pg.sleep(450)
        const b = __tt.box(panel)
        const r = __tt.rows(panel)
        return {
          px,
          h: b.height,
          rows: `${r.visible}/${r.total}`,
          visible: r.visible,
          total: r.total,
          over: panel.scrollHeight - panel.clientHeight,
          cut: panel.dataset.teleportTruncated !== undefined,
          side: panel.dataset.teleportPlacement,
        }
      }

      const tall = await at(320)
      const mid = await at(180)
      const tight = await at(60)

      return {
        pass:
          room > 400 &&
          tall.total === 12 &&
          [tall, mid, tight].every((s) => s.side === 'bottom') &&
          // The cap is a ceiling at every setting…
          tall.h <= 321 && mid.h <= 181 && tight.h <= 61 &&
          // …and it is the height whenever the content is taller than it.
          mid.h >= 179 && tight.h >= 59 &&
          // The user can read fewer lines as the cap tightens, and the ones
          // they cannot read are scrollable rather than gone.
          tall.visible >= 10 &&
          tight.visible <= 4 &&
          tall.visible > mid.visible && mid.visible > tight.visible &&
          tight.over >= 100 &&
          tight.cut === true,
        detail:
          `reference parked ${parked}px down, ${room}px of room below · ` +
          [tall, mid, tight]
            .map((s) => `maxHeight ${s.px} → ${s.h}px tall, ${s.rows} lines readable, ` +
              `${s.over}px scrollable, truncated=${s.cut}`)
            .join(' · '),
      }
    },
  },
  {
    demo: BOUNDARY,
    // `boundary` is the option that decides how much room the fit test thinks
    // there is, and the only honest way to show it is to change nothing else.
    // The reference is parked a fixed distance above the pane's own bottom
    // edge — too little room below it inside the pane, hundreds of px below it
    // in the viewport — so the SAME geometry has to produce opposite sides.
    //
    // Red if `boundary` stops reaching the space maths: both readings become
    // `bottom`, the two available-space numbers converge, and the popover the
    // card draws inside a 200px pane is the one that never fitted there.
    name: 'card 04: boundary = pane clamps the fit test to the pane — same geometry, opposite side, and hundreds of px less room reported',
    fn: async () => {
      const file = '04-boundary-scroll.vue'
      const pane = __pg.stage(file).querySelector('.pane')
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      const said = () => __pg.txt(pop.querySelector('.pg-muted'))

      __pg.sec(file).scrollIntoView({ block: 'center' })
      __pg.set(__tt.select(file, 'scrollContainer'), 'window')
      __pg.set(__tt.toggle(file, 'hideWhenReferenceHidden'), true)
      await __pg.sleep(450)
      // A known page position, so the viewport half of the comparison is a
      // number this check chose rather than one `scrollIntoView` happened to
      // leave behind. Page scroll does not move the reference inside the pane,
      // so the pane half is untouched by it.
      const parked = await __tt.park(trigger, 400)

      // Park the reference 25px above the pane's own bottom edge. Twice:
      // `scrollTop` is clamped and quantised, so one pass can land short.
      for (let i = 0; i < 2; i++) {
        pane.scrollTop += Math.round(
          trigger.getBoundingClientRect().bottom - (pane.getBoundingClientRect().bottom - 25),
        )
        pane.dispatchEvent(new Event('scroll', { bubbles: true }))
        await __pg.sleep(350)
      }
      await __pg.sleep(200)
      const pr = pane.getBoundingClientRect()
      const t0 = trigger.getBoundingClientRect()
      const below = Math.round(pr.bottom - t0.bottom)
      const above = Math.round(t0.top - pr.top)
      const hostH = Math.round(pop.getBoundingClientRect().height)

      const read = async (on) => {
        __pg.set(__tt.toggle(file, 'boundary'), on)
        await __pg.sleep(500)
        const h = __tt.box(pop)
        const t = __tt.box(trigger)
        const line = said()
        const m = line.match(/(-?\d+)px available/)
        return {
          side: pop.dataset.teleportPlacement,
          fit: pop.dataset.teleportFit,
          space: m ? Number(m[1]) : NaN,
          maxH: getComputedStyle(pop).maxHeight,
          overRef: h.bottom <= t.top + 1,
          underRef: h.top >= t.bottom - 1,
          line,
        }
      }

      const bounded = await read(true)
      const free = await read(false)

      return {
        pass:
          // The premise, measured: the reference is fully inside the pane, the
          // popover cannot fit in the room left below it there, and can fit in
          // the room above it.
          below > 4 && below < hostH && above >= hostH + 20 && hostH > 35 &&
          // Clamped to the pane: the room below is unusable, so the only side
          // that works is above — and the space it reports is pane-sized.
          bounded.side === 'top' && bounded.fit === 'fits' && bounded.overRef &&
          bounded.space <= 220 &&
          // Clamped to the viewport: the same reference, the same instant, has
          // room to spare on the other side.
          free.side === 'bottom' && free.fit === 'fits' && free.underRef &&
          free.space >= 400 &&
          free.space - bounded.space > 300,
        detail:
          `reference parked ${parked}px down the page · ` +
          `pane ${Math.round(pr.height)}px tall, reference ${below}px above its bottom edge and ` +
          `${above}px below its top, popover ${hostH}px · ` +
          `boundary=pane → ${bounded.side}/${bounded.fit}, ${bounded.space}px available, ` +
          `max-height ${bounded.maxH}, painted ${bounded.overRef ? 'ABOVE' : 'below'} the reference · ` +
          `boundary=viewport → ${free.side}/${free.fit}, ${free.space}px available, ` +
          `max-height ${free.maxH}, painted ${free.underRef ? 'BELOW' : 'above'} the reference`,
      }
    },
  },
  {
    demo: BOUNDARY,
    // `hideWhenReferenceHidden` is on by default, so the failure it guards
    // against is a popover left floating over a pane whose trigger scrolled
    // away. The half that actually shipped broken elsewhere in this library is
    // the RELEASE: a hide the directive applied and never took back leaves the
    // host `visibility: hidden` forever, which no test that only scrolls one
    // way can see. Both directions, twice.
    name: 'card 04: the reference leaving the pane blanks the host, and unticking hideWhenReferenceHidden gives it straight back',
    fn: async () => {
      const file = '04-boundary-scroll.vue'
      const pane = __pg.stage(file).querySelector('.pane')
      const pop = __tt.host(file, '.pop')
      const said = () => __pg.txt(pop.querySelector('.pg-muted'))

      // The pane IS the boundary here, and the region the hide test uses is
      // `intersect(pane, viewport)` — so a pane hanging half off the screen
      // would hide the host for the wrong reason. Put it in the middle.
      pane.scrollIntoView({ block: 'center' })
      __pg.set(__tt.toggle(file, 'boundary'), true)
      __pg.set(__tt.select(file, 'scrollContainer'), 'window')
      __pg.set(__tt.toggle(file, 'hideWhenReferenceHidden'), true)
      pane.scrollTop = 0
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
      await __pg.sleep(500)

      const snap = (label) => ({
        label,
        vis: getComputedStyle(pop).visibility,
        marked: pop.dataset.teleportHidden !== undefined,
        flagged: /hidden/.test(said()),
      })
      const visible = snap('reference in the pane')

      const max = pane.scrollHeight - pane.clientHeight
      pane.scrollTop = max
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
      await __pg.sleep(500)
      const gone = snap('scrolled past the reference')

      __pg.set(__tt.toggle(file, 'hideWhenReferenceHidden'), false)
      await __pg.sleep(500)
      const optedOut = snap('hideWhenReferenceHidden off')

      __pg.set(__tt.toggle(file, 'hideWhenReferenceHidden'), true)
      await __pg.sleep(500)
      const goneAgain = snap('back on')

      pane.scrollTop = 0
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
      await __pg.sleep(500)
      const back = snap('reference back in view')

      const states = [visible, gone, optedOut, goneAgain, back]
      return {
        pass:
          max > 150 &&
          visible.vis === 'visible' && !visible.marked && !visible.flagged &&
          gone.vis === 'hidden' && gone.marked && gone.flagged &&
          optedOut.vis === 'visible' && !optedOut.marked && !optedOut.flagged &&
          goneAgain.vis === 'hidden' && goneAgain.marked &&
          back.vis === 'visible' && !back.marked && !back.flagged,
        detail:
          `pane scrollable by ${max}px · ` +
          states
            .map((s) => `${s.label}: visibility ${s.vis}, data-teleport-hidden ${s.marked}, ` +
              `card says hidden ${s.flagged}`)
            .join(' · '),
      }
    },
  },
  {
    demo: BOUNDARY,
    // The trade-off the card spends a whole paragraph on, and the one nobody
    // would guess: naming a `scrollContainer` REPLACES the capture-phase window
    // listener rather than adding to it, so a page scroll stops moving the
    // host — except while `hideWhenReferenceHidden` is on, which unions
    // `window` back in as a floor because hiding cannot work without it.
    //
    // Three legs, one page scroll each. Red if the narrowing is not real (the
    // first leg tracks anyway, so the paragraph is a lie), or if the floor
    // stops being applied (the second leg drifts, and a default-on behaviour
    // silently fails on a documented configuration).
    name: "card 04: naming a scrollContainer drops the window listener — unless hideWhenReferenceHidden floors it back in",
    fn: async () => {
      const file = '04-boundary-scroll.vue'
      const pane = __pg.stage(file).querySelector('.pane')
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)

      // Viewport boundary, reference at the top of the pane: the page scroll
      // must not change the room, so any movement is the listener and nothing else.
      __pg.set(__tt.toggle(file, 'boundary'), false)
      pane.scrollTop = 0
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
      await __pg.sleep(450)

      const gap = () =>
        Math.round((pop.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom) * 100) / 100

      const leg = async (form, hide, label) => {
        // Neutral first — the tracking configuration — so parking can never
        // leave a stale gap behind for the leg to inherit.
        __pg.set(__tt.select(file, 'scrollContainer'), 'window')
        __pg.set(__tt.toggle(file, 'hideWhenReferenceHidden'), true)
        await __pg.sleep(400)
        const parked = await __tt.park(trigger, 500)
        __pg.set(__tt.select(file, 'scrollContainer'), form)
        __pg.set(__tt.toggle(file, 'hideWhenReferenceHidden'), hide)
        await __pg.sleep(500)
        const before = gap()
        window.scrollBy(0, 200)
        await __pg.sleep(550)
        const after = gap()
        window.scrollBy(0, -200)
        await __pg.sleep(300)
        return { label, parked, before, after, moved: Math.round((after - before) * 100) / 100 }
      }

      const narrowed = await leg('pane', false, "pane, hide off")
      const floored = await leg('pane', true, "pane, hide on")
      const windowed = await leg('window', false, "'window', hide off")
      const legs = [narrowed, floored, windowed]

      return {
        pass:
          // Every leg starts anchored, or the deltas below mean nothing.
          legs.every((l) => Math.abs(l.before) <= 1.5) &&
          // Narrowed and opted out: nothing repositions, so the host drifts by
          // exactly the page scroll.
          Math.abs(narrowed.moved - 200) <= 3 &&
          // The floor, and the default: still welded after the same scroll.
          Math.abs(floored.moved) <= 2 &&
          Math.abs(windowed.moved) <= 2,
        detail:
          `200px page scroll per leg · ` +
          legs
            .map((l) => `${l.label}: gap ${l.before}px → ${l.after}px (drifted ${l.moved}px)`)
            .join(' · '),
      }
    },
  },
  {
    demo: ARROW,
    // The directive never draws the arrow; it publishes one number per axis and
    // the consumer's CSS pins the arrow to the edge facing the reference. The
    // contract is that the arrow's painted centre sits exactly on the
    // reference's painted centre, and it has to hold on all four sides — the
    // horizontal ones read the OTHER variable, computed from the other pair of
    // edges, so a fix on one axis says nothing about the other.
    //
    // Red on the historical defect (the left edge derived from the PROJECTED
    // width rather than the rendered one, which put the arrow 127px outside the
    // popover) and equally red if the vars stop being emitted at all: with
    // `left: var(--teleport-arrow-x)` unresolved the arrow falls back to its
    // static position and the error becomes tens of pixels.
    name: 'card 06: the arrow centre lands on the reference centre on all four placements, right across the rail',
    fn: async () => {
      const file = '06-arrow.vue'
      const pop = __tt.host(file, '.pop')
      const arrow = __tt.host(file, '.arrow')
      const trigger = __tt.trigger(file)
      __pg.sec(file).scrollIntoView({ block: 'center' })
      __pg.set(__tt.slider(file, 'widthMultiplier'), 4)
      await __pg.sleep(500)

      const seen = []
      for (const asked of ['bottom', 'top', 'left', 'right']) {
        __pg.set(__tt.select(file, 'placement'), asked)
        await __pg.sleep(300)
        for (const pos of [0, 45, 100]) {
          __pg.set(__tt.slider(file, 'reference position'), pos)
          await __pg.sleep(400)
          // The side it actually went to, not the one that was asked for: a
          // horizontal request with no room flips, and the arrow then reads
          // the other axis. Testing the requested side would measure the
          // wrong variable and call it a pass.
          const got = pop.dataset.teleportPlacement
          const horizontal = got === 'left' || got === 'right'
          const a = __tt.box(arrow)
          const t = __tt.box(trigger)
          const h = __tt.box(pop)
          const err = horizontal ? a.cy - t.cy : a.cx - t.cx
          const inside = horizontal
            ? a.cy >= h.top - 1 && a.cy <= h.bottom + 1
            : a.cx >= h.left - 1 && a.cx <= h.right + 1
          seen.push({
            asked,
            pos,
            got,
            err: Math.round(err * 100) / 100,
            inside,
            axis: horizontal ? 'y' : 'x',
          })
        }
      }
      const worst = seen.reduce((m, s) => (Math.abs(s.err) > Math.abs(m.err) ? s : m), seen[0])
      const sides = [...new Set(seen.map((s) => s.got))]

      return {
        pass:
          seen.length === 12 &&
          // All four sides were really exercised, or this is a check on one
          // branch wearing four names.
          sides.length === 4 &&
          seen.every((s) => Math.abs(s.err) <= 0.75 && s.inside),
        detail:
          `12 samples across ${sides.length} rendered side(s) (${sides.join('/')}) · ` +
          `worst arrow error ${worst.err}px on the ${worst.axis} axis ` +
          `(asked ${worst.asked}, got ${worst.got}, rail ${worst.pos}%) · ` +
          `${seen.filter((s) => !s.inside).length} sample(s) put the arrow outside its own popover`,
      }
    },
  },
  {
    demo: ARROW,
    // The specific shape the arrow bug had. Past 71% of the viewport width the
    // host right-anchors on its own — no option asks for it — and is then
    // positioned with CSS `right:`, so its real left edge is
    // `referenceRight − RENDERED width`. `max-width` is a cap, so at a 6x
    // multiplier on a 96px reference the rendered width is nowhere near the
    // projected 576px, and deriving the arrow from the projection put it a
    // couple of hundred pixels past the popover's own edge.
    //
    // The check requires the threshold to be REACHED: the card's own prose
    // admits the slider cannot reach it on a window wider than ~2100px, so a
    // run that never right-anchors has not tested this and must say so rather
    // than pass.
    name: 'card 06: past 71% of the viewport the host right-anchors, and the arrow follows the rendered width, not the projected one',
    fn: async () => {
      const file = '06-arrow.vue'
      const pop = __tt.host(file, '.pop')
      const arrow = __tt.host(file, '.arrow')
      const trigger = __tt.trigger(file)
      const status = () => __pg.txt(__pg.stage(file).querySelector('.status'))

      __pg.sec(file).scrollIntoView({ block: 'center' })
      __pg.set(__tt.select(file, 'placement'), 'bottom')
      __pg.set(__tt.slider(file, 'widthMultiplier'), 6)
      await __pg.sleep(500)

      const at = async (pos) => {
        __pg.set(__tt.slider(file, 'reference position'), pos)
        await __pg.sleep(450)
        const t = __tt.box(trigger)
        const h = __tt.box(pop)
        const a = __tt.box(arrow)
        return {
          pos,
          pct: Math.round((t.right / window.innerWidth) * 1000) / 10,
          anchoredRight: pop.style.right !== '',
          rendered: h.width,
          projected: Math.round(t.width * 6),
          err: Math.round((a.cx - t.cx) * 100) / 100,
          inside: a.cx >= h.left - 1 && a.cx <= h.right + 1,
          weldRight: Math.round((h.right - t.right) * 100) / 100,
          weldLeft: Math.round((h.left - t.left) * 100) / 100,
          say: status(),
        }
      }

      const near = await at(20)
      const far = await at(100)

      return {
        pass:
          // Left of the threshold: left-anchored, welded to the reference's
          // left edge.
          near.pct < 71 && !near.anchoredRight && Math.abs(near.weldLeft) <= 1 &&
          Math.abs(near.err) <= 0.75 && near.inside &&
          // The threshold was actually reached on this window.
          far.pct >= 71 && far.anchoredRight &&
          // Right-anchored: welded to the reference's RIGHT edge instead.
          Math.abs(far.weldRight) <= 1 &&
          // The gap that made the defect possible is genuinely open here.
          far.projected - far.rendered > 100 &&
          Math.abs(far.err) <= 0.75 && far.inside &&
          // And the card tells the reader the same thing it is doing. The
          // sign is optional because `(-0.004).toFixed(1)` is `"-0.0"`, which
          // is the same zero.
          /right-anchored/.test(far.say) &&
          /arrow off centre by -?0\.0px/.test(far.say),
        detail:
          `viewport ${window.innerWidth}px (layout ${document.documentElement.clientWidth}px, scrollbar ${window.innerWidth - document.documentElement.clientWidth}px), threshold at ${Math.round(window.innerWidth * 0.71)}px · ` +
          `rail 20% → reference right at ${near.pct}%, ${near.anchoredRight ? 'right' : 'left'}-anchored, ` +
          `left weld ${near.weldLeft}px, arrow off ${near.err}px · ` +
          `rail 100% → reference right at ${far.pct}%, ${far.anchoredRight ? 'right' : 'left'}-anchored, ` +
          `host ${far.rendered}px rendered / ${far.projected}px projected, right weld ${far.weldRight}px, ` +
          `arrow off ${far.err}px, inside=${far.inside} · card says: ${far.say}`,
      }
    },
  },
  {
    demo: CROSS,
    // `crossAxisAlign` is three different anchor formulas, and the only way to
    // tell them apart is where the host's box lands. Each is asserted against
    // its OWN edge — start against the reference's left, center against its
    // centre, end against its right — so "alignment was ignored and everything
    // left-anchored" fails on two of the three rather than passing on all.
    //
    // The vacuity guard matters as much as the assertions: if the host and the
    // reference happen to be the same width the three formulas coincide and
    // the check proves nothing, so the difference is measured and required.
    name: 'card 07: the three crossAxisAlign values land the host on three different edges, and offsetX/offsetY nudge it exactly',
    fn: async () => {
      const file = '07-cross-axis-offsets.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      const n = (v) => Math.round(v * 100) / 100

      __pg.set(__tt.select(file, 'placement'), 'bottom')
      __pg.set(__tt.slider(file, 'reference position'), 20)
      __pg.set(__tt.slider(file, 'widthMultiplier'), 2)
      __pg.set(__tt.slider(file, 'offsetX'), 0)
      __pg.set(__tt.slider(file, 'offsetY'), 8)
      await __pg.sleep(450)
      const parked = await __tt.park(trigger, 300)

      const read = async (align) => {
        __pg.set(__tt.select(file, 'crossAxisAlign'), align)
        await __pg.sleep(400)
        const h = __tt.box(pop)
        const t = __tt.box(trigger)
        return {
          align,
          side: pop.dataset.teleportPlacement,
          left: h.left,
          startErr: n(h.left - t.left),
          centreErr: n(h.cx - t.cx),
          endErr: n(h.right - t.right),
          topErr: n(h.top - t.bottom - 8),
          hostW: h.width,
          refW: t.width,
        }
      }

      const start = await read('start')
      const centre = await read('center')
      const end = await read('end')

      // The offsets, read off the anchor they are cleanest against.
      __pg.set(__tt.select(file, 'crossAxisAlign'), 'start')
      __pg.set(__tt.slider(file, 'offsetX'), 60)
      __pg.set(__tt.slider(file, 'offsetY'), -40)
      await __pg.sleep(450)
      const hn = __tt.box(pop)
      const tn = __tt.box(trigger)
      const nudged = {
        side: pop.dataset.teleportPlacement,
        dx: n(hn.left - tn.left - 60),
        dy: n(hn.top - tn.bottom + 40),
      }

      return {
        pass:
          // The premise: the two boxes differ enough for the three formulas to
          // give three different answers.
          Math.abs(start.hostW - start.refW) >= 6 &&
          [start, centre, end].every((r) => r.side === 'bottom') &&
          nudged.side === 'bottom' &&
          // Each alignment against its own edge.
          Math.abs(start.startErr) <= 1 &&
          Math.abs(centre.centreErr) <= 1 &&
          Math.abs(end.endErr) <= 1 &&
          // The default offsetY of 8 is honoured on all three.
          [start, centre, end].every((r) => Math.abs(r.topErr) <= 1) &&
          // And the offsets move the host by exactly what they say.
          Math.abs(nudged.dx) <= 1 &&
          Math.abs(nudged.dy) <= 1,
        detail:
          `reference parked ${parked}px down, ${start.refW}px wide; host ${start.hostW}px wide ` +
          `(${n(Math.abs(start.hostW - start.refW))}px of spread between the three anchors) · ` +
          `start → left edge off by ${start.startErr}px · ` +
          `center → centre off by ${centre.centreErr}px · ` +
          `end → right edge off by ${end.endErr}px · ` +
          `host lefts ${start.left} / ${centre.left} / ${end.left} · ` +
          `offsetX 60 / offsetY -40 → off by ${nudged.dx}px, ${nudged.dy}px`,
      }
    },
  },
  {
    demo: CROSS,
    // "Passing any explicit value — including 'start' — opts out of that
    // heuristic for good, so the same slide changes nothing." That sentence is
    // the card's whole point and it is only testable at the right-hand end of
    // the rail, where the omitted form flips to a right anchor on its own.
    //
    // Two claims in one place, so a regression cannot hide behind the other:
    // the implicit branch still fires where it is documented to, and an
    // explicit value really does neutralise it. `end` at the LEFT end is the
    // control that keeps this from being "the heuristic is the only thing that
    // right-anchors".
    name: "card 07: at the rail's right end the omitted crossAxisAlign right-anchors, an explicit 'start' does not, and 'end' anchors right anywhere",
    fn: async () => {
      const file = '07-cross-axis-offsets.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      const status = () => __pg.txt(__pg.stage(file).querySelector('.status'))
      const n = (v) => Math.round(v * 100) / 100

      __pg.set(__tt.select(file, 'placement'), 'bottom')
      __pg.set(__tt.slider(file, 'widthMultiplier'), 2)
      __pg.set(__tt.slider(file, 'offsetX'), 0)
      await __pg.sleep(400)
      await __tt.park(trigger, 300)

      const at = async (align, pos) => {
        __pg.set(__tt.select(file, 'crossAxisAlign'), align)
        __pg.set(__tt.slider(file, 'reference position'), pos)
        await __pg.sleep(450)
        const h = __tt.box(pop)
        const t = __tt.box(trigger)
        return {
          align,
          pos,
          pct: Math.round((t.right / window.innerWidth) * 1000) / 10,
          anchoredRight: pop.style.right !== '',
          leftWeld: n(h.left - t.left),
          rightWeld: n(h.right - t.right),
          say: status(),
        }
      }

      const legacyFar = await at('legacy', 100)
      const startFar = await at('start', 100)
      const endNear = await at('end', 20)
      const legacyNear = await at('legacy', 20)

      return {
        pass:
          // The threshold was reachable on this window — otherwise nothing
          // below has been tested.
          legacyFar.pct >= 71 && legacyNear.pct < 71 &&
          // Omitted: the implicit branch fires past the threshold and not before.
          legacyFar.anchoredRight && Math.abs(legacyFar.rightWeld) <= 1 &&
          /right-anchored/.test(legacyFar.say) &&
          !legacyNear.anchoredRight && Math.abs(legacyNear.leftWeld) <= 1 &&
          // Explicit 'start' at the same position: untouched by the heuristic.
          !startFar.anchoredRight && Math.abs(startFar.leftWeld) <= 1 &&
          /left-anchored/.test(startFar.say) &&
          // Explicit 'end' well below the threshold: right-anchors anyway.
          endNear.anchoredRight && Math.abs(endNear.rightWeld) <= 1,
        detail:
          `viewport ${window.innerWidth}px (layout ${document.documentElement.clientWidth}px, scrollbar ${window.innerWidth - document.documentElement.clientWidth}px), heuristic fires past ` +
          `${Math.round(window.innerWidth * 0.71)}px · ` +
          [legacyFar, startFar, endNear, legacyNear]
            .map((r) => `${r.align}@${r.pos}% (ref right ${r.pct}%) → ` +
              `${r.anchoredRight ? 'right' : 'left'}-anchored, ` +
              `left weld ${r.leftWeld}px / right weld ${r.rightWeld}px`)
            .join(' · '),
      }
    },
  },
  {
    demo: CROSS,
    // The horizontal branch is a second, separate cascade: the cross axis
    // becomes VERTICAL, the anchor becomes the reference's right edge, and
    // `offsetY` stops meaning "gap" and starts meaning "slide along the
    // reference". None of that is exercised by the vertical check above.
    // `widthMultiplier: 1` is deliberate — it wraps the host onto two lines so
    // the host and the reference are measurably different heights, which is
    // what makes the three alignments distinguishable at all.
    name: "card 07: on a horizontal placement the host welds to the reference's right edge and crossAxisAlign works down the vertical axis",
    fn: async () => {
      const file = '07-cross-axis-offsets.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      const n = (v) => Math.round(v * 100) / 100

      __pg.set(__tt.select(file, 'placement'), 'right')
      __pg.set(__tt.slider(file, 'reference position'), 20)
      __pg.set(__tt.slider(file, 'widthMultiplier'), 1)
      __pg.set(__tt.slider(file, 'offsetX'), 0)
      __pg.set(__tt.slider(file, 'offsetY'), 0)
      await __pg.sleep(450)
      const parked = await __tt.park(trigger, 300)

      const read = async (align) => {
        __pg.set(__tt.select(file, 'crossAxisAlign'), align)
        await __pg.sleep(400)
        const h = __tt.box(pop)
        const t = __tt.box(trigger)
        return {
          align,
          side: pop.dataset.teleportPlacement,
          weld: n(h.left - t.right),
          startErr: n(h.top - t.top),
          centreErr: n(h.cy - t.cy),
          endErr: n(h.bottom - t.bottom),
          hostH: h.height,
          refH: t.height,
        }
      }

      const start = await read('start')
      const centre = await read('center')
      const end = await read('end')

      __pg.set(__tt.select(file, 'crossAxisAlign'), 'start')
      __pg.set(__tt.slider(file, 'offsetX'), 40)
      __pg.set(__tt.slider(file, 'offsetY'), 20)
      await __pg.sleep(450)
      const hn = __tt.box(pop)
      const tn = __tt.box(trigger)
      const nudged = {
        side: pop.dataset.teleportPlacement,
        dx: n(hn.left - tn.right - 40),
        dy: n(hn.top - tn.top - 20),
      }

      return {
        pass:
          // Vacuity guard: two boxes of the same height make the three
          // formulas agree, and the check would pass on nothing.
          Math.abs(start.hostH - start.refH) >= 8 &&
          [start, centre, end].every((r) => r.side === 'right' && Math.abs(r.weld) <= 1) &&
          Math.abs(start.startErr) <= 1 &&
          Math.abs(centre.centreErr) <= 1 &&
          Math.abs(end.endErr) <= 1 &&
          nudged.side === 'right' &&
          Math.abs(nudged.dx) <= 1 &&
          Math.abs(nudged.dy) <= 1,
        detail:
          `reference parked ${parked}px down, ${start.refH}px tall; host ${start.hostH}px tall ` +
          `(${n(Math.abs(start.hostH - start.refH))}px of spread between the three anchors) · ` +
          `left edge welded to the reference's right by ` +
          `${[start, centre, end].map((r) => r.weld + 'px').join('/')} · ` +
          `start → top off ${start.startErr}px · center → centre off ${centre.centreErr}px · ` +
          `end → bottom off ${end.endErr}px · ` +
          `offsetX 40 / offsetY 20 → off by ${nudged.dx}px, ${nudged.dy}px`,
      }
    },
  },
  {
    demo: AUTO,
    // `autoUpdate` exists for exactly the layout change no event reports, and
    // the card is built so nothing else can produce the answer: both buttons
    // mutate the DOM with `document.createTextNode` and the drift readout is
    // written straight into a text node, so Vue never re-renders and the
    // directive's `updated` hook never fires. The reference is an INLINE
    // element in a narrow column, so the appended words wrap and it grows
    // downwards — which is the only direction the anchor cares about.
    //
    // Red both ways: if the observers stop firing the second reading drifts,
    // and if the card ever grows a reactive dependency the FIRST reading stops
    // drifting and the card starts proving the opposite of what it claims.
    name: 'card 08: with autoUpdate off a growing reference leaves the host behind, and with it on the host follows',
    fn: async () => {
      const file = '08-auto-update.vue'
      const host = __tt.host(file, '.pop')
      const ref = __tt.host(file, '.reference')
      const gapEl = __pg.stage(file).querySelector('.pg-row .pg-muted strong')
      const drift = () =>
        Math.round((host.getBoundingClientRect().top - ref.getBoundingClientRect().bottom) * 100) / 100
      const refH = () => Math.round(ref.getBoundingClientRect().height)
      const says = () => parseFloat(__pg.txt(gapEl))

      __pg.sec(file).scrollIntoView({ block: 'center' })
      await __pg.sleep(450)
      __pg.button(file, 'Reset').click()
      await __pg.sleep(400)

      const grow = async (times) => {
        for (let i = 0; i < times; i++) {
          __pg.button(file, 'Grow the reference').click()
          await __pg.sleep(200)
        }
        await __pg.sleep(500)
      }

      // Toggling the checkbox IS a re-render, which repositions — so the
      // baseline is taken after the toggle and the growth after the baseline.
      __pg.set(__tt.toggle(file, 'autoUpdate'), false)
      await __pg.sleep(500)
      const h0 = refH()
      const base0 = drift()
      await grow(2)
      const off = { drift: drift(), said: says(), h: refH() }

      __pg.button(file, 'Reset').click()
      await __pg.sleep(500)
      const restored = drift()

      __pg.set(__tt.toggle(file, 'autoUpdate'), true)
      await __pg.sleep(500)
      const base1 = drift()
      await grow(2)
      const on = { drift: drift(), said: says(), h: refH() }

      return {
        pass:
          Math.abs(base0) <= 1 && Math.abs(base1) <= 1 &&
          // The reference really got taller, both times, or there was nothing
          // for the observers to miss or catch.
          off.h - h0 >= 25 && on.h - h0 >= 25 &&
          // Unobserved: the host stays where the last render put it.
          off.drift <= -25 &&
          // Observed: welded, through a change Vue never heard about.
          Math.abs(on.drift) <= 1 &&
          // Shrinking back puts the anchor back, so the drift was the growth
          // and not a one-way ratchet.
          Math.abs(restored) <= 2 &&
          // The card's own readout is telling the reader the truth.
          Math.abs(off.said - off.drift) <= 1 && Math.abs(on.said - on.drift) <= 1,
        detail:
          `reference ${h0}px tall at rest · autoUpdate off: grew to ${off.h}px, ` +
          `drift ${off.drift}px (card says ${off.said}px) · reset → ${restored}px · ` +
          `autoUpdate on: baseline ${base1}px, grew to ${on.h}px, drift ${on.drift}px ` +
          `(card says ${on.said}px)`,
      }
    },
  },
  {
    demo: AUTO,
    // `autoUpdateSubtree` is a narrow tool and the card is the only place its
    // narrowness is visible: the MutationObserver is attached to the reference
    // ALONE, so appending to the reference is a `childList` mutation on the
    // observed node and appending inside a descendant is not. Both legs run in
    // ONE configuration — autoUpdate on, subtree off — so the discriminating
    // pair cannot be explained by anything else that changed between them.
    //
    // `ResizeObserver` cannot cover for it here either: it does not report
    // non-replaced inline elements at all, which is why the reference is one.
    name: 'card 08: with autoUpdate on but subtree off, growing the reference is caught and growing a descendant is not',
    fn: async () => {
      const file = '08-auto-update.vue'
      const host = __tt.host(file, '.pop')
      const ref = __tt.host(file, '.reference')
      const drift = () =>
        Math.round((host.getBoundingClientRect().top - ref.getBoundingClientRect().bottom) * 100) / 100
      const refH = () => Math.round(ref.getBoundingClientRect().height)

      __pg.sec(file).scrollIntoView({ block: 'center' })
      await __pg.sleep(450)
      __pg.set(__tt.toggle(file, 'autoUpdate'), true)
      await __pg.sleep(300)
      __pg.set(__tt.toggle(file, 'autoUpdateSubtree'), false)
      await __pg.sleep(400)
      __pg.button(file, 'Reset').click()
      await __pg.sleep(450)

      const grow = async (needle, times) => {
        for (let i = 0; i < times; i++) {
          __pg.button(file, needle).click()
          await __pg.sleep(200)
        }
        await __pg.sleep(500)
      }
      const reset = async () => {
        __pg.button(file, 'Reset').click()
        await __pg.sleep(500)
      }

      const rest = refH()
      const base = drift()

      await grow('Grow the reference', 2)
      const self = { drift: drift(), h: refH() }
      await reset()

      await grow('nested descendant', 2)
      const nestedOff = { drift: drift(), h: refH() }
      await reset()

      __pg.set(__tt.toggle(file, 'autoUpdateSubtree'), true)
      await __pg.sleep(500)
      await reset()
      const base2 = drift()
      await grow('nested descendant', 2)
      const nestedOn = { drift: drift(), h: refH() }

      return {
        pass:
          Math.abs(base) <= 1 && Math.abs(base2) <= 1 &&
          // Every leg really grew the reference, or "caught" and "missed" are
          // the same non-event.
          self.h - rest >= 25 && nestedOff.h - rest >= 25 && nestedOn.h - rest >= 25 &&
          // subtree off: a mutation ON the reference is seen…
          Math.abs(self.drift) <= 1 &&
          // …and the same growth one level down is not.
          nestedOff.drift <= -25 &&
          // subtree on: now it is.
          Math.abs(nestedOn.drift) <= 1,
        detail:
          `reference ${rest}px tall at rest, baselines ${base}px / ${base2}px · ` +
          `subtree off — grow the reference: ${self.h}px tall, drift ${self.drift}px · ` +
          `subtree off — grow a descendant: ${nestedOff.h}px tall, drift ${nestedOff.drift}px · ` +
          `subtree on — grow a descendant: ${nestedOn.h}px tall, drift ${nestedOn.drift}px`,
      }
    },
  },
  {
    demo: EVENTS,
    // `data-teleport-state` is only worth stamping if a consumer's transition
    // runs off it, so this reads the PAINTED opacity and scale rather than the
    // attribute that is supposed to cause them. The rest is the dormant
    // contract in full: every positioning signal cleared (the README ships
    // `[data-teleport-truncated]` and `[data-teleport-collapsed]` recipes, so a
    // signal left on a dormant host is consumer CSS styling an element the
    // directive has let go of), and the placement cache reset so re-enabling
    // reports `prev: (none)` again instead of staying silent.
    name: 'card 10: unticking `enabled` fades the host out and clears every positioning signal; re-ticking reports a fresh placement',
    fn: async () => {
      const file = '10-events-state.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      const enabled = __tt.toggle(file, 'enabled')

      __pg.set(enabled, true)
      await __pg.sleep(400)
      await __tt.park(trigger, 300)

      const read = () => ({
        state: pop.dataset.teleportState || null,
        side: pop.dataset.teleportPlacement || null,
        fit: pop.dataset.teleportFit || null,
        opacity: Math.round(parseFloat(getComputedStyle(pop).opacity) * 100) / 100,
        scale: __tt.scale(pop),
      })

      const open0 = read()
      const lines0 = __tt.logLines(file)

      __pg.set(enabled, false)
      await __pg.sleep(700)
      const closed = read()
      const linesClosed = __tt.logLines(file)

      __pg.set(enabled, true)
      await __pg.sleep(800)
      const open1 = read()
      const lines1 = __tt.logLines(file)

      return {
        pass:
          open0.state === 'open' && open0.side !== null && open0.fit !== null &&
          open0.opacity >= 0.98 && open0.scale >= 0.99 &&
          // The transition really ran, and every signal is gone.
          closed.state === 'closed' && closed.opacity <= 0.02 &&
          Math.abs(closed.scale - 0.94) <= 0.01 &&
          closed.side === null && closed.fit === null &&
          // Nothing is reported while dormant…
          linesClosed.length === lines0.length &&
          // …and re-enabling is a fresh transition, not a same-side no-op that
          // would leave the log untouched.
          open1.state === 'open' && open1.opacity >= 0.98 && open1.scale >= 0.99 &&
          lines1.length === lines0.length + 1 &&
          /^placement \(none\) →/.test(lines1[0]),
        detail:
          `open → state ${open0.state}/${open0.side}/${open0.fit}, opacity ${open0.opacity}, ` +
          `scale ${open0.scale} · ` +
          `disabled → state ${closed.state}/${closed.side}/${closed.fit}, opacity ${closed.opacity}, ` +
          `scale ${closed.scale} · ` +
          `re-enabled → state ${open1.state}, opacity ${open1.opacity}, scale ${open1.scale} · ` +
          `log ${lines0.length} → ${linesClosed.length} → ${lines1.length} line(s), ` +
          `newest "${lines1[0] ?? '(none)'}"`,
      }
    },
  },
  {
    demo: EVENTS,
    // "Only fires when the chosen side actually changes — so it converges, and
    // is safe to render." The card's own footgun note explains what the other
    // answer costs: `onPositioned` fires on every recalculation, a component
    // re-render IS a recalculation, and a callback that reported every tick
    // into the template would re-render its way into "Maximum recursive updates
    // exceeded". So the silence is the feature, and it is what is measured:
    // four scroll positions on one side must add zero lines, and the crossing
    // must add exactly one, naming both sides.
    name: 'card 10: onPlacementChange logs exactly one line per real side change, and nothing while the side holds',
    fn: async () => {
      const file = '10-events-state.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      __pg.set(__tt.toggle(file, 'enabled'), true)
      await __pg.sleep(400)

      const count = () => __tt.logLines(file).length
      const newest = () => __tt.logLines(file)[0] ?? ''

      await __tt.park(trigger, 250)
      const hostH = Math.round(pop.getBoundingClientRect().height)
      const refH = Math.round(trigger.getBoundingClientRect().height)
      const highSide = pop.dataset.teleportPlacement
      const start = count()

      // Four positions with hundreds of px of room below: the side cannot
      // legitimately change, so any new line is a callback firing on a
      // same-side reposition.
      const holds = []
      for (const y of [320, 250, 400, 260]) {
        await __tt.park(trigger, y)
        holds.push(pop.dataset.teleportPlacement)
      }
      const afterHold = count()

      // Now leave the popover half its own height of room below it, which it
      // cannot use, while the room above is the whole page.
      const low = Math.round(window.innerHeight - refH - hostH * 0.5)
      const landedLow = await __tt.park(trigger, low)
      const lowSide = pop.dataset.teleportPlacement
      const afterFlip = count()
      const flipLine = newest()

      const lowHolds = []
      for (const y of [low - 10, low, low - 6]) {
        await __tt.park(trigger, y)
        lowHolds.push(pop.dataset.teleportPlacement)
      }
      const afterLowHold = count()

      await __tt.park(trigger, 250)
      const backSide = pop.dataset.teleportPlacement
      const afterBack = count()
      const backLine = newest()

      return {
        pass:
          hostH > 20 && landedLow > window.innerHeight * 0.5 &&
          highSide === 'bottom' && holds.every((s) => s === 'bottom') &&
          lowSide === 'top' && lowHolds.every((s) => s === 'top') &&
          backSide === 'bottom' &&
          // Silence on the four same-side moves…
          afterHold === start && afterLowHold === afterFlip &&
          // …and exactly one line per crossing, naming both sides.
          afterFlip === start + 1 &&
          afterBack === start + 2 &&
          /^placement bottom → top/.test(flipLine) &&
          /^placement top → bottom/.test(backLine),
        detail:
          `viewport ${window.innerHeight}px, popover ${hostH}px, reference ${refH}px · ` +
          `high (250px down) → ${highSide}, 4 same-side moves → ${afterHold - start} new line(s) · ` +
          `low (${landedLow}px down, ${Math.round(hostH * 0.5)}px of room below) → ${lowSide}, ` +
          `${afterFlip - afterHold} new line(s): "${flipLine}" · ` +
          `3 more same-side moves → ${afterLowHold - afterFlip} new line(s) · ` +
          `back up → ${backSide}, ${afterBack - afterLowHold} new line(s): "${backLine}"`,
      }
    },
  },
  {
    demo: EVENTS,
    // `referenceHidden` and `hidden` are reported separately on purpose — the
    // first is the measurement, emitted even when you have opted out so a
    // consumer can drive a `v-if` from it; the second is what the library
    // actually did. The card prints both, so this reads the payload where the
    // reader reads it AND checks the host really went blank, because the pair
    // agreeing on a chip while the popover still hangs over the page is the
    // failure worth catching.
    //
    // Both directions: a hide that is never released leaves the host
    // permanently invisible, and nothing about scrolling one way can see that.
    name: 'card 10: scrolling the reference off the top blanks the host and flips both reported flags, and scrolling back restores it',
    fn: async () => {
      const file = '10-events-state.vue'
      const pop = __tt.host(file, '.pop')
      const trigger = __tt.trigger(file)
      __pg.set(__tt.toggle(file, 'enabled'), true)
      await __pg.sleep(400)

      const snap = async (target) => {
        const at = await __tt.park(trigger, target)
        await __pg.sleep(250)
        return {
          at,
          refTop: Math.round(trigger.getBoundingClientRect().top),
          chip: __tt.chipAt(file, 1),
          vis: getComputedStyle(pop).visibility,
          marked: pop.dataset.teleportHidden !== undefined,
        }
      }

      const onScreen = await snap(300)
      const offTop = await snap(-120)
      const backAgain = await snap(300)

      return {
        pass:
          // The premise, measured rather than assumed.
          offTop.refTop < -60 && onScreen.refTop > 200 &&
          onScreen.chip === 'referenceHidden false · hidden false' &&
          onScreen.vis === 'visible' && !onScreen.marked &&
          offTop.chip === 'referenceHidden true · hidden true' &&
          offTop.vis === 'hidden' && offTop.marked &&
          backAgain.chip === 'referenceHidden false · hidden false' &&
          backAgain.vis === 'visible' && !backAgain.marked,
        detail:
          [onScreen, offTop, backAgain]
            .map((s) => `reference at ${s.refTop}px → visibility ${s.vis}, ` +
              `data-teleport-hidden ${s.marked}, chip "${s.chip}"`)
            .join(' · '),
      }
    },
  },
]

/**
 * The sweep card 13's headline sentence promises, run at three window heights.
 *
 * TT-22 finding 8 was not "the card is wrong" — it was "the card is only right
 * on a short window". `maxHeight` defaults to 240, so the fit test never asks a
 * side for more than 240px; on a 900px-tall window both sides of a mid-page
 * reference have more than that, and the placement never moved across the
 * entire slider. The certifier measured 15/15 rows unchanged at 1280x900 and a
 * working demo at 1280x560 — a claim the reader could not reproduce on their
 * own screen, which is a false claim.
 *
 * The card now clips the space to a drawn `boundary` box, so this asserts the
 * stronger property: the SAME transition, at the same word count, at every
 * window height. Needs the real viewport, hence a native check.
 */
const VIEWPORTS = [
  { name: '1280x900 — the one it failed at', width: 1280, height: 900 },
  { name: '1280x560', width: 1280, height: 560 },
  { name: '1280x1400', width: 1280, height: 1400 },
]

const SWEEP = `(async () => {
  const file = '13-content-measurement.vue'
  const tip = __tt.host(file, '.tip')
  __pg.set(__tt.select(file, 'placement'), 'top')
  __pg.set(__tt.select(file, 'closed state'), 'opacity')
  await __pg.sleep(250)
  // Read where the reader reads it: the card scrolled into view, nothing parked
  // at a hand-picked offset.
  __pg.sec(file).scrollIntoView({ block: 'center' })
  await __pg.sleep(500)
  const seen = []
  for (const n of [3, 8, 16, 28, 40, 60]) {
    __pg.set(__tt.slider(file, 'content'), n)
    await __pg.sleep(300)
    seen.push({ n, side: tip.dataset.teleportPlacement, fit: tip.dataset.teleportFit })
  }
  return seen
})()`

/**
 * Card 03's mobile branch, which needs a real narrow viewport.
 *
 * The full-bleed rule is ONE decision with two halves — a real `width: 100vw`
 * and a `left` pinned to the viewport's edge — and it used to be re-derived per
 * site with different terms. That is how an explicit `maxWidth` could override
 * the width half while the anchor half kept pinning the host to the screen
 * edge: a 160px menu stranded at x=0 with its trigger at x=42. Both halves are
 * measured below, at 500px and again at 1280px.
 */
const FULL_BLEED = `(async () => {
  const file = '03-sizing.vue'
  const panel = __tt.host(file, '.panel')
  const trigger = __tt.trigger(file, '.pg-btn')
  __pg.set(__tt.toggle(file, 'matchWidth'), false)
  __pg.set(__tt.toggle(file, 'maxWidth'), false)
  __pg.set(__tt.slider(file, 'widthMultiplier'), 1.5)
  __pg.sec(file).scrollIntoView({ block: 'center' })
  await __pg.sleep(700)
  const read = () => {
    const p = __tt.box(panel)
    const t = __tt.box(trigger)
    return { w: p.width, left: p.left, refLeft: t.left, refW: t.width, vw: window.innerWidth }
  }
  const plain = read()
  __pg.set(__tt.toggle(file, 'maxWidth'), true)
  await __pg.sleep(300)
  __pg.set(__pg.stage(file).querySelector('input.pg-input'), 160)
  await __pg.sleep(550)
  const capped = read()
  __pg.set(__tt.toggle(file, 'maxWidth'), false)
  await __pg.sleep(300)
  return { plain, capped }
})()`

const NATIVE_CHECKS = [
  {
    demo: SIZING,
    name: 'card 03: below 768px the panel becomes a real full-width sheet, and an explicit maxWidth opts out of the anchor as well as the width',
    async run({ page, cdp, sessionId }) {
      let mobile
      let desktop
      try {
        await page.setViewport(500, 900)
        await new Promise((r) => setTimeout(r, 800))
        mobile = await page.evaluate(FULL_BLEED)
        await page.setViewport(1280, 900)
        await new Promise((r) => setTimeout(r, 800))
        desktop = await page.evaluate(FULL_BLEED)
      } finally {
        await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId).catch(() => {})
      }

      return {
        pass:
          // The reference is nowhere near the screen's left edge, so a host at
          // x=0 is a decision and not a coincidence.
          mobile.plain.refLeft > 8 &&
          // Full bleed: pinned to the viewport edge AND as wide as the viewport.
          // The bug this replaces wrote only `max-width: 100vw` — a cap — which
          // left a ~230px menu at x=0 while its trigger sat at x=42.
          mobile.plain.left <= 1 &&
          mobile.plain.w >= mobile.plain.vw - 1 &&
          // An explicit maxWidth opts out of BOTH halves: the width it asked
          // for, back at the reference's own left edge.
          Math.abs(mobile.capped.w - 160) <= 1.5 &&
          Math.abs(mobile.capped.left - mobile.capped.refLeft) <= 1 &&
          // Above the breakpoint nothing full-bleeds at all.
          Math.abs(desktop.plain.left - desktop.plain.refLeft) <= 1 &&
          desktop.plain.w <= desktop.plain.refW * 1.5 + 1 &&
          desktop.plain.w < desktop.plain.vw / 2,
        detail:
          `500px viewport (${mobile.plain.vw}px inner), reference at x=${mobile.plain.refLeft} · ` +
          `everything off → panel ${mobile.plain.w}px wide at x=${mobile.plain.left} · ` +
          `maxWidth 160 → ${mobile.capped.w}px at x=${mobile.capped.left} ` +
          `(reference x=${mobile.capped.refLeft}) · ` +
          `1280px viewport → panel ${desktop.plain.w}px at x=${desktop.plain.left}, ` +
          `reference ${desktop.plain.refW}px at x=${desktop.plain.refLeft}`,
      }
    },
  },
  {
    demo: TIP,
    name: "card 13: the content slider moves the placement at every window height, not just a short one",
    async run({ page, cdp, sessionId }) {
      const runs = []
      try {
        for (const vp of VIEWPORTS) {
          await page.setViewport(vp.width, vp.height)
          await new Promise((r) => setTimeout(r, 600))
          runs.push({ vp, seen: await page.evaluate(SWEEP) })
        }
      } finally {
        await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId).catch(() => {})
      }

      const verdicts = runs.map(({ vp, seen }) => {
        const sides = seen.map((s) => s.side)
        const changes = sides.filter((s, i) => i > 0 && s !== sides[i - 1]).length
        return {
          vp: vp.name,
          sides,
          // The transition word count — the number the three runs must agree on.
          at: seen.find((s, i) => i > 0 && s.side !== seen[i - 1].side)?.n ?? null,
          ok: sides[0] === 'top' && sides[sides.length - 1] === 'bottom' && changes === 1,
          line: seen.map((s) => `${s.n}w:${s.side}`).join(' '),
        }
      })
      const flipPoints = new Set(verdicts.map((v) => v.at))

      return {
        pass: verdicts.every((v) => v.ok) && flipPoints.size === 1 && !flipPoints.has(null),
        detail: verdicts.map((v) => `${v.vp} → ${v.line}${v.ok ? '' : '  ← NO MOVE'}`).join(' · '),
      }
    },
  },
]

export default {
  library: 'v-teleport-to',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
