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
}
'ready'
`

const TIP = '13-content-measurement.vue'
const ORDER = '14-vshow-order.vue'
const FLIP = '02-placement-flip.vue'
const COMPOSABLE = '11-composable.vue'
const OVERFLOW = '05-overflow.vue'
const VIRTUAL = '09-virtual-reference.vue'

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

const NATIVE_CHECKS = [
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
