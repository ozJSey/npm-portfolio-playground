/**
 * Interaction checks for the `v-fit-children` tab.
 *
 * The layout engine is not what these are about. FIT-1 drove the published
 * 2.2.0 artifact through 2,193 measurements and found zero half-clipped
 * children — the row it computes is right. What was wrong was everything
 * around it: the event that TELLS you about the row.
 *
 *   F1          a first pass that hid EVERY child dispatched nothing, because
 *               the visible set started empty and an empty fit read as "no
 *               change". An over-full row rendered with no "+N more" badge at
 *               exactly the widths where the badge is the only affordance left.
 *   F2          `isOverflowing` went stale on the resize path, because the
 *               attribute was written above the early return and the event
 *               below it. The two outputs of one pass contradicted each other.
 *   quality #1  the gate keyed on the visible set plus the data array's
 *               reference identity, while every field of the payload is about
 *               the HIDDEN set — so `items.push()` / `items.pop()`, the
 *               dominant Vue idiom, moved neither half of it.
 *
 * All three are invisible to `pnpm geometry`, which measures children spilling
 * PAST the host and is blind to a row that hid too much: 0 of 9 visible reports
 * `overflowPx 0` and passes. They are invisible to `pnpm smoke`, which only
 * proves the card mounted. And the unit suite reached them only after the
 * resize path was written into it — F2's existing test covered the MOUNT pass,
 * where the dispatch happens whatever the gate says.
 *
 * So every check below reads the payload a real listener received, out of the
 * card's own rendered output, in a real browser. Each one is negative-
 * controlled: a sweep asserts it saw both answers, and a "did it fire" check is
 * paired with one proving the counter is not simply always climbing.
 *
 * Negative control for the whole file — run it against the published artifact:
 *
 *   PLAYGROUND_UNALIAS=v-fit-children pnpm interactions
 *
 * 2.2.0 is what `node_modules` holds, and the five F1/F2/quality-1 checks fail
 * there while the rest pass.
 *
 * FIT-2's two checks (card 12) have their own control, against the artifact that
 * is on npm right now rather than the one before it:
 *
 *   pnpm interactions:dist                  # dist/ is byte-identical to 2.3.0
 *
 * Both fail there — the row comes back holding 3 of 9 chips with
 * `data-v-fit-state="fits"` written over it.
 */

const PRELUDE = `
window.__fit = {
  /** The directive's host — the one element carrying the state attribute. */
  host(file) {
    const h = __pg.stage(file).querySelector('[data-v-fit-state]')
    if (!h) throw new Error('no v-fit-children host on ' + file)
    return h
  },
  state(file) { return this.host(file).getAttribute('data-v-fit-state') },
  /** Text of the children still on screen, in order. */
  visible(file) {
    return [...this.host(file).children]
      .filter((c) => !c.hasAttribute('data-v-fit-hidden'))
      .map((c) => __pg.txt(c))
  },
  hiddenCount(file) {
    return [...this.host(file).children].filter((c) => c.hasAttribute('data-v-fit-hidden')).length
  },
  /** Every child's text, hidden or not — used to spot a payload naming rows that left. */
  allText(file) {
    return [...this.host(file).children].map((c) => __pg.txt(c))
  },
  /**
   * An element's content box — where \`overflow: hidden\` actually clips. Border
   * and padding are zero on most hosts here; reading them costs the same as
   * assuming they are.
   */
  edges(el) {
    const style = window.getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const px = (value) => parseFloat(value) || 0
    return {
      left: rect.left + px(style.borderLeftWidth) + px(style.paddingLeft),
      right: rect.right - px(style.borderRightWidth) - px(style.paddingRight),
    }
  },
  /**
   * How far the visible run spills past that edge, in px — a half-clipped chip,
   * which is the one outcome the library exists to prevent and the symptom
   * every "the row never noticed" path fails with. Sub-pixel by construction:
   * the fit admits a child that misses by up to EPSILON (0.5px), so only a
   * reading above 1px is a real clip.
   */
  spill(file) {
    const host = this.host(file)
    const edge = this.edges(host).right
    return [...host.children]
      .filter((c) => !c.hasAttribute('data-v-fit-hidden') && c.style.display !== 'none')
      .reduce((worst, c) => Math.max(worst, c.getBoundingClientRect().right - edge), 0)
  },
  /** The card's <pre>, parsed — i.e. the payload a listener actually received. */
  payload(file) {
    const pre = __pg.stage(file).querySelector('pre')
    if (!pre) throw new Error('no payload log on ' + file)
    const text = pre.textContent || ''
    const field = (name) => {
      const m = text.match(new RegExp(name + ':\\\\s*(.*)'))
      return m ? m[1].trim() : null
    }
    const list = (name) => {
      const raw = field(name)
      if (raw === null) return null
      const inner = raw.replace(/^\\[|\\]$/g, '').trim()
      return inner ? inner.split(',').map((s) => s.trim()) : []
    }
    return {
      raw: text.replace(/\\s+/g, ' ').trim(),
      dispatched: Number(field('events dispatched')),
      isOverflowing: field('isOverflowing') === 'true',
      hiddenChildrenCount: Number(field('hiddenChildrenCount')),
      hiddenIndices: list('hiddenIndices'),
      hiddenData: list('hiddenData'),
      fired: !/no event has been dispatched/.test(text),
    }
  },
  /** Move a slider and let the observers settle. */
  async width(file, px, settle = 520) {
    const slider = __pg.stage(file).querySelector('input[type=range]')
    if (!slider) throw new Error('no width slider on ' + file)
    __pg.set(slider, px)
    await __pg.sleep(settle)
  },
}
'ready'
`

export default {
  library: 'v-fit-children',
  prelude: PRELUDE,
  checks: [
    // ── The consumer's view: a badge rendered from the event ──────────
    {
      demo: '01-basic.vue',
      name: 'the +N badge names exactly the chips that are hidden, at every width',
      fn: async () => {
        const file = '01-basic.vue'
        const rows = []
        for (const px of [720, 560, 400, 300, 240, 180, 140]) {
          await __fit.width(file, px)
          const badge = __pg.stage(file).querySelector('.more')
          const shown = badge ? Number(__pg.txt(badge).replace(/\D/g, '')) : 0
          rows.push({ px, shown, hidden: __fit.hiddenCount(file) })
        }
        const wrong = rows.filter((r) => r.shown !== r.hidden)
        // Negative control: a sweep that never hid anything would agree
        // trivially, and so would one that never showed anything.
        const sawBoth = rows.some((r) => r.hidden === 0) && rows.some((r) => r.hidden > 0)
        return {
          pass: wrong.length === 0 && sawBoth,
          detail: `${rows.map((r) => r.px + 'px badge+' + r.shown + '/hidden' + r.hidden).join(' ')}${sawBoth ? '' : ' — SWEEP NEVER CHANGED'}`,
        }
      },
    },

    // ── The option surface, driven rather than looked at ──────────────
    //
    // `pnpm geometry` already sweeps every slider on this tab and measures the
    // row, so none of the checks below repeat that. What it cannot do is TYPE
    // into the pinned input, tick the pin off, move the `gap` slider (it has no
    // idea what a gap is supposed to do), or pick a name out of the overflow
    // menu — and those four controls are the whole of what cards 2–5 document.

    {
      demo: '02-data-mapping.vue',
      name: 'hiddenData and hiddenIndices name exactly the chips that left the row, at every width',
      fn: async () => {
        // The card prints both halves of the payload. `hiddenIndices` counts DOM
        // positions and `hiddenData` indexes the consumer's array; on a straight
        // `v-for` like this one they have to agree with each other AND with the
        // chips actually carrying `data-v-fit-hidden`. A mapping that skewed by
        // one would hand a "+N" menu the wrong people while the row looked fine.
        const file = '02-data-mapping.vue'
        const rows = []
        for (const px of [720, 620, 520, 440, 360, 300]) {
          await __fit.width(file, px)
          const kids = [...__fit.host(file).children]
          const domIdx = kids.map((c, i) => (c.hasAttribute('data-v-fit-hidden') ? i : -1)).filter((i) => i >= 0)
          const domNames = kids.filter((c) => c.hasAttribute('data-v-fit-hidden')).map((c) => __pg.txt(c))
          const kv = __pg.txt(__pg.stage(file).querySelector('.pg-kv'))
          const list = (re) => {
            const m = kv.match(re)
            if (!m) return null
            const inner = m[1].trim()
            return inner ? inner.split(',').map((s) => s.trim()) : []
          }
          const gotIdx = list(/hiddenIndices:\s*\[([^\]]*)\]/)
          const gotData = list(/hiddenData:\s*\[([^\]]*)\]/)
          const trigger = __pg.stage(file).querySelector('.overflow-trigger')
          const badge = trigger ? Number((__pg.txt(trigger).match(/\+(\d+)/) || [])[1]) : 0
          rows.push({
            px,
            hidden: domIdx.length,
            ok:
              !!gotIdx &&
              !!gotData &&
              gotIdx.join('|') === domIdx.join('|') &&
              gotData.join('|') === domNames.join('|') &&
              badge === domIdx.length &&
              !!trigger === (domIdx.length > 0),
            dom: `[${domIdx.join(',')}]=[${domNames.join(',')}]`,
            got: `[${(gotIdx || []).join(',')}]=[${(gotData || []).join(',')}] badge+${badge}`,
          })
        }
        const wrong = rows.filter((r) => !r.ok)
        // Negative control. Comparing two empty lists agrees for free, and a row
        // frozen at one answer would agree at every width for the same reason.
        const reached = rows.some((r) => r.hidden > 0)
        const moved = new Set(rows.map((r) => r.hidden)).size > 1
        return {
          pass: wrong.length === 0 && reached && moved,
          detail: `${rows.map((r) => r.px + 'px hidden' + r.hidden).join(' ')}${wrong.length ? ' — MISMATCH at ' + wrong.map((r) => r.px + 'px DOM' + r.dom + ' vs card ' + r.got).join('; ') : ''}${reached ? '' : ' — NOTHING WAS EVER HIDDEN'}${moved ? '' : ' — the hidden count never moved across the sweep'}`,
        }
      },
    },
    {
      demo: '02-data-mapping.vue',
      name: 'the +N trigger resizes itself and the row hands the width straight over (sibling observation)',
      fn: async () => {
        // The trigger is a SIBLING of the host. Picking a long name off the menu
        // widens it — and the host's own box, the frame's box and the child set
        // are all untouched, so a ResizeObserver on the host, the container or
        // the parent sees nothing happen. Only watching every sibling does.
        const file = '02-data-mapping.vue'
        await __fit.width(file, 560)
        const stage = __pg.stage(file)
        const trigger = stage.querySelector('.overflow-trigger')
        if (!trigger) return { pass: false, detail: 'no +N trigger at 560px — nothing was hidden, so no sibling ever resizes' }

        const nameOn = (el) => __pg.txt(el).split('·').slice(1).join('·').trim()
        const width = () => Math.round(trigger.getBoundingClientRect().width)
        const before = { w: width(), hidden: __fit.hiddenCount(file), run: __fit.visible(file) }

        trigger.click()
        await __pg.sleep(350)
        const inStage = [...stage.querySelectorAll('.overflow-item')]
        const pool = inStage.length ? inStage : [...document.querySelectorAll('.overflow-item')]
        if (!pool.length) return { pass: false, detail: `the menu rendered no items for ${before.hidden} hidden chips` }
        // The longest hidden name is the one that costs the row the most width.
        const pick = pool.reduce((a, b) => (__pg.txt(b).length > __pg.txt(a).length ? b : a))
        const picked = __pg.txt(pick)
        pick.click()
        await __pg.sleep(1200)

        const after = { w: width(), hidden: __fit.hiddenCount(file), run: __fit.visible(file) }
        const spill = Math.round(__fit.spill(file))
        return {
          pass:
            nameOn(trigger) === picked &&
            after.w > before.w + 20 &&
            after.hidden > before.hidden &&
            spill <= 1,
          detail: `picked "${picked}" (label now "${nameOn(trigger)}"): trigger ${before.w}px -> ${after.w}px, hidden ${before.hidden} -> ${after.hidden}, run [${before.run.join(',')}] -> [${after.run.join(',')}], worst spill past the clip edge ${spill}px`,
        }
      },
    },
    {
      demo: '02-data-mapping.vue',
      name: 'the trigger never names a chip that is on screen, and the non-monotonic pick settles',
      fn: async () => {
        // Picking the SHORTEST hidden name shrinks the trigger, which hands the
        // row width back — the non-monotonic direction, and the one that
        // oscillates if the feedback is handled naively, because the chip that
        // comes back can be the one the label is naming. Two things have to be
        // true once it stops: it stopped, and the name on the trigger belongs to
        // a chip that is genuinely off screen. A payload that went stale
        // anywhere in that loop labels the button with a chip the user can
        // see — the "+3 more" still naming rows that never left.
        const file = '02-data-mapping.vue'
        await __fit.width(file, 480)
        const stage = __pg.stage(file)
        const trigger = stage.querySelector('.overflow-trigger')
        if (!trigger) return { pass: false, detail: 'no +N trigger at 480px — nothing was hidden' }
        trigger.click()
        await __pg.sleep(350)
        const inStage = [...stage.querySelectorAll('.overflow-item')]
        const pool = inStage.length ? inStage : [...document.querySelectorAll('.overflow-item')]
        if (!pool.length) return { pass: false, detail: 'the menu rendered no items' }
        const pick = pool.reduce((a, b) => (__pg.txt(b).length < __pg.txt(a).length ? b : a))
        const picked = __pg.txt(pick)
        pick.click()
        await __pg.sleep(1400)

        const read = () => {
          const t = stage.querySelector('.overflow-trigger')
          const kids = [...__fit.host(file).children]
          return {
            label: t ? __pg.txt(t).split('·').slice(1).join('·').trim() : null,
            count: t ? Number((__pg.txt(t).match(/\+(\d+)/) || [])[1]) : 0,
            hidden: kids.filter((c) => c.hasAttribute('data-v-fit-hidden')).map((c) => __pg.txt(c)),
            run: __fit.visible(file).join('|'),
          }
        }
        const first = read()
        await __pg.sleep(1200)
        const second = read()

        // …and then widen the row until the person you picked is back on
        // screen. The card falls back to another hidden name on its own, so a
        // `hidden` array that did not re-report after the resize leaves the
        // button labelled with someone the user is looking at.
        await __fit.width(file, 720)
        await __pg.sleep(600)
        const wide = read()

        const settled =
          first.run === second.run && first.label === second.label && first.count === second.count
        const honest = (r) =>
          r.label === null ? r.hidden.length === 0 : r.hidden.includes(r.label) && r.count === r.hidden.length
        const cameBack = !wide.hidden.includes(picked) && wide.run.split('|').includes(picked)
        const spill = Math.round(__fit.spill(file))
        return {
          pass: settled && honest(second) && cameBack && honest(wide) && spill <= 1,
          detail: `picked "${picked}": settled at 480px run [${second.run}] label "${second.label}" +${second.count}, hidden [${second.hidden.join(',')}]; at 720px label "${wide.label}" +${wide.count}, hidden [${wide.hidden.join(',')}], spill ${spill}px${settled ? '' : ` — STILL MOVING: [${first.run}] "${first.label}" -> [${second.run}] "${second.label}"`}${honest(second) && honest(wide) ? '' : ' — THE TRIGGER NAMES A CHIP THAT IS ON SCREEN'}${cameBack ? '' : ` — "${picked}" never came back at 720px`}`,
        }
      },
    },

    {
      demo: '03-keep-visible.vue',
      name: 'keepVisibleEl: the input being typed into is never the thing that vanishes — chips drop instead',
      fn: async () => {
        // `keepVisibleEl` points at the input, which is a DESCENDANT of the
        // immediate child, so this also exercises the walk up to the child that
        // contains it. Typing is the only way to reach it: the element pushing
        // the row over is the element the user is interacting with, and nothing
        // that drives sliders can produce that.
        const file = '03-keep-visible.vue'
        await __fit.width(file, 560)
        const stage = __pg.stage(file)
        const box = stage.querySelector('input[type=checkbox]')
        const input = stage.querySelector('input.pg-input')
        const star = stage.querySelector('[data-v-fit-keep]')
        if (!box || !input || !star) return { pass: false, detail: 'card is missing the checkbox, the token input or the pinned chip' }
        __pg.set(box, true)
        await __pg.sleep(600)
        const wrap = [...__fit.host(file).children].find((c) => c.contains(input))

        const rows = []
        for (const n of [2, 10, 18, 26, 34]) {
          __pg.set(input, 'x'.repeat(n))
          await __pg.sleep(800)
          rows.push({
            n,
            inputPx: Math.round(input.getBoundingClientRect().width),
            hidden: __fit.hiddenCount(file),
            inputGone: wrap.hasAttribute('data-v-fit-hidden') || input.getBoundingClientRect().width === 0,
            starGone: star.hasAttribute('data-v-fit-hidden'),
          })
        }
        const lost = rows.filter((r) => r.inputGone || r.starGone)
        // Both controls matter: the input has to have actually grown, and the
        // row has to have actually run out of room. Without them "it never
        // vanished" is true of a card that did nothing at all.
        const grew = rows[rows.length - 1].inputPx > rows[0].inputPx + 40
        const squeezed = rows[0].hidden === 0 && rows[rows.length - 1].hidden > 0
        return {
          pass: lost.length === 0 && grew && squeezed,
          detail: `${rows.map((r) => r.n + 'ch input' + r.inputPx + 'px hidden' + r.hidden + (r.inputGone ? ' INPUT VANISHED' : '') + (r.starGone ? ' STAR VANISHED' : '')).join(' | ')}${grew ? '' : ' — the input never grew'}${squeezed ? '' : ' — the row was never pushed from fitting to overflowing'}`,
        }
      },
    },
    {
      demo: '03-keep-visible.vue',
      name: 'control: unpinned, the same token hides the input mid-word — and ticking the box brings it back',
      fn: async () => {
        // The negative control for the check above, at the identical width and
        // token length: with `keepVisibleEl` gone the row hides the input and
        // keeps every chip, which is what proves "the input survived" was a
        // decision and not just slack in the row. The attribute-pinned chip is
        // held throughout — the two ways to pin are independent (FIT-1 F3).
        const file = '03-keep-visible.vue'
        await __fit.width(file, 560)
        const stage = __pg.stage(file)
        const box = stage.querySelector('input[type=checkbox]')
        const input = stage.querySelector('input.pg-input')
        const star = stage.querySelector('[data-v-fit-keep]')
        if (!box || !input || !star) return { pass: false, detail: 'card is missing the checkbox, the token input or the pinned chip' }
        const wrap = [...__fit.host(file).children].find((c) => c.contains(input))
        const chipsHidden = () =>
          [...__fit.host(file).children].filter(
            (c) => c !== wrap && !c.hasAttribute('data-v-fit-keep') && c.hasAttribute('data-v-fit-hidden'),
          ).length

        __pg.set(box, false)
        await __pg.sleep(500)
        __pg.set(input, 'x'.repeat(34))
        await __pg.sleep(1100)
        const off = {
          wrapHidden: wrap.hasAttribute('data-v-fit-hidden'),
          inputPx: Math.round(input.getBoundingClientRect().width),
          starHidden: star.hasAttribute('data-v-fit-hidden'),
          chips: chipsHidden(),
          state: __fit.state(file),
        }

        __pg.set(box, true)
        await __pg.sleep(1100)
        const on = {
          wrapHidden: wrap.hasAttribute('data-v-fit-hidden'),
          inputPx: Math.round(input.getBoundingClientRect().width),
          starHidden: star.hasAttribute('data-v-fit-hidden'),
          chips: chipsHidden(),
          state: __fit.state(file),
        }

        return {
          pass:
            off.wrapHidden &&
            off.inputPx === 0 &&
            off.chips === 0 &&
            !off.starHidden &&
            off.state === 'overflowing' &&
            !on.wrapHidden &&
            on.inputPx > 0 &&
            on.chips > 0 &&
            !on.starHidden,
          detail: `unpinned: input ${off.inputPx}px ${off.wrapHidden ? 'hidden' : 'STILL SHOWN'}, ${off.chips} chip(s) hidden, star ${off.starHidden ? 'HIDDEN' : 'held'}, state=${off.state} | re-pinned: input ${on.inputPx}px ${on.wrapHidden ? 'STILL HIDDEN' : 'back'}, ${on.chips} chip(s) hidden, star ${on.starHidden ? 'HIDDEN' : 'held'}, state=${on.state}`,
        }
      },
    },
    {
      demo: '03-keep-visible.vue',
      name: 'a pinned child is held wherever it sits — at 240px only the star and the input are left',
      fn: async () => {
        // The star sits at DOM index 4 of 6, with four ordinary chips ahead of
        // it. Holding it means the visible set is NOT the leading run any more,
        // which is the case a walk that stops at the first child that does not
        // fit gets wrong: it would drop the star and the input along with
        // everything after the break. At 240px all four chips ahead of it are
        // gone and the two pinned children are the whole row.
        const file = '03-keep-visible.vue'
        const stage = __pg.stage(file)
        __pg.set(stage.querySelector('input[type=checkbox]'), true)
        await __pg.sleep(400)
        const input = stage.querySelector('input.pg-input')
        const star = stage.querySelector('[data-v-fit-keep]')
        const wrap = [...__fit.host(file).children].find((c) => c.contains(input))
        const starIndex = [...__fit.host(file).children].indexOf(star)

        const rows = []
        for (const px of [700, 520, 420, 340, 280, 240]) {
          await __fit.width(file, px, 420)
          const kids = [...__fit.host(file).children]
          const hiddenBefore = kids
            .slice(0, starIndex)
            .filter((c) => c.hasAttribute('data-v-fit-hidden')).length
          rows.push({
            px,
            hidden: __fit.hiddenCount(file),
            hiddenBeforeStar: hiddenBefore,
            starGone: star.hasAttribute('data-v-fit-hidden'),
            inputGone: wrap.hasAttribute('data-v-fit-hidden'),
            state: __fit.state(file),
          })
        }
        const lost = rows.filter((r) => r.starGone || r.inputGone)
        const contradiction = rows.filter((r) => r.hidden > 0 && r.state !== 'overflowing')
        const narrowest = rows[rows.length - 1]
        // Negative control: a sweep where the star was never preceded by a
        // hidden child never reached the out-of-order case at all.
        const outOfOrder = rows.some((r) => r.hiddenBeforeStar > 0)
        const startedClean = rows[0].hidden === 0
        return {
          pass:
            lost.length === 0 &&
            contradiction.length === 0 &&
            outOfOrder &&
            startedClean &&
            narrowest.hiddenBeforeStar === starIndex,
          detail: `${rows.map((r) => r.px + 'px hidden' + r.hidden + '(' + r.hiddenBeforeStar + ' before the star)/' + r.state + (r.starGone ? ' STAR GONE' : '') + (r.inputGone ? ' INPUT GONE' : '')).join(' ')}${outOfOrder ? '' : ' — no chip was EVER hidden ahead of the star'}${startedClean ? '' : ' — the row was already overflowing at 700px'}${narrowest.hiddenBeforeStar === starIndex ? '' : ` — at 240px only ${narrowest.hiddenBeforeStar} of ${starIndex} plain chips were hidden`}`,
        }
      },
    },

    {
      demo: '04-gap-and-container.vue',
      name: 'the gap option is a FLOOR over the measured 12px margin: 0 and 6 change nothing, 40 drops chips',
      fn: async () => {
        // Spacing on this card comes from `margin-right: 12px`, and it is
        // measured off the laid-out positions — so the option can only ever
        // raise it. Used as a REPLACEMENT instead, gap 0 would under-count 12px
        // per chip and let one more through that does not fit, which is a chip
        // rendered clipped at the host's edge.
        const file = '04-gap-and-container.vue'
        const stage = __pg.stage(file)
        await __fit.width(file, 520)
        const gapSlider = __pg.label(file, 'gap option')?.querySelector('input[type=range]')
        if (!gapSlider) return { pass: false, detail: 'no gap slider on the card' }
        const badge = () => {
          const b = stage.querySelector('.more')
          return b ? Number(__pg.txt(b).replace(/\D/g, '')) : 0
        }

        const rows = []
        for (const g of [12, 0, 6, 12, 20, 30, 40]) {
          __pg.set(gapSlider, g)
          await __pg.sleep(700)
          rows.push({
            g,
            run: __fit.visible(file).join('|'),
            n: __fit.visible(file).length,
            hidden: __fit.hiddenCount(file),
            badge: badge(),
            spill: Math.round(__fit.spill(file)),
          })
        }

        const floor = rows.slice(0, 4) // 12, 0, 6, 12 — none may differ
        const floorHolds = floor.every((r) => r.run === floor[0].run)
        const rising = rows.slice(3) // 12, 20, 30, 40
        const monotone = rising.every((r, i) => i === 0 || r.n <= rising[i - 1].n)
        const dropped = rising[rising.length - 1].n < floor[0].n
        const badgeOk = rows.every((r) => r.badge === r.hidden)
        const clipped = rows.filter((r) => r.spill > 1)
        // Negative control: with nothing hidden at gap 12 the floor could not
        // have shown, because a smaller gap would have had nothing to admit.
        const pressured = floor[0].hidden > 0 && floor[0].n > 1
        return {
          pass: floorHolds && monotone && dropped && badgeOk && clipped.length === 0 && pressured,
          detail: `${rows.map((r) => 'gap' + r.g + ':' + r.n + 'visible/+' + r.badge).join(' ')}${floorHolds ? '' : ' — THE FLOOR LEAKED: gap12 [' + floor[0].run + '] vs gap0 [' + floor[1].run + '] vs gap6 [' + floor[2].run + ']'}${monotone ? '' : ' — raising the gap brought a chip BACK'}${dropped ? '' : ' — gap 40 dropped nothing'}${badgeOk ? '' : ' — the +N badge disagrees with the DOM'}${clipped.length ? ' — CLIPPED at gap ' + clipped.map((r) => r.g + '(' + r.spill + 'px)').join(',') : ''}${pressured ? '' : ' — nothing was hidden at gap 12, so the floor was never tested'}`,
        }
      },
    },
    {
      demo: '04-gap-and-container.vue',
      name: 'the reserved 56px keeps the +N badge inside the outer box, with no chip clipped',
      fn: async () => {
        // `widthRestrictingContainer` is the ancestor `.outer`; the badge is a
        // sibling inside the padded host, and `offsetNeededInPx: 56` is what
        // holds room for it. If the reserve or the min(host, container) went
        // wrong the badge would be pushed past the indigo box, or the last chip
        // would be half-eaten by the host's own `overflow: hidden`.
        const file = '04-gap-and-container.vue'
        const stage = __pg.stage(file)
        const outer = stage.querySelector('.outer')
        if (!outer) return { pass: false, detail: 'no .outer container on the card' }
        const rows = []
        for (const px of [720, 620, 520, 440, 360, 280, 220]) {
          await __fit.width(file, px, 420)
          const host = __fit.host(file)
          const shown = [...host.children].filter((c) => !c.hasAttribute('data-v-fit-hidden'))
          const lastRight = shown.length
            ? Math.max(...shown.map((c) => c.getBoundingClientRect().right))
            : __fit.edges(host).left
          const b = stage.querySelector('.more')
          rows.push({
            px,
            visible: shown.length,
            hidden: __fit.hiddenCount(file),
            badge: b ? Number(__pg.txt(b).replace(/\D/g, '')) : 0,
            spill: Math.round(__fit.spill(file)),
            overlap: b ? Math.round(lastRight - b.getBoundingClientRect().left) : 0,
            outside: b ? Math.round(b.getBoundingClientRect().right - __fit.edges(outer).right) : 0,
          })
        }
        const bad = rows.filter((r) => r.spill > 1 || r.overlap > 1 || r.outside > 1 || r.badge !== r.hidden)
        const sawBoth = rows.some((r) => r.hidden === 0) && rows.some((r) => r.hidden > 0)
        return {
          pass: bad.length === 0 && sawBoth,
          detail: `${rows.map((r) => r.px + 'px ' + r.visible + 'visible/+' + r.badge + ' spill' + r.spill + ' overlap' + r.overlap + ' outside' + r.outside).join(' ')}${sawBoth ? '' : ' — SWEEP NEVER CHANGED'}${bad.length ? ' — BAD at ' + bad.map((r) => r.px + 'px').join(',') : ''}`,
        }
      },
    },

    {
      demo: '05-inline-badge.vue',
      name: 'narrowing all the way down and back brings every chip home, with the badge tracking the DOM at each step',
      fn: async () => {
        // A `flex: 1` host with a badge pinned beside it: every chip the row
        // hides makes the badge appear or grow, which takes width off the host
        // again. A record of that feedback (`oversizedRuns`) that is not
        // retracted when the row widens freezes it at the narrowest run it ever
        // chose — FIT-2, on the parent-resize path rather than card 12's host
        // one. Coming home to 6 of 6 is the symptom's exact negation.
        //
        // What this deliberately does NOT assert is the same run at every
        // width in both directions. A badge that costs width makes two stable
        // rows possible over a band: "nothing hidden, no badge" and "one
        // hidden, badge present, host narrower by the badge". Card 4 shows the
        // band at its widest — `offsetNeededInPx: 56` for an 18px sibling badge
        // puts 8 chips on screen at 520px coming down from 720, and 6 chips
        // plus "+2" at the same 520px coming up from 480. Both are correct
        // against the reserve the card asked for, and neither is reachable from
        // the other, because the directive measures the host it HAS and cannot
        // know a sibling would go away. Here the band is one badge wide (~25px,
        // between 560 and 600), so asserting path-independence would be
        // asserting something no version of this library ever promised.
        const file = '05-inline-badge.vue'
        const stage = __pg.stage(file)
        const badge = () => {
          const b = stage.querySelector('.count')
          return b ? Number(__pg.txt(b).replace(/\D/g, '')) : 0
        }
        const widths = [700, 600, 520, 460, 400, 340, 280, 220, 180]
        const snap = (px) => ({
          px,
          run: __fit.visible(file).join('|'),
          hidden: __fit.hiddenCount(file),
          badge: badge(),
          state: __fit.state(file),
          spill: Math.round(__fit.spill(file)),
        })

        const down = []
        for (const px of widths) {
          await __fit.width(file, px)
          down.push(snap(px))
        }
        const up = []
        for (const px of [...widths].reverse()) {
          await __fit.width(file, px)
          up.push(snap(px))
        }

        // Narrowing may never reveal a chip, widening may never hide one, and
        // the trip has to end where it started — every chip back, no badge.
        const downMonotone = down.every((r, i) => i === 0 || r.hidden >= down[i - 1].hidden)
        const upMonotone = up.every((r, i) => i === 0 || r.hidden <= up[i - 1].hidden)
        const home = up[up.length - 1]
        const restored = home.run === down[0].run && home.hidden === 0 && home.badge === 0 && home.state === 'fits'
        const all = [...down, ...up]
        const badgeOk = all.every((r) => r.badge === r.hidden)
        const stateOk = all.every((r) => r.state === (r.hidden > 0 ? 'overflowing' : 'fits'))
        const clipped = all.filter((r) => r.spill > 1)
        // Negative control: a sweep that never hid a chip comes home by doing
        // nothing at all, and would pass for the wrong reason.
        const sawBoth = down.some((r) => r.hidden === 0) && down.some((r) => r.hidden > 0)
        return {
          pass:
            downMonotone && upMonotone && restored && badgeOk && stateOk && clipped.length === 0 && sawBoth,
          detail: `down ${down.map((r) => r.px + ':' + r.hidden).join(' ')} | up ${up.map((r) => r.px + ':' + r.hidden).join(' ')}${restored ? '' : ` — CAME HOME TO [${home.run}] +${home.badge}/${home.state}, not [${down[0].run}]`}${downMonotone ? '' : ' — narrowing the row REVEALED a chip'}${upMonotone ? '' : ' — widening the row HID a chip'}${badgeOk ? '' : ' — the badge disagrees with the DOM'}${stateOk ? '' : ' — data-v-fit-state disagrees with the hidden set'}${clipped.length ? ' — CLIPPED at ' + clipped.map((r) => r.px + 'px by ' + r.spill + 'px').join(',') : ''}${sawBoth ? '' : ' — SWEEP NEVER CHANGED'}`,
        }
      },
    },
    {
      demo: '05-inline-badge.vue',
      name: 'the badge the row creates by hiding a chip never clips the chip beside it (offsetNeededInPx: 0)',
      fn: async () => {
        // Nothing is reserved inside the host here, so at the width where the
        // first chip drops the badge appears and takes ~25px off a `flex: 1`
        // host that had already been measured without it. Every pass measures
        // with all children shown, so the second pass sees the narrower host and
        // has to give up another chip — 20px steps across that boundary are
        // where a stale budget shows up as a half-eaten label.
        const file = '05-inline-badge.vue'
        const stage = __pg.stage(file)
        const row = stage.querySelector('.row')
        if (!row) return { pass: false, detail: 'no .row wrapper on the card' }
        const rows = []
        for (let px = 660; px >= 420; px -= 20) {
          await __fit.width(file, px, 400)
          const host = __fit.host(file)
          const shown = [...host.children].filter((c) => !c.hasAttribute('data-v-fit-hidden'))
          const lastRight = shown.length
            ? Math.max(...shown.map((c) => c.getBoundingClientRect().right))
            : __fit.edges(host).left
          const b = stage.querySelector('.count')
          rows.push({
            px,
            visible: shown.length,
            hidden: __fit.hiddenCount(file),
            badge: b ? Number(__pg.txt(b).replace(/\D/g, '')) : 0,
            spill: Math.round(__fit.spill(file)),
            overlap: b ? Math.round(lastRight - b.getBoundingClientRect().left) : 0,
            outside: b ? Math.round(b.getBoundingClientRect().right - __fit.edges(row).right) : 0,
          })
        }
        const bad = rows.filter((r) => r.spill > 1 || r.overlap > 1 || r.outside > 1 || r.badge !== r.hidden)
        // Negative control: the sweep has to cross the width where the badge is
        // born, or it never touched the feedback this check is about.
        const crossed = rows.some((r) => r.hidden === 0) && rows.some((r) => r.hidden > 0)
        return {
          pass: bad.length === 0 && crossed,
          detail: `${rows.map((r) => r.px + ':' + r.visible + 'v/+' + r.badge + '/' + r.spill + 'px').join(' ')}${crossed ? '' : ' — THE BADGE NEVER APPEARED OR NEVER LEFT'}${bad.length ? ' — BAD at ' + bad.map((r) => r.px + 'px spill' + r.spill + ' overlap' + r.overlap + ' outside' + r.outside + ' badge+' + r.badge + ' vs ' + r.hidden + ' hidden').join('; ') : ''}`,
        }
      },
    },

    // ── The trigger nothing else can see ──────────────────────────────
    {
      demo: '06-dynamic-children.vue',
      name: 'a child that grows without being replaced is picked up (per-child ResizeObserver)',
      fn: async () => {
        const file = '06-dynamic-children.vue'
        await __fit.width(file, 240)
        const host = __fit.host(file)
        const first = host.children[0]
        const before = __fit.payload(file)
        if (before.hiddenChildrenCount !== 0) {
          return { pass: false, detail: `row already overflowing before the click: ${before.raw}` }
        }

        __pg.button(file, 'Grow the first child').click()
        await __pg.sleep(900)
        const after = __fit.payload(file)

        // The whole point: the SAME element, so the child set is untouched and
        // neither the `updated` hook nor the MutationObserver has anything to
        // report. Only a per-child ResizeObserver can see this.
        const sameElement = host.children[0] === first
        return {
          pass: sameElement && after.hiddenChildrenCount > before.hiddenChildrenCount,
          detail: `${sameElement ? 'same element' : 'ELEMENT WAS REPLACED — the updated hook would have caught it'}, hidden ${before.hiddenChildrenCount} -> ${after.hiddenChildrenCount} (${after.raw})`,
        }
      },
    },

    {
      demo: '06-dynamic-children.vue',
      name: 'quality 1: hiddenData follows an in-place pop() when the visible run does not move',
      fn: async () => {
        // Card 10 drives the same bug on the bare path; this is the `data`
        // half, which is the one the audit measured: a "+3 more" dropdown
        // still naming rows the user had already deleted.
        const file = '06-dynamic-children.vue'
        await __fit.width(file, 300)
        // Enough hidden children that removing two still leaves some hidden:
        // empty the hidden set entirely and the smart-fit branch stops
        // reserving the 44px offset, which moves the visible run for an
        // unrelated reason and the check stops being about the gate.
        for (let i = 0; i < 8; i++) __pg.button(file, 'Add child').click()
        await __pg.sleep(1300)

        const before = { run: __fit.visible(file), payload: __fit.payload(file) }
        if (before.payload.hiddenChildrenCount < 2) {
          return { pass: false, detail: `needed hidden children to remove: ${before.payload.raw}` }
        }

        __pg.button(file, 'Remove child').click()
        __pg.button(file, 'Remove child').click()
        await __pg.sleep(1300)
        const after = { run: __fit.visible(file), payload: __fit.payload(file) }

        const runUnchanged = before.run.join('|') === after.run.join('|')
        const stale = after.payload.hiddenData.filter((name) => !__fit.visible(file).includes(name) && !__fit.allText(file).includes(name))
        return {
          pass:
            runUnchanged &&
            after.payload.hiddenChildrenCount === before.payload.hiddenChildrenCount - 2 &&
            after.payload.hiddenChildrenCount === __fit.hiddenCount(file) &&
            stale.length === 0,
          detail: `run ${runUnchanged ? 'unchanged' : 'MOVED'}; hiddenData [${after.payload.hiddenData.join(', ')}]${stale.length ? ' NAMES DELETED CHILDREN: ' + stale.join(', ') : ''}; DOM has ${__fit.hiddenCount(file)} hidden, the event says ${after.payload.hiddenChildrenCount}`,
        }
      },
    },

    // ── The CSS half of the contract ──────────────────────────────────
    {
      demo: '07-state-attribute.vue',
      name: 'data-v-fit-state flips with the row, and the event agrees with it',
      fn: async () => {
        const file = '07-state-attribute.vue'
        const seen = []
        for (const px of [720, 520, 380, 260, 160]) {
          await __fit.width(file, px)
          // The card's own readout, from the <code> it renders it into —
          // matching the prose text instead picks up the trailing full stop.
          const echoed = __pg.txt(__pg.stage(file).querySelector('.pg-muted code'))
          seen.push({ px, attribute: __fit.state(file), echoed })
        }
        const disagree = seen.filter((s) => s.attribute !== s.echoed)
        const sawBoth =
          seen.some((s) => s.attribute === 'fits') && seen.some((s) => s.attribute === 'overflowing')
        return {
          pass: disagree.length === 0 && sawBoth,
          detail: `${seen.map((s) => s.px + ':' + s.attribute + '/' + s.echoed).join(' ')}${sawBoth ? '' : ' — NEVER FLIPPED'}`,
        }
      },
    },

    // ── FIT-1 F4 ──────────────────────────────────────────────────────
    {
      demo: '08-decorative.vue',
      name: 'FIT-1 F4: a separator is never left dangling at the end of the row',
      fn: async () => {
        const file = '08-decorative.vue'
        const bad = []
        let sawHiddenSeparator = false
        for (const px of [640, 560, 480, 440, 400, 380, 340, 320, 280, 260, 220, 200, 170, 150]) {
          await __fit.width(file, px, 380)
          const kids = [...__fit.host(file).children]
          const shown = kids.filter((c) => !c.hasAttribute('data-v-fit-hidden'))
          if (kids.some((c) => c.classList.contains('sep') && c.hasAttribute('data-v-fit-hidden'))) {
            sawHiddenSeparator = true
          }
          const last = shown[shown.length - 1]
          if (last && last.classList.contains('sep')) bad.push(`${px}px ends on "${__pg.txt(last)}"`)
        }
        // Negative control: a sweep where no separator was ever hidden could
        // not have produced a dangling one either.
        return {
          pass: bad.length === 0 && sawHiddenSeparator,
          detail: bad.length
            ? bad.join('; ')
            : sawHiddenSeparator
              ? 'no width ended the row on a separator, and separators were being hidden throughout'
              : 'NO SEPARATOR WAS EVER HIDDEN — the sweep never reached the case',
        }
      },
    },

    // ── v-show composition ────────────────────────────────────────────
    {
      demo: '09-v-show.vue',
      name: 'a child the consumer hid with v-show is left alone and never counted',
      fn: async () => {
        // Hiding is an attribute plus one injected rule precisely so this
        // composes: `v-show` owns `style.display`, the directive owns
        // `data-v-fit-hidden`, and neither can undo the other.
        const file = '09-v-show.vue'
        await __fit.width(file, 360)
        const before = Number(__pg.txt(__pg.stage(file).querySelector('.pg-muted code')))

        const box = __fit.host(file).ownerDocument
          ? [...__pg.stage(file).querySelectorAll('input[type=checkbox]')][0]
          : null
        if (!box) return { pass: false, detail: 'no v-show checkbox on the card' }
        __pg.set(box, false)
        await __pg.sleep(900)

        const drafts = [...__fit.host(file).children].find((c) => __pg.txt(c) === 'Drafts')
        if (!drafts) return { pass: false, detail: 'the Drafts chip left the DOM entirely' }

        const after = Number(__pg.txt(__pg.stage(file).querySelector('.pg-muted code')))
        const consumerHidden = drafts.style.display === 'none'
        const notOursToHide = !drafts.hasAttribute('data-v-fit-hidden')
        // …and it is not silently counted as one of ours either.
        const reported = __fit.hiddenCount(file)

        return {
          pass: consumerHidden && notOursToHide && after === reported,
          detail: `Drafts: style.display=${JSON.stringify(drafts.style.display)}, data-v-fit-hidden=${!notOursToHide}; reported ${before} -> ${after}, DOM says ${reported}`,
        }
      },
    },

    // ── FIT-1 F1 ──────────────────────────────────────────────────────
    {
      demo: '10-event-contract.vue',
      name: 'FIT-1 F1: a first pass that hides EVERY child still dispatches',
      fn: async () => {
        const file = '10-event-contract.vue'
        await __fit.width(file, 60)
        // Remount zeroes the card's counter, so what follows is a genuine first
        // pass — `state.visible` empty, and the fit empty too.
        __pg.button(file, 'Remount the row').click()
        await __pg.sleep(1100)

        const payload = __fit.payload(file)
        const badge = __pg.stage(file).querySelector('.more')
        const visible = __fit.visible(file)
        const attribute = __fit.state(file)

        return {
          pass:
            visible.length === 0 &&
            attribute === 'overflowing' &&
            payload.fired &&
            payload.dispatched >= 1 &&
            payload.hiddenChildrenCount === 9 &&
            payload.isOverflowing === true &&
            !!badge &&
            __pg.txt(badge) === '+9 more',
          detail: `${visible.length} visible, attribute=${attribute}, badge=${badge ? __pg.txt(badge) : 'ABSENT — the F1 symptom'}, ${payload.raw}`,
        }
      },
    },
    {
      demo: '10-event-contract.vue',
      name: 'FIT-1 F1 control: a first pass that hides nothing dispatches too, with an empty payload',
      fn: async () => {
        // Without this, the check above only proves the card dispatches
        // something at mount — not that the payload describes the row.
        const file = '10-event-contract.vue'
        await __fit.width(file, 720)
        __pg.button(file, 'Remount the row').click()
        await __pg.sleep(1100)

        const payload = __fit.payload(file)
        const badge = __pg.stage(file).querySelector('.more')
        return {
          pass:
            payload.fired &&
            payload.dispatched >= 1 &&
            payload.hiddenChildrenCount === 0 &&
            payload.isOverflowing === false &&
            __fit.state(file) === 'fits' &&
            !badge,
          detail: `attribute=${__fit.state(file)}, badge=${badge ? __pg.txt(badge) : 'none'}, ${payload.raw}`,
        }
      },
    },
    {
      demo: '10-event-contract.vue',
      name: 'quality 1: pop() of hidden chips re-reports, with the visible run untouched',
      fn: async () => {
        const file = '10-event-contract.vue'
        await __fit.width(file, 420)
        const before = { run: __fit.visible(file), payload: __fit.payload(file) }
        if (before.payload.hiddenChildrenCount < 2) {
          return { pass: false, detail: `needed a few hidden chips to remove: ${before.payload.raw}` }
        }

        // Pop off exactly the chips that were hidden, on the same array. The
        // chips on screen cannot move — the ones being removed were never
        // visible — so the old gate's two terms (the visible set, the array's
        // identity) both stay put while every field of the payload changes.
        const removing = before.payload.hiddenChildrenCount
        for (let i = 0; i < removing; i++) __pg.button(file, 'Remove chip').click()
        await __pg.sleep(1200)
        const after = { run: __fit.visible(file), payload: __fit.payload(file) }

        const runUnchanged = before.run.join('|') === after.run.join('|')
        return {
          pass:
            runUnchanged &&
            after.payload.dispatched > before.payload.dispatched &&
            after.payload.hiddenChildrenCount === 0 &&
            after.payload.isOverflowing === false &&
            __fit.hiddenCount(file) === 0 &&
            __fit.state(file) === 'fits',
          detail: `removed ${removing}; run ${runUnchanged ? 'unchanged' : 'MOVED: ' + before.run.join(',') + ' -> ' + after.run.join(',')}; hidden ${before.payload.hiddenChildrenCount} -> ${after.payload.hiddenChildrenCount} (DOM says ${__fit.hiddenCount(file)}, attribute says ${__fit.state(file)}); ${after.payload.raw}`,
        }
      },
    },
    {
      demo: '10-event-contract.vue',
      name: 'quality 1: push() of a chip that cannot fit re-reports, with the visible run untouched',
      fn: async () => {
        const file = '10-event-contract.vue'
        await __fit.width(file, 420)
        const before = { run: __fit.visible(file), payload: __fit.payload(file) }

        __pg.button(file, 'Add chip').click()
        await __pg.sleep(1000)
        const after = { run: __fit.visible(file), payload: __fit.payload(file) }

        const runUnchanged = before.run.join('|') === after.run.join('|')
        // The new chip is the last DOM child, and it cannot fit — so the event
        // has to name its position. Without `data` bound this is the whole of
        // what the payload can say, which is exactly the default path F1 is on.
        const namesIt = after.payload.hiddenIndices.includes(String(__fit.host(file).children.length - 1))
        return {
          pass:
            runUnchanged &&
            namesIt &&
            after.payload.hiddenChildrenCount === before.payload.hiddenChildrenCount + 1 &&
            after.payload.hiddenChildrenCount === __fit.hiddenCount(file),
          detail: `run ${runUnchanged ? 'unchanged' : 'MOVED'}; hiddenIndices ${namesIt ? 'names the new chip' : 'DOES NOT name it'}; DOM has ${__fit.hiddenCount(file)} hidden; ${after.payload.raw}`,
        }
      },
    },
    {
      demo: '10-event-contract.vue',
      name: 'the gate still suppresses: a settled row stops dispatching',
      fn: async () => {
        // The gate is not free to become "always dispatch". Hiding a child is
        // itself a resize, and the badge on this card is rendered from the
        // payload — so an unconditional dispatch is an infinite loop with a
        // visible symptom.
        const file = '10-event-contract.vue'
        await __fit.width(file, 300)
        await __pg.sleep(900)
        const settled = __fit.payload(file).dispatched
        await __pg.sleep(1500)
        const later = __fit.payload(file).dispatched
        return {
          pass: later === settled,
          detail: `${settled} dispatches when settled, ${later} after another 1.5s idle`,
        }
      },
    },

    // ── FIT-1 F2 ──────────────────────────────────────────────────────
    {
      demo: '11-pinned-overflow.vue',
      name: 'FIT-1 F2: isOverflowing follows the row on the RESIZE path, not only at mount',
      fn: async () => {
        const file = '11-pinned-overflow.vue'
        const seen = []
        for (const px of [700, 560, 460, 380, 300, 220, 160, 120, 700]) {
          await __fit.width(file, px, 420)
          const kv = __pg.txt(__pg.stage(file).querySelector('.pg-kv'))
          const fromEvent = (kv.match(/detail\.isOverflowing:\s*(\S+)/) || [])[1]
          seen.push({ px, attribute: __fit.state(file), fromEvent })
        }
        const disagree = seen.filter(
          (s) => s.fromEvent !== String(s.attribute === 'overflowing'),
        )
        // Negative control: every child here is pinned, so a sweep that never
        // flipped would let `false === false` pass nine times over.
        const sawBoth =
          seen.some((s) => s.attribute === 'fits') && seen.some((s) => s.attribute === 'overflowing')
        return {
          pass: disagree.length === 0 && sawBoth,
          detail: `${seen.map((s) => s.px + ':' + s.attribute + '/' + s.fromEvent).join(' ')}${sawBoth ? '' : ' — NEVER FLIPPED'}`,
        }
      },
    },
    // ── FIT-2 ─────────────────────────────────────────────────────────
    {
      demo: '12-host-resize.vue',
      name: 'FIT-2: the host alone narrows and returns — every chip comes back',
      fn: async () => {
        // The slider writes an inline width on the DIRECTIVE ELEMENT. Its frame
        // is a fixed 640px and it has no siblings, so the only ResizeObserver
        // entry this card can produce is the host's own — which through 2.3.0
        // was the one trigger that never retracted `oversizedRuns`.
        const file = '12-host-resize.vue'
        await __fit.width(file, 600)
        const wide = __fit.visible(file).length

        const rows = []
        for (const narrow of [200, 300, 240, 180]) {
          await __fit.width(file, narrow)
          const hid = __fit.visible(file).length
          await __fit.width(file, 600)
          rows.push({ narrow, hid, back: __fit.visible(file).length })
        }

        const frozen = rows.filter((r) => r.back !== wide)
        // Negative control: a round trip that never hid anything comes back by
        // doing nothing at all, and would pass for the wrong reason.
        const reallyHid = rows.every((r) => r.hid < wide)
        return {
          pass: wide === 9 && reallyHid && frozen.length === 0,
          detail: `${wide} chips at 600px; ${rows.map((r) => r.narrow + 'px->' + r.hid + ' back->' + r.back).join(' ')}${reallyHid ? '' : ' — A ROUND TRIP NEVER HID ANYTHING'}${frozen.length ? ' — FROZEN at ' + frozen.map((r) => r.narrow).join(',') : ''}`,
        }
      },
    },
    {
      demo: '12-host-resize.vue',
      name: 'FIT-2: the state attribute never reads "fits" over a row that is hiding chips',
      fn: async () => {
        // The contradiction is the symptom that makes this a P0 rather than a
        // layout nit: CSS says the row is fine, the event says nothing is
        // overflowing, and six of nine chips are gone.
        const file = '12-host-resize.vue'
        const seen = []
        for (const px of [600, 200, 600, 340, 600, 140, 600]) {
          await __fit.width(file, px)
          seen.push({ px, attribute: __fit.state(file), hidden: __fit.hiddenCount(file) })
        }
        const lying = seen.filter((s) => s.attribute === 'fits' && s.hidden > 0)
        const sawBoth =
          seen.some((s) => s.hidden === 0) && seen.some((s) => s.hidden > 0)
        return {
          pass: lying.length === 0 && sawBoth,
          detail: `${seen.map((s) => s.px + ':' + s.attribute + '/' + s.hidden + 'hidden').join(' ')}${sawBoth ? '' : ' — SWEEP NEVER CHANGED'}${lying.length ? ' — "fits" OVER A HIDDEN CHIP' : ''}`,
        }
      },
    },

    {
      demo: '11-pinned-overflow.vue',
      name: 'control: a pinned row hides nothing at any width, so the visible set never moves',
      fn: async () => {
        // This is what makes the check above a test of the dispatch gate rather
        // than of the fit: the one signal the old gate watched is provably
        // constant here.
        const file = '11-pinned-overflow.vue'
        const counts = []
        for (const px of [700, 460, 300, 160, 120]) {
          await __fit.width(file, px, 380)
          counts.push(__fit.visible(file).length)
        }
        return {
          pass: counts.every((n) => n === 4),
          detail: `visible children across the sweep: ${counts.join(', ')} (all four are pinned)`,
        }
      },
    },
  ],
}
