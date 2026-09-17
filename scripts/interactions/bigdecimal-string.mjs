/**
 * `bigdecimal-string` interaction checks — one per claim, and every one of them
 * asserts the claim is **visible**, not merely present.
 *
 * Why this file is shaped the way it is
 * ------------------------------------
 * This library's value proposition is invisible on its own. `"0.30"` says
 * nothing until it sits next to `0.30000000000000004`, so every card on the tab
 * renders the same expression twice — plain JavaScript on the left, the library
 * on the right — and both halves are computed in the page. The thing that can
 * silently rot is therefore not "does the maths work" (122 unit tests cover
 * that) but "does a reader still SEE both halves". A card that lost its native
 * column, or whose library column is clipped to nothing, would demonstrate
 * exactly zero while every unit test stayed green.
 *
 * So `__bd.visible()` below refuses an element that is:
 *   - absent, or empty;
 *   - `display:none`, `visibility:hidden`, or effectively transparent;
 *   - laid out at a zero box;
 *   - clipping its own text (`scrollWidth > clientWidth`) — the long values
 *     here run to 30+ characters and a truncated answer proves nothing;
 *   - covered by something else, or scrolled somewhere the hit test cannot
 *     reach it. The element is scrolled into view first, so failing this means
 *     it is genuinely unreachable, not merely below the fold.
 *
 * Why the expected values are literals HERE and never on the card
 * --------------------------------------------------------------
 * A hardcoded `0.30000000000000004` in a demo file is a claim ABOUT JavaScript
 * rather than a demonstration of one, and it cannot rot in a way anyone would
 * notice. In an assertion it is the opposite: it is the frozen record of what
 * this browser answered on 2026-09-13, and if either side ever moves, this file
 * goes red and a human looks. Two of them exist precisely because the README
 * got them wrong — see `03-scientific-notation` and `11-parsing`.
 *
 * Runtime note: the runner reloads the page before every check, and there are
 * 70 of them here, so a full pass over this library takes a couple of minutes.
 * `ONLY=commas pnpm interactions` narrows it while iterating.
 */
import { setTimeout as sleep } from 'node:timers/promises'

const J = JSON.stringify

// ---------------------------------------------------------------------------
// Page-side helpers
// ---------------------------------------------------------------------------

const PRELUDE = `
window.__bd = {
  /** One comparison row inside a card's own stage. Never the card chrome. */
  row(demo, claim) {
    return __pg.stage(demo).querySelector('[data-claim="' + claim + '"]')
  },

  /**
   * Is this element actually readable by a person looking at the page?
   *
   * "Present in the DOM" is not the assertion this tab needs. An element that
   * exists but is clipped, hidden or covered demonstrates nothing, and the
   * whole point of the tab is that the contrast is on screen.
   */
  visible(el) {
    if (!el) return { ok: false, why: 'element is missing' }
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim()
    if (!text) return { ok: false, why: 'element is empty' }

    const cs = getComputedStyle(el)
    if (cs.display === 'none') return { ok: false, why: 'display:none' }
    if (cs.visibility !== 'visible') return { ok: false, why: 'visibility:' + cs.visibility }
    if (Number(cs.opacity) < 0.1) return { ok: false, why: 'opacity:' + cs.opacity }

    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) {
      return { ok: false, why: 'laid out at ' + Math.round(r.width) + 'x' + Math.round(r.height) }
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      return { ok: false, why: 'text is clipped: scrollWidth ' + el.scrollWidth + ' > clientWidth ' + el.clientWidth }
    }
    if (el.scrollHeight > el.clientHeight + 1) {
      return { ok: false, why: 'text is clipped vertically: scrollHeight ' + el.scrollHeight + ' > clientHeight ' + el.clientHeight }
    }

    // Hit-test the glyphs themselves, not the element box: catches an overlay,
    // and catches an ancestor that clips the text out of the scroll port.
    const range = document.createRange()
    range.selectNodeContents(el)
    const glyphs = range.getClientRects()[0] || r
    const x = glyphs.left + glyphs.width / 2
    const y = glyphs.top + glyphs.height / 2
    const hit = document.elementFromPoint(x, y)
    if (!hit) return { ok: false, why: 'nothing is painted where its text should be (' + Math.round(x) + ',' + Math.round(y) + ')' }
    if (hit !== el && !el.contains(hit) && !hit.contains(el)) {
      return { ok: false, why: 'covered by <' + hit.tagName.toLowerCase() + ' class="' + hit.className + '">' }
    }

    return {
      ok: true,
      text,
      box: Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top),
    }
  },

  /** Both halves of one claim: visible, and reading what they should read. */
  claim(demo, name, expectNative, expectLibrary) {
    const row = this.row(demo, name)
    if (!row) return { pass: false, detail: 'no [data-claim="' + name + '"] row on ' + demo }

    const native = this.visible(row.querySelector('[data-role="native"]'))
    const library = this.visible(row.querySelector('[data-role="bigdecimal"]'))
    const problems = []

    if (!native.ok) problems.push('plain-JavaScript column is not visible — ' + native.why)
    else if (native.text !== expectNative) {
      problems.push('plain-JavaScript column reads ' + JSON.stringify(native.text) + ', expected ' + JSON.stringify(expectNative))
    }

    if (!library.ok) problems.push('library column is not visible — ' + library.why)
    else if (library.text !== expectLibrary) {
      problems.push('library column reads ' + JSON.stringify(library.text) + ', expected ' + JSON.stringify(expectLibrary))
    }

    if (problems.length) return { pass: false, detail: problems.join(' | ') }
    return {
      pass: true,
      detail: 'JS ' + JSON.stringify(native.text) + ' [' + native.box + ']  vs  bd ' + JSON.stringify(library.text) + ' [' + library.box + ']',
    }
  },

  /** Every claim id a card actually rendered, in document order. */
  claimsOn(demo) {
    return [...__pg.stage(demo).querySelectorAll('[data-claim]')].map((el) => el.getAttribute('data-claim'))
  },

  /** The text of a live output, without the visibility verdict. */
  read(demo, name, role) {
    const row = this.row(demo, name)
    const el = row && row.querySelector('[data-role="' + role + '"]')
    return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : null
  },
}
'ready'
`

// ---------------------------------------------------------------------------
// The claim table.
//
// Frozen on 2026-09-13 against Chrome, from the same expressions the cards run.
// `[whatPlainJavaScriptAnswers, whatTheLibraryAnswers]`.
// ---------------------------------------------------------------------------

const CLAIMS = {
  '01-repl.vue': {
    repl: ['0.30000000000000004', '0.30'],
  },
  '02-precise-decimals.vue': {
    add: ['0.30000000000000004', '0.30'],
    subtract: ['0.19999999999999998', '0.20'],
    multiply: ['7.000000000000001', '7.00'],
    divide: ['2.9999999999999996', '3.00'],
    sum: ['0.6000000000000001', '0.60'],
    equality: ['false', 'true'],
  },
  '03-scientific-notation.vue': {
    tiny: ['1e-8', '0.00000001'],
    huge: ['1e+21', '1,000,000,000,000,000,000,000.00'],
    // The README says String(1e15) is "1e+15". It is not, and this literal is
    // the proof. Doubles switch to exponential at 1e21, which is the row above.
    'e15-readme': ['1000000000000000', '1,000,000,000,000,000.00'],
    // Deliberately no exact expectation for the native side: the card calls
    // `toLocaleString()` with no locale, on purpose, because that is what the
    // README wrote. The claim under test is that it does NOT come back as
    // "1e+21" — see the dedicated check below, which asserts the shape.
    'locale-readme': [null, '1,000,000,000,000,000,000,000.00'],
    'api-value': ['2500000000000', '2,500,000,000,000.00'],
    wei: ['1500000000000000000', '1,500,000,000,000,000,000.00'],
  },
  '04-precision-loss.vue': {
    'max-safe': ['9007199254740992', '9007199254740993.00'],
    'round-trip': ['false', 'true'],
    grouped: ['123,456,789,012,345,680,000', '123,456,789,012,345,678,901.00'],
  },
  '05-formatting.vue': {
    'to-string': ['1234567.89', '1234567.89'],
    prettify: ['1,234,567.89', '1,234,567.89'],
    'to-format': ['1,234,567.89', '1,234,567.89'],
    'to-fixed': ['1234567.8900', '1234567.8900'],
    'to-fixed-pretty': ['1,234,567.89', '1,234,567.89'],
    'trailing-zero': ['9876543210.5', '9,876,543,210.50'],
    'integer-scale': ['12,345,678', '12,345,678.00'],
    'beyond-double': ['9,007,199,254,740,994.00', '9,007,199,254,740,993.55'],
  },
  // At the card's default value, 1.005.
  '06-rounding-modes.vue': {
    'to-fixed': ['1.00', '1.01'],
    'mode-CEILING': ['1.01', '1.01'],
    'mode-FLOOR': ['1', '1.00'],
    'mode-DOWN': ['1', '1.00'],
    'mode-UP': ['1.01', '1.01'],
    'mode-HALF_UP': ['1', '1.01'],
    'mode-HALF_DOWN': ['no native equivalent', '1.00'],
    'mode-HALF_EVEN': ['no native equivalent', '1.00'],
  },
  '07-chainable-immutable.vue': {
    chain: ['725', '725.00'],
    'chain-drift': ['0.15000000000000002', '0.15'],
    immutable: ['21.589199999999998', '19.99'],
    'new-instance': [
      'overwrote it — the binding now holds 21.589199999999998',
      'returned a new instance (true) worth 21.59, original still 19.99',
    ],
  },
  '08-comparisons.vue': {
    'eq-float': ['false', 'true'],
    'gt-float': ['true', 'false'],
    'eq-trailing-zero': ['false', 'true'],
    gte: ['true', 'true'],
    lt: ['true', 'true'],
    lte: ['true', 'true'],
    sort: ['10, 100, 9, 9.50', '9, 9.50, 10, 100'],
  },
  '09-currency.vue': {
    'line-total': ['3899.9700000000003', '3,899.97'],
    tax: ['82.49917500000001', '82.50'],
    'grand-total': ['1082.489175', '1,082.49'],
    'cart-subtotal': ['2899.9399999999996', '2,899.94'],
    'cart-tax': ['231.99519999999998', '232.00'],
    'cart-total': ['3131.9351999999994', '3,131.94'],
  },
  '10-static-and-utility.vue': {
    sum: ['0.6000000000000001', '0.60'],
    max: ['9007199254740992', '9007199254740993'],
    min: ['3', '3.00'],
    'zero-one': ['0 and 1', '0.00 and 1.00'],
    abs: ['50', '50.00'],
    negate: ['-50', '-50.00'],
    predicates: ['true / true / true', 'true / true / true'],
  },
  '11-parsing.vue': {
    'from-string': ['123.45', '123.45'],
    'from-scientific': ['2500000000000', '2500000000000.00'],
    'from-number': ['123.45', '123.45'],
    'precision-3': ['123.456', '123.456'],
    'precision-4': ['100.0000', '100.0000'],
    // BD-1 (1.2.1) landed the fix these two rows used to document as a defect:
    // grouped input is READ, and toFormat() output reads back. parseFloat still
    // stops at the comma and answers 1, which is why the row stays on the card.
    commas: ['1', '1234.56'],
    'round-trip': ['1', '1234567.89'],
    // Grouping is validated, not stripped: "1,23" is refused rather than read
    // as 123. The library column is the throw itself.
    ambiguous: ['1', 'throws SyntaxError'],
    'eu-dialect': ['1.234', '1234.56'],
  },
}

/**
 * The runner stringifies `check.fn` and evaluates it in the page, so a closure
 * over `demo`/`claim` would not survive the trip. `new Function` bakes the
 * values into the function's own source instead, which does.
 */
const claimCheck = (demo, name, [native, library]) => ({
  demo,
  name: `${name} — both columns visible (JS ${native === null ? '<shape-checked>' : J(native)} vs bd ${J(library)})`,
  fn: new Function(`return __bd.claim(${J(demo)}, ${J(name)}, ${J(native)}, ${J(library)})`),
})

const CHECKS = []
for (const [demo, claims] of Object.entries(CLAIMS)) {
  for (const [name, expected] of Object.entries(claims)) {
    // A `null` native expectation means the value is locale- or
    // engine-dependent and has its own shape check below; skip the exact one
    // rather than freezing a value that would fail on someone else's machine.
    if (expected[0] === null) continue
    CHECKS.push(claimCheck(demo, name, expected))
  }
}

// --- Claims whose native side cannot be frozen to an exact string -----------

CHECKS.push({
  demo: '03-scientific-notation.vue',
  name: 'locale-readme — toLocaleString() groups 1e21, it does not return "1e+21"',
  fn: () => {
    const native = __bd.visible(
      __bd.row('03-scientific-notation.vue', 'locale-readme').querySelector('[data-role="native"]'),
    )
    const library = __bd.visible(
      __bd.row('03-scientific-notation.vue', 'locale-readme').querySelector('[data-role="bigdecimal"]'),
    )
    if (!native.ok) return { pass: false, detail: 'plain-JavaScript column is not visible — ' + native.why }
    if (!library.ok) return { pass: false, detail: 'library column is not visible — ' + library.why }

    // Locale-independent: 22 digits, grouped somehow, and no exponent.
    const digits = native.text.replace(/\D/g, '')
    const exponent = /e\+?\d/i.test(native.text)
    const grouped = native.text.length > digits.length
    if (exponent) {
      return {
        pass: false,
        detail:
          'toLocaleString() DID return exponential notation (' + JSON.stringify(native.text) + '). ' +
          'That would make the README right and this card wrong — check the engine and update both.',
      }
    }
    const ok = digits === '1' + '0'.repeat(21) && grouped && library.text === '1,000,000,000,000,000,000,000.00'
    return {
      pass: ok,
      detail: 'JS ' + JSON.stringify(native.text) + ' [' + native.box + ']  vs  bd ' + JSON.stringify(library.text) + ' [' + library.box + ']',
    }
  },
})

// --- The guard that keeps the table above honest ----------------------------

CHECKS.push({
  demo: '01-repl.vue',
  name: 'every card renders exactly the claim rows this spec knows about',
  fn: new Function(`
    const expected = ${J(Object.fromEntries(Object.entries(CLAIMS).map(([d, c]) => [d, Object.keys(c)])))}
    const problems = []
    for (const demo of Object.keys(expected)) {
      let found
      try {
        found = __bd.claimsOn(demo)
      } catch (err) {
        problems.push(demo + ': ' + err.message)
        continue
      }
      const missing = expected[demo].filter((c) => !found.includes(c))
      const extra = found.filter((c) => !expected[demo].includes(c))
      if (missing.length) problems.push(demo + ' is missing claim row(s): ' + missing.join(', '))
      if (extra.length) problems.push(demo + ' renders untested claim row(s): ' + extra.join(', '))
    }
    const total = Object.values(expected).reduce((n, c) => n + c.length, 0)
    return problems.length
      ? { pass: false, detail: problems.join(' | ') }
      : { pass: true, detail: total + ' claim rows across ' + Object.keys(expected).length + ' cards, all accounted for' }
  `),
})

// --- The two README contradictions must be stated ON the card ---------------

CHECKS.push({
  demo: '03-scientific-notation.vue',
  name: 'the two README contradictions are flagged on the card, visibly',
  fn: () => {
    const warnings = [...__pg.stage('03-scientific-notation.vue').querySelectorAll('[data-role="claim-warning"]')]
    if (warnings.length !== 2) return { pass: false, detail: 'expected 2 warnings, found ' + warnings.length }
    const bad = warnings.map((w) => __bd.visible(w)).filter((v) => !v.ok)
    return bad.length
      ? { pass: false, detail: 'a warning is not visible — ' + bad.map((b) => b.why).join('; ') }
      : { pass: true, detail: warnings.map((w) => __bd.visible(w).box).join(' and ') }
  },
})

CHECKS.push({
  demo: '11-parsing.vue',
  name: 'the separator standard is stated on the card, visibly',
  fn: () => {
    const warnings = [...__pg.stage('11-parsing.vue').querySelectorAll('[data-role="claim-warning"]')]
    if (warnings.length !== 2) return { pass: false, detail: 'expected 2 warnings, found ' + warnings.length }
    const verdicts = warnings.map((w) => __bd.visible(w))
    const bad = verdicts.filter((v) => !v.ok)
    if (bad.length) return { pass: false, detail: 'a warning is not visible — ' + bad.map((b) => b.why).join('; ') }
    const mentions = verdicts.every((v) => /comma|group/i.test(v.text))
    const namesTheThrow = verdicts.some((v) => /SyntaxError/.test(v.text))
    return {
      pass: mentions && namesTheThrow,
      detail:
        mentions && namesTheThrow
          ? verdicts.map((v) => v.box).join(' and ')
          : 'the warnings no longer state the standard (or no longer show the refusal)',
    }
  },
})

// ---------------------------------------------------------------------------
// Native checks — real typed input, real clicks.
// ---------------------------------------------------------------------------

/** Centre of the first `sel` inside a card's stage, scrolled into view. */
async function centre(ctx, demo, sel, nth = 0) {
  const box = await ctx.page.evaluate(
    `(() => {
      const stage = document.querySelector('section[id="demo-${demo}"] .demo__stage')
      if (!stage) return { err: 'no stage for ${demo}' }
      const el = stage.querySelectorAll(${J(sel)})[${nth}]
      if (!el) return { err: 'no ${sel}[${nth}] on ${demo}' }
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`,
  )
  if (box.err) throw new Error(box.err)
  return box
}

/** A real, trusted left click. Nothing here uses `el.click()`. */
async function click(ctx, demo, sel, nth = 0) {
  const { x, y } = await centre(ctx, demo, sel, nth)
  const common = { x, y, button: 'left', buttons: 1, clickCount: 1 }
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common }, ctx.sessionId)
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common, buttons: 0 }, ctx.sessionId)
  await sleep(160)
}

/** Trusted click on the button inside a card whose text contains `needle`. */
async function clickButton(ctx, demo, needle) {
  const nth = await ctx.page.evaluate(
    `(() => {
      const stage = document.querySelector('section[id="demo-${demo}"] .demo__stage')
      return [...(stage ? stage.querySelectorAll('button') : [])]
        .findIndex((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim() === ${J(needle)})
    })()`,
  )
  if (nth < 0) throw new Error(`${demo}: no button reading ${J(needle)}`)
  await click(ctx, demo, 'button', nth)
}

/** One trusted key press with no text — Backspace, End, and friends. */
async function pressKey(ctx, key, code, keyCode) {
  const common = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
  await ctx.cdp.send('Input.dispatchKeyEvent', { ...common, type: 'keyDown' }, ctx.sessionId)
  await ctx.cdp.send('Input.dispatchKeyEvent', { ...common, type: 'keyUp' }, ctx.sessionId)
}

/**
 * Type into a field the way a person does: focus it with a trusted click, walk
 * to the end, backspace over what is there, then send one key per character.
 * `el.value = …` plus a synthetic `input` event would prove the binding works,
 * not that the control does.
 *
 * The clear is Backspace rather than a select-all shortcut on purpose — the
 * shortcut is platform- and focus-dependent, and when it silently no-ops the
 * new text is *appended*, which reads downstream as a library bug rather than
 * a harness bug. This throws instead.
 */
async function typeInto(ctx, demo, sel, text, nth = 0) {
  await click(ctx, demo, sel, nth)

  const valueOf = () =>
    ctx.page.evaluate(
      `(() => {
        const stage = document.querySelector('section[id="demo-${demo}"] .demo__stage')
        const el = stage && stage.querySelectorAll(${J(sel)})[${nth}]
        return el ? { value: el.value, focused: document.activeElement === el } : null
      })()`,
    )

  const before = await valueOf()
  if (!before) throw new Error(`${demo}: no ${sel}[${nth}]`)
  if (!before.focused) throw new Error(`${demo}: clicking ${sel}[${nth}] did not focus it`)

  await pressKey(ctx, 'End', 'End', 35)
  for (let i = 0; i < before.value.length + 2; i++) {
    await pressKey(ctx, 'Backspace', 'Backspace', 8)
  }
  const cleared = await valueOf()
  if (cleared.value !== '') throw new Error(`${demo}: ${sel}[${nth}] still reads ${J(cleared.value)} after clearing`)

  // `rawKeyDown` then `char`, never `keyDown` with `text` — a `keyDown` that
  // carries text inserts the character itself, so pairing it with `char` types
  // everything twice. The post-condition below is what caught that.
  for (const ch of text) {
    await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ch }, ctx.sessionId)
    await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'char', text: ch, key: ch }, ctx.sessionId)
    await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, ctx.sessionId)
  }
  await sleep(220)

  const after = await valueOf()
  if (after.value !== text) {
    throw new Error(`${demo}: typed ${J(text)} into ${sel}[${nth}] but it reads ${J(after.value)}`)
  }
}

const readClaim = (ctx, demo, claim, role) =>
  ctx.page.evaluate(`__bd.read(${J(demo)}, ${J(claim)}, ${J(role)})`)

const visibleClaim = (ctx, demo, claim, native, library) =>
  ctx.page.evaluate(`__bd.claim(${J(demo)}, ${J(claim)}, ${J(native)}, ${J(library)})`)

const NATIVE_CHECKS = [
  {
    demo: '01-repl.vue',
    name: 'typing 1.1 and 2.2 into the operands moves BOTH columns',
    async run(ctx) {
      const before = await readClaim(ctx, '01-repl.vue', 'repl', 'bigdecimal')
      await typeInto(ctx, '01-repl.vue', 'input[type="text"]', '1.1', 0)
      await typeInto(ctx, '01-repl.vue', 'input[type="text"]', '2.2', 1)
      const verdict = await visibleClaim(ctx, '01-repl.vue', 'repl', '3.3000000000000003', '3.30')
      return {
        pass: verdict.pass && before === '0.30',
        detail: `was ${J(before)}; ${verdict.detail}`,
      }
    },
  },
  {
    demo: '01-repl.vue',
    name: 'the 0.07 * 100 preset shows 7.000000000000001 beside 7.00',
    async run(ctx) {
      await clickButton(ctx, '01-repl.vue', '0.07 * 100')
      return visibleClaim(ctx, '01-repl.vue', 'repl', '7.000000000000001', '7.00')
    },
  },
  {
    demo: '01-repl.vue',
    name: 'dividing by zero: JavaScript answers Infinity, the library refuses — both on screen',
    async run(ctx) {
      await clickButton(ctx, '01-repl.vue', '1 / 0')
      const verdict = await visibleClaim(ctx, '01-repl.vue', 'repl', 'Infinity', 'Error: Division by zero')
      return verdict
    },
  },
  {
    demo: '06-rounding-modes.vue',
    name: 'typing 2.675 makes the two native rounding routes disagree with each other',
    async run(ctx) {
      await typeInto(ctx, '06-rounding-modes.vue', 'input[type="text"]', '2.675')

      // toFixed rounds the stored double down; the scale-by-100 trick lands on
      // an exact 267.5 and rounds up. Both are "the native way to round to
      // cents", and they now give different money.
      const viaToFixed = await visibleClaim(ctx, '06-rounding-modes.vue', 'to-fixed', '2.67', '2.68')
      const viaMathRound = await visibleClaim(ctx, '06-rounding-modes.vue', 'mode-HALF_UP', '2.68', '2.68')

      const problems = []
      if (!viaToFixed.pass) problems.push(`to-fixed row: ${viaToFixed.detail}`)
      if (!viaMathRound.pass) problems.push(`mode-HALF_UP row: ${viaMathRound.detail}`)
      return {
        pass: problems.length === 0,
        detail: problems.length
          ? problems.join(' | ')
          : 'toFixed(2)=2.67 and Math.round(x*100)/100=2.68 side by side, library 2.68 for both',
      }
    },
  },
]

export default {
  library: 'bigdecimal-string',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
