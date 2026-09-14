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
