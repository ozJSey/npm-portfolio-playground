/**
 * v-select-text interaction spec.
 *
 * The one thing this library does — put a real selection on the page — is the
 * one thing jsdom cannot answer for. It implements `Range` and `Selection`
 * faithfully enough for the unit suite, but it has no layout, so it cannot say
 * whether a `display: none` subtree was skipped, whether a collapsed run of
 * whitespace really painted as one space, or whether a click on a token
 * selected the token. Every check below reads
 * `window.getSelection().toString()` back out of a real browser.
 */

/**
 * Selection helpers layered over the runner's `__pg` base. Cards are compiled
 * in the browser, so the stable handle is the card `<section id>`; everything
 * else is read back out of the rendered DOM — via `__pg.stage(file)`, never
 * `sec(file)`, so a lookup cannot reach the card's own chrome instead of the
 * demo (see the note on `stage` in `scripts/interactions.mjs`).
 */
const PRELUDE = `
window.__st = Object.assign(Object.create(window.__pg), {
  /** What the document selection actually holds, whitespace squashed for comparison. */
  sel() { return (window.getSelection()?.toString() ?? '').replace(/\\s+/g, ' ').trim() },
  /** Raw, for the cases where the whitespace IS the assertion. */
  selRaw() { return window.getSelection()?.toString() ?? '' },
  clear() { window.getSelection()?.removeAllRanges() },
  /** The value an <input>/<textarea> has selected — its own, not the document's. */
  fieldSel(el) { return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) },
  /** Click and give Vue a tick to patch. */
  async press(el) { el.click(); await this.sleep(200) },
  /** The data-select-text-copy state attribute of a host. */
  copyState(el) { return el.getAttribute('data-select-text-copy') },
})
'ready'
`

const CHECKS = [
  {
    demo: '01-static-text.vue',
    name: 'a bare-bound <blockquote> selects its own rendered text on mount',
    fn: async () => {
      const quote = __st.stage('01-static-text.vue').querySelector('blockquote')
      const sel = __st.sel()
      return {
        pass: sel.length > 40 && quote.textContent.replace(/\s+/g, ' ').trim().startsWith(sel.slice(0, 40)),
        detail: `selected ${sel.length} chars: "${sel.slice(0, 50)}…"`,
      }
    },
  },
  {
    demo: '01-static-text.vue',
    name: 'detail.text is the rendered view, shorter than raw textContent',
    fn: async () => {
      const s = __st.stage('01-static-text.vue')
      await __st.press(__st.button('01-static-text.vue', 'Re-select'))
      const chip = [...s.querySelectorAll('.pg-chip')].find((c) => __st.txt(c).includes('rendered'))
      const reported = Number(__st.txt(chip).match(/(\d+)\s*$/)?.[1])
      const raw = s.querySelector('blockquote').textContent.length
      const live = __st.selRaw().length
      return {
        pass: reported === live && reported < raw,
        detail: `detail.text=${reported} selection=${live} raw textContent=${raw}`,
      }
    },
  },
  {
    demo: '01-static-text.vue',
    name: 'one Range spans four nested child elements',
    fn: async () => {
      await __st.press(__st.button('01-static-text.vue', 'Select the nested'))
      const sel = __st.sel()
      return {
        pass: sel.startsWith('Ships from Rotterdam') && sel.includes('three') && sel.includes('pallets'),
        detail: `"${sel}"`,
      }
    },
  },
  {
    demo: '01-static-text.vue',
    name: 'the bare binding form selects when it mounts, not before',
    fn: async () => {
      __st.clear()
      const before = __st.sel()
      await __st.press(__st.button('01-static-text.vue', 'Mount a bare binding'))
      return {
        pass: before === '' && __st.sel().includes('no value at all'),
        detail: `before="${before}" after="${__st.sel()}"`,
      }
    },
  },
  {
    demo: '02-match.vue',
    name: 'a match spanning a <strong> boundary selects across it',
    fn: async () => {
      await __st.press(__st.button('02-match.vue', 'Select'))
      return { pass: __st.sel() === 'invoice INV-4821', detail: `"${__st.sel()}"` }
    },
  },
  {
    demo: '02-match.vue',
    name: 'matchIndex: -1 takes the last occurrence',
    fn: async () => {
      const s = __st.stage('02-match.vue')
      const [needle, , index] = s.querySelectorAll('input')
      __st.set(needle, 'invoice')
      __st.set(index, -1)
      await __st.sleep(150)
      await __st.press(__st.button('02-match.vue', 'Select'))
      const sel = __st.sel()
      // The prose is the first <p> on the stage. `indexOf(sel)` cannot answer
      // "which occurrence?" — "invoice" appears four times, so it would always
      // report the first. Measure where the live Range actually starts instead.
      const prose = s.querySelector('p')
      const last = prose.textContent.lastIndexOf('invoice')
      const live = window.getSelection()
      let chosen = -1
      if (live.rangeCount) {
        const r = live.getRangeAt(0)
        const probe = document.createRange()
        probe.setStart(prose, 0)
        probe.setEnd(r.startContainer, r.startOffset)
        chosen = probe.toString().length
      }
      return { pass: sel === 'invoice' && chosen === last, detail: `"${sel}" at ${chosen}, last at ${last}` }
    },
  },
  {
    demo: '02-match.vue',
    name: 'an out-of-range matchIndex selects nothing and fires no event',
    fn: async () => {
      const s = __st.stage('02-match.vue')
      const index = s.querySelectorAll('input')[2]
      __st.set(index, 99)
      await __st.sleep(150)
      __st.clear()
      await __st.press(__st.button('02-match.vue', 'Select'))
      await __st.sleep(250)
      const chip = [...s.querySelectorAll('.pg-chip')].map((c) => __st.txt(c)).join(' | ')
      return { pass: __st.sel() === '' && /no match/i.test(chip), detail: `sel="${__st.sel()}" chips=${chip}` }
    },
  },
  {
    demo: '02-match.vue',
    name: 'a RegExp needle selects a date',
    fn: async () => {
      const s = __st.stage('02-match.vue')
      __st.set(s.querySelector('input[type=checkbox]'), true)
      await __st.sleep(150)
      await __st.press(__st.button('02-match.vue', 'Select'))
      return { pass: /^\d{4}-\d{2}-\d{2}$/.test(__st.sel()), detail: `"${__st.sel()}"` }
    },
  },
  {
    demo: '03-whitespace.vue',
    name: "collapse and preserve disagree at the same offsets",
    fn: async () => {
      await __st.press(__st.button('03-whitespace.vue', 'Select in both'))
      await __st.sleep(300)
      const kv = [...__st.stage('03-whitespace.vue').querySelectorAll('.pg-kv')].map((p) => __st.txt(p))
      const collapsed = kv[0] ?? ''
      const preserved = kv[1] ?? ''
      return {
        pass: collapsed !== preserved && collapsed.includes('"') && preserved.includes('"'),
        detail: `collapse → ${collapsed} | preserve → ${preserved}`,
      }
    },
  },
  {
    demo: '03-whitespace.vue',
    name: 'preserve indexes a white-space: pre block verbatim',
    fn: async () => {
      await __st.press(__st.button('03-whitespace.vue', 'snippet.indexOf'))
      await __st.sleep(250)
      return { pass: __st.selRaw().includes('"version"'), detail: JSON.stringify(__st.selRaw()) }
    },
  },
  {
    demo: '04-click-to-select.vue',
    name: 'nothing fires on mount; a click selects the whole token',
    fn: async () => {
      __st.clear()
      const before = __st.sel()
      const token = __st.stage('04-click-to-select.vue').querySelectorAll('code.token')[0]
      await __st.press(token)
      return {
        pass: before === '' && __st.sel() === 'sk-live-9f3b2c7d41ae4e08b6c5',
        detail: `before="${before}" after="${__st.sel()}"`,
      }
    },
  },
  {
    demo: '04-click-to-select.vue',
    name: 'match narrows the click to the package name',
    fn: async () => {
      const token = __st.stage('04-click-to-select.vue').querySelectorAll('code.token')[3]
      await __st.press(token)
      return { pass: __st.sel() === '@ozjsey/v-select-text', detail: `"${__st.sel()}"` }
    },
  },
  {
    demo: '04-click-to-select.vue',
    name: 'enabled: false detaches the listener rather than ignoring the click',
    fn: async () => {
      const s = __st.stage('04-click-to-select.vue')
      __st.set(s.querySelector('input[type=checkbox]'), false)
      await __st.sleep(200)
      __st.clear()
      await __st.press(s.querySelectorAll('code.token')[0])
      return { pass: __st.sel() === '', detail: `after click with enabled:false → "${__st.sel()}"` }
    },
  },
  {
    demo: '05-nested-range.vue',
    name: 'a flat range crosses several nested inline elements',
    fn: async () => {
      await __st.press(__st.button('05-nested-range.vue', 'Select'))
      const sel = __st.sel()
      const host = __st.stage('05-nested-range.vue').querySelector('.quote')
      // The range has to have crossed real element boundaries, not just sat in
      // one text node: count the inline children the selection actually covers.
      const range = window.getSelection().getRangeAt(0)
      const crossed = [...host.querySelectorAll('strong, em, span, code')].filter((c) =>
        range.intersectsNode(c),
      ).length
      return { pass: sel.length > 20 && crossed >= 2, detail: `"${sel}" crossing ${crossed} inline children` }
    },
  },
  {
    demo: '06-input.vue',
    name: 'an input range lands on the field, through setSelectionRange',
    fn: async () => {
      __st.clear()
      await __st.press(__st.button('06-input.vue', 'Select range'))
      // The demo's text inputs carry no `type` attribute, so match on the
      // property (which defaults to 'text') rather than a CSS attribute selector.
      const input = [...__st.stage('06-input.vue').querySelectorAll('input')].find(
        (i) => i.type === 'text' && i.value.length > 0,
      )
      // Chrome mirrors a focused field's own selection into
      // `window.getSelection()`, so the document selection is not empty here —
      // the assertion is on `selectionStart`/`selectionEnd`, which is the only
      // thing `setSelectionRange` actually moved.
      return {
        pass: !!input && __st.fieldSel(input) === 'World',
        detail: input
          ? `field="${__st.fieldSel(input)}" (document mirrors it: "${__st.sel()}")`
          : 'no populated text input found',
      }
    },
  },
  {
    demo: '07-boolean-edge.vue',
    name: 'holding enabled true across a re-render does not re-select',
    fn: async () => {
      const s = __st.stage('07-boolean-edge.vue')
      await __st.press(__st.button('07-boolean-edge.vue', 'enabled = true'))
      const first = __st.txt(s)
      await __st.press(__st.button('07-boolean-edge.vue', 'Force a re-render'))
      const after = __st.txt(s)
      const fires = [...after.matchAll(/(\d+)\s*fire/g)].map((m) => Number(m[1]))
      return {
        pass: fires.length > 0 && fires.every((n) => n <= 1),
        detail: `fire counts after a re-render: [${fires}] (was "${first.slice(0, 40)}…")`,
      }
    },
  },
  {
    demo: '08-trigger-always.vue',
    name: "'always' re-selects on every update while 'edge' stays put",
    fn: async () => {
      const s = __st.stage('08-trigger-always.vue')
      const btns = [...s.querySelectorAll('button')]
      const always = btns.find((b) => __st.txt(b).includes('always'))
      await __st.press(always)
      const first = __st.sel()
      await __st.press(always)
      const second = __st.sel()
      return { pass: first !== '' && second !== '' && first !== second, detail: `"${first}" → "${second}"` }
    },
  },
  {
    demo: '16-always-copy-loop.vue',
    name: "SEL-5 — 'always' + copy + a state-writing handler makes ONE clipboard write, not thousands",
    fn: async () => {
      // Counts real `navigator.clipboard.writeText` calls. Instrumentation
      // only: the wrapper calls through, and the card is mounting under its own
      // rules — nothing here manufactures the condition.
      //
      // Before the fix this card was measured at ~8,600 real writes a second,
      // indefinitely, with Vue's recursive-update guard silent throughout: the
      // cycle settles in a promise and the guard only sees synchronous
      // re-entry.
      const file = '16-always-copy-loop.vue'
      const s = __st.stage(file)
      let writes = 0
      const real = navigator.clipboard.writeText.bind(navigator.clipboard)
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: (...a) => { writes++; return real(...a) },
      })
      try {
        // The card mounts disarmed — a host that re-selects on every render
        // would otherwise own the document selection for the whole tab. One
        // press arms it, and that press is the first (and should be the only)
        // attempt for this text.
        await __st.press([...s.querySelectorAll('button')].find((b) => __st.txt(b).includes('Arm it')))
        await __st.sleep(400)
        const armed = writes

        // 1.5 s of nothing but the card's own render cycle.
        await __st.sleep(1500)
        const idle = writes - armed

        // 10 re-renders with the text unchanged.
        const rerender = [...s.querySelectorAll('button')].find((b) => __st.txt(b).includes('Re-render'))
        for (let i = 0; i < 10; i++) await __st.press(rerender)
        const afterRerenders = writes

        // One text change — the copy follows the text, so exactly one write.
        const change = [...s.querySelectorAll('button')].find((b) => __st.txt(b).includes('Change the text'))
        await __st.press(change)
        await __st.sleep(400)
        const afterChange = writes

        const attempts = Number(__st.txt(s.querySelector('.count')))
        return {
          pass:
            armed === 1 &&
            idle === 0 &&
            afterRerenders === armed &&
            afterChange === armed + 1 &&
            attempts === 2,
          detail: `arming=${armed} · idle 1.5s=+${idle} · after 10 re-renders=${afterRerenders} · after a text change=${afterChange} · card reports ${attempts} attempt(s)`,
        }
      } finally {
        Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: real })
      }
    },
  },
  {
    demo: '09-contenteditable.vue',
    name: 'a match re-reads the live editable content',
    fn: async () => {
      const s = __st.stage('09-contenteditable.vue')
      const host = s.querySelector('[contenteditable]')
      host.textContent = 'Rename this draft before sharing.'
      await __st.sleep(150)
      const btn = __st.button('09-contenteditable.vue', 'Select') ?? s.querySelectorAll('button')[0]
      await __st.press(btn)
      return { pass: __st.sel().length > 0, detail: `"${__st.sel()}"` }
    },
  },
  {
    demo: '10-composable.vue',
    name: 'select(0, 15) selects exactly the first line',
    fn: async () => {
      await __st.press(__st.button('10-composable.vue', 'select(0, 15)'))
      const ta = __st.stage('10-composable.vue').querySelector('textarea')
      return { pass: __st.fieldSel(ta) === 'First line here', detail: JSON.stringify(__st.fieldSel(ta)) }
    },
  },
  {
    demo: '10-composable.vue',
    name: 'clear() empties the field selection, not just the document one',
    fn: async () => {
      const ta = __st.stage('10-composable.vue').querySelector('textarea')
      await __st.press(__st.button('10-composable.vue', 'select(0, 15)'))
      const before = __st.fieldSel(ta)
      await __st.press(__st.button('10-composable.vue', 'clear()'))
      return { pass: before !== '' && __st.fieldSel(ta) === '', detail: `"${before}" → "${__st.fieldSel(ta)}"` }
    },
  },
  {
    demo: '11-event.vue',
    name: 'detail.kind flips between text and input on one bubbled listener',
    fn: async () => {
      const s = __st.stage('11-event.vue')
      // Both fires use the false → rAF → true edge idiom, so each needs its own
      // frame before the next one is queued.
      await __st.press(__st.button('11-event.vue', 'select all'))
      await __st.sleep(300)
      await __st.press(__st.button('11-event.vue', 'input — 0–5'))
      await __st.sleep(300)
      const log = __st.txt(s.querySelector('.pg-log') ?? s)
      return {
        pass: log.includes('kind=text') && log.includes('kind=input'),
        detail: log.slice(0, 160),
      }
    },
  },
  {
    demo: '13-late-text.vue',
    name: 'an empty host mounting does NOT wipe the selection already on the page',
    fn: async () => {
      // SEL-4's worst symptom: `applyRange` opened with `removeAllRanges()`, so
      // a host that resolved to nothing cleared whatever the user had selected
      // and left a caret in its place.
      await __st.press(__st.button('13-late-text.vue', 'Select this paragraph'))
      const before = __st.sel()
      await __st.press(__st.button('13-late-text.vue', 'Mount it empty'))
      const after = __st.sel()
      return {
        pass: before.length > 40 && after === before,
        detail: `before(${before.length} chars)="${before.slice(0, 40)}…" after(${after.length})="${after.slice(0, 40)}…"`,
      }
    },
  },
  {
    demo: '13-late-text.vue',
    name: 'an empty host fires no select-text at all',
    fn: async () => {
      const s = __st.stage('13-late-text.vue')
      await __st.press(__st.button('13-late-text.vue', 'Mount it empty'))
      await __st.sleep(300)
      const chip = [...s.querySelectorAll('.pg-chip')].map((c) => __st.txt(c)).join(' | ')
      return { pass: /select-text events: 0\b/.test(chip), detail: chip }
    },
  },
  {
    demo: '13-late-text.vue',
    name: 'the text arriving selects it — exactly one event, the edge was never spent',
    fn: async () => {
      const s = __st.stage('13-late-text.vue')
      await __st.press(__st.button('13-late-text.vue', 'Mount it empty'))
      __st.clear()
      await __st.press(__st.button('13-late-text.vue', 'Let the text arrive'))
      await __st.until(() => __st.sel().includes('arrived from the API'), 4000)
      const chip = [...s.querySelectorAll('.pg-chip')].map((c) => __st.txt(c)).join(' | ')
      const sel = __st.sel()
      return {
        pass: sel === 'Text that arrived from the API after mount.' && /select-text events: 1\b/.test(chip),
        detail: `selection="${sel}" ${chip}`,
      }
    },
  },
  {
    demo: '12-unsupported.vue',
    name: 'a plain <div> — the case v2 fixed — now selects',
    fn: async () => {
      const s = __st.stage('12-unsupported.vue')
      const btn = [...s.querySelectorAll('button')].find((b) => /div/i.test(__st.txt(b)))
      __st.clear()
      if (btn) await __st.press(btn)
      return { pass: !btn || __st.sel().length > 0, detail: btn ? `"${__st.sel()}"` : 'no div button on the card' }
    },
  },
  {
    demo: '12-unsupported.vue',
    name: 'a user-select: none host makes a Range that paints nothing',
    fn: async () => {
      const s = __st.stage('12-unsupported.vue')
      const btn = [...s.querySelectorAll('button')].find((b) => /user-select|none/i.test(__st.txt(b)))
      if (!btn) return { pass: false, detail: 'no user-select: none button on the card' }
      __st.clear()
      await __st.press(btn)
      return {
        pass: __st.selRaw() === '',
        detail: `document selection is ${JSON.stringify(__st.selRaw())} — the Range exists, the paint does not`,
      }
    },
  },
]

/* ---------------------------------------------------------------------------
 * Native checks — the clipboard half.
 *
 * Three measurement rules, each of which changed an answer here:
 *
 * 1. `cdp.mjs`'s `page.evaluate` passes `userGesture: true`, which MANUFACTURES
 *    the transient activation these checks exist to measure. Success cases go
 *    through `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`; the
 *    no-activation cases go through `Runtime.evaluate` with
 *    `userGesture: false`.
 * 2. Transient activation survives roughly FIVE SECONDS after a real gesture
 *    (measured: true at +3000 ms, false at +5200 ms). So "deferred into a
 *    setTimeout" is not a no-activation state at all, and any `page.evaluate`
 *    within five seconds of a check contaminates it — including the runner's
 *    own prelude. The checks that need `isActive === false` wait it out.
 * 3. `Browser.grantPermissions(['clipboardReadWrite'])` does not merely let us
 *    read the clipboard back — it GRANTS `clipboard-write`, which is exactly
 *    the check Chrome would otherwise fail. Granted up front it turns every
 *    refusal into a pass. So each check resets permissions, performs the write
 *    under test under Chrome's own rules, and only then grants read to look at
 *    the result. `no-activation + granted` is kept as an explicit control, so
 *    the refusal below is attributable to the activation rule and not to
 *    something else about the page.
 * ------------------------------------------------------------------------ */

const ORIGIN = `http://localhost:${process.env.PORT ?? 5212}`

/** Back to the browser's defaults: no explicit clipboard grant of any kind. */
const resetPermissions = (cdp) => cdp.send('Browser.resetPermissions', {})

/**
 * Grant clipboard read — the measurement instrument, never the subject. Call
 * it AFTER the write under test, or it grants that write its permission too.
 */
async function grantClipboardRead(cdp) {
  await cdp.send('Browser.grantPermissions', {
    origin: ORIGIN,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })
}

/** Refuse the write the way Firefox and Safari refuse it without a gesture. */
const denyClipboardWrite = (cdp) =>
  cdp.send('Browser.setPermission', {
    origin: ORIGIN,
    permission: { name: 'clipboard-write' },
    setting: 'denied',
  })

/** `Runtime.evaluate` WITHOUT the harness's fake activation. */
async function evalNoGesture({ cdp, sessionId }, expression) {
  const res = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true, userGesture: false },
    sessionId,
  )
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
  }
  return res.result.value
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Centre of an element, after scrolling it into view. */
async function centreOf(ctx, expr) {
  const box = await ctx.page.evaluate(`(async () => {
    const el = ${expr}
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    await new Promise((r) => setTimeout(r, 250))
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (!box) throw new Error(`no visible element for ${expr}`)
  return box
}

/** A real, trusted left click — the only kind that carries user activation. */
async function trustedClick(ctx, expr, settle = 400) {
  const { x, y } = await centreOf(ctx, expr)
  const base = { x, y, button: 'left', clickCount: 1 }
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 }, ctx.sessionId)
  await ctx.cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' }, ctx.sessionId)
  await ctx.cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' }, ctx.sessionId)
  await wait(settle)
}

/** A real, trusted key press on whatever is focused. */
async function trustedKey(ctx, { key, code, keyCode, text }) {
  const common = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
  await ctx.cdp.send('Input.dispatchKeyEvent', { ...common, type: 'rawKeyDown' }, ctx.sessionId)
  if (text) await ctx.cdp.send('Input.dispatchKeyEvent', { ...common, type: 'char', text }, ctx.sessionId)
  await ctx.cdp.send('Input.dispatchKeyEvent', { ...common, type: 'keyUp' }, ctx.sessionId)
  await wait(400)
}

/**
 * Put a known value on the real clipboard, so "was it cleared?" is answerable.
 * Uses the harness's own gesture: seeding is scaffolding, not a subject.
 */
async function seedClipboard(ctx, value) {
  const ok = await ctx.page.evaluate(
    `navigator.clipboard.writeText(${JSON.stringify(value)}).then(() => 'ok', (e) => e.name)`,
  )
  if (ok !== 'ok') throw new Error(`could not seed the clipboard: ${ok}`)
}

/** Read the real clipboard, granting read first — never before a write under test. */
async function readClipboard(ctx) {
  await grantClipboardRead(ctx.cdp)
  return ctx.page.evaluate(
    `navigator.clipboard.readText().then((t) => t, (e) => 'UNREADABLE:' + e.name)`,
  )
}

const TOKEN = 'sk-live-9f3b2c7d41ae4e08b6c5'
const CARD14 = `document.querySelector('section[id="demo-14-copy-on-select.vue"] .demo__stage')`
const CARD15 = `document.querySelector('section[id="demo-15-copy-activation.vue"] .demo__stage')`
const TOKEN15 = 'TOKEN-ACTIVATION-DEMO-4821'

/** Newest row of card 15's log, whitespace squashed. */
const topRow = (ctx) =>
  ctx.page.evaluate(`(${CARD15}.querySelector('.log li')?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)

const copyAttr15 = (ctx) =>
  ctx.page.evaluate(`${CARD15}.querySelector('.subject').getAttribute('data-select-text-copy')`)

/** The card-15 button whose label contains `needle`, as an expression. */
const btn15 = (needle) =>
  `[...${CARD15}.querySelectorAll('button')].find((b) => b.textContent.includes('${needle}'))`

const NATIVE_CHECKS = [
  {
    demo: '14-copy-on-select.vue',
    name: 'a REAL click copies the token to the REAL clipboard',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      await trustedClick(ctx, `${CARD14}.querySelectorAll('code.token')[0]`)
      const state = await ctx.page.evaluate(
        `${CARD14}.querySelectorAll('code.token')[0].getAttribute('data-select-text-copy')`,
      )
      const clip = await readClipboard(ctx)
      return {
        pass: clip === TOKEN && state === 'copied',
        detail: `clipboard=${JSON.stringify(clip)} data-select-text-copy=${state}`,
      }
    },
  },
  {
    demo: '14-copy-on-select.vue',
    name: 'the clipboard holds the RENDERED view, not raw textContent',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      // The fourth token carries a `display: none` fragment, so `textContent`
      // and the resolved view are provably different strings — and the part
      // the reader cannot see must not reach the clipboard.
      const raw = await ctx.page.evaluate(`${CARD14}.querySelectorAll('code.token')[3].textContent`)
      await trustedClick(ctx, `${CARD14}.querySelectorAll('code.token')[3]`)
      const clip = await readClipboard(ctx)
      return {
        pass:
          clip === 'ORD-2026-0917 · 2 pallets' &&
          raw.includes('-INTERNAL-DRAFT') &&
          !clip.includes('INTERNAL'),
        detail: `clipboard=${JSON.stringify(clip)} textContent=${JSON.stringify(raw)}`,
      }
    },
  },
  {
    demo: '14-copy-on-select.vue',
    name: 'match narrows what is copied, not just what is selected',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await trustedClick(ctx, `${CARD14}.querySelectorAll('code.token')[2]`)
      const sel = await ctx.page.evaluate(`(window.getSelection()?.toString() ?? '')`)
      const clip = await readClipboard(ctx)
      return {
        pass: clip === '@ozjsey/v-select-text' && sel === '@ozjsey/v-select-text',
        detail: `clipboard=${JSON.stringify(clip)} selection=${JSON.stringify(sel)}`,
      }
    },
  },
  {
    demo: '14-copy-on-select.vue',
    name: 'Enter on the focused host copies — trigger: click is not mouse-only',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      const attrs = await ctx.page.evaluate(`(() => {
        const el = ${CARD14}.querySelectorAll('code.token')[0]
        el.scrollIntoView({ block: 'center' })
        el.focus()
        return {
          tabindex: el.getAttribute('tabindex'),
          role: el.getAttribute('role'),
          focused: document.activeElement === el,
        }
      })()`)
      await trustedKey(ctx, { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' })
      const clip = await readClipboard(ctx)
      return {
        pass: attrs.tabindex === '0' && attrs.role === 'button' && attrs.focused && clip === TOKEN,
        detail: `tabindex=${attrs.tabindex} role=${attrs.role} focused=${attrs.focused} clipboard=${JSON.stringify(clip)}`,
      }
    },
  },
  {
    demo: '14-copy-on-select.vue',
    name: 'Space copies too, without scrolling the page',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      await ctx.page.evaluate(`(() => {
        const el = ${CARD14}.querySelectorAll('code.token')[1]
        el.scrollIntoView({ block: 'center' })
        el.focus()
      })()`)
      const scrollBefore = await ctx.page.evaluate('window.scrollY')
      await trustedKey(ctx, { key: ' ', code: 'Space', keyCode: 32, text: ' ' })
      const scrollAfter = await ctx.page.evaluate('window.scrollY')
      const clip = await readClipboard(ctx)
      return {
        pass: clip.startsWith('4d9a1f6c8b27') && scrollAfter === scrollBefore,
        detail: `clipboard=${JSON.stringify(clip)} scrollY ${scrollBefore} → ${scrollAfter}`,
      }
    },
  },
  {
    demo: '15-copy-activation.vue',
    name: 'a flip inside a real click handler keeps the activation and copies',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      await trustedClick(ctx, btn15('inside the handler'))
      const row = await topRow(ctx)
      const attr = await copyAttr15(ctx)
      const clip = await readClipboard(ctx)
      return {
        pass: /activation at flip: true/.test(row) && /copied/.test(row) && clip === TOKEN15 && attr === 'copied',
        detail: `row="${row}" clipboard=${JSON.stringify(clip)} attr=${attr}`,
      }
    },
  },
  {
    demo: '15-copy-activation.vue',
    name: 'a 250 ms timer does NOT lose the activation — the folklore is wrong',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      await trustedClick(ctx, btn15('250 ms'), 1200)
      const row = await topRow(ctx)
      const clip = await readClipboard(ctx)
      return {
        pass: /activation at flip: true/.test(row) && /copied/.test(row) && clip === TOKEN15,
        detail: `row="${row}" clipboard=${JSON.stringify(clip)}`,
      }
    },
  },
  {
    demo: '15-copy-activation.vue',
    name: 'past the 5 s window the activation is gone and CHROME refuses the write',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      // Nothing may call `page.evaluate` between the click and the flip: the
      // harness's own gesture would re-arm the activation under measurement.
      await trustedClick(ctx, btn15('past the window'), 0)
      await wait(9000)
      const row = await topRow(ctx)
      const attr = await copyAttr15(ctx)
      const clip = await readClipboard(ctx)
      return {
        // This is the whole ticket in one line: the refusal is real in Chrome,
        // it names the cause, and the clipboard the user already had is intact.
        pass:
          /activation at flip: false/.test(row) &&
          /refused \(no-user-activation\)/.test(row) &&
          attr === 'error' &&
          clip === 'PRE-SEEDED',
        detail: `row="${row}" attr=${attr} clipboard=${JSON.stringify(clip)}`,
      }
    },
  },
  {
    demo: '15-copy-activation.vue',
    name: 'control — the same no-activation write SUCCEEDS once clipboard-write is granted',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      // Same gesture-free path as the check above, with the one variable
      // changed. Without this control, "refused" could be any of a dozen
      // things about a headless tab; with it, the cause is the activation rule.
      await grantClipboardRead(ctx.cdp)
      await trustedClick(ctx, btn15('past the window'), 0)
      await wait(9000)
      const row = await topRow(ctx)
      const clip = await readClipboard(ctx)
      return {
        pass: /activation at flip: false/.test(row) && /copied/.test(row) && clip === TOKEN15,
        detail: `row="${row}" clipboard=${JSON.stringify(clip)}`,
      }
    },
  },
  {
    demo: '15-copy-activation.vue',
    name: 'a refused copy reports why, marks the host, and leaves the clipboard intact',
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await seedClipboard(ctx, 'PRE-SEEDED')
      // The Firefox/Safari refusal, reproduced deterministically: Chrome will
      // not refuse a focused active tab for lack of a gesture, so the
      // permission itself is denied instead.
      await denyClipboardWrite(ctx.cdp)
      await trustedClick(ctx, btn15('inside the handler'))
      const row = await topRow(ctx)
      const attr = await copyAttr15(ctx)
      const clip = await readClipboard(ctx)
      return {
        pass:
          /refused \((denied|no-user-activation)\)/.test(row) &&
          attr === 'error' &&
          clip === 'PRE-SEEDED',
        detail: `row="${row}" attr=${attr} clipboard=${JSON.stringify(clip)}`,
      }
    },
  },
  {
    demo: '15-copy-activation.vue',
    name: "with no gesture at all the refusal reason is 'no-user-activation', not 'denied'",
    async run(ctx) {
      await resetPermissions(ctx.cdp)
      await denyClipboardWrite(ctx.cdp)
      // The runner's own prelude runs through `page.evaluate`, which carries a
      // gesture — and it lasts five seconds. Wait it out, or this measures the
      // harness.
      await wait(5600)
      const active = await evalNoGesture(ctx, 'navigator.userActivation.isActive')
      await evalNoGesture(ctx, `(async () => {
        ${btn15('inside the handler')}.click()
        await new Promise((r) => setTimeout(r, 900))
      })()`)
      const row = await topRow(ctx)
      return {
        pass: active === false && /refused \(no-user-activation\)/.test(row),
        detail: `isActive before the flip=${active} row="${row}"`,
      }
    },
  },
]

export default {
  library: '@ozjsey/v-select-text',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
