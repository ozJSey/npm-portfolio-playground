/**
 * `v-copy` interaction checks.
 *
 * Everything here is a **nativeCheck**, and that is not a style choice.
 *
 *  - A copy is only real if the REAL clipboard changed, so every check reads it
 *    back with `navigator.clipboard.readText()` after granting the origin
 *    `clipboardReadWrite` — a rendered "Copied!" proves the directive set a
 *    class, not that anything reached the system clipboard.
 *  - Clicks go through `Input.dispatchMouseEvent`, never `el.click()`.
 *    `cdp.mjs`'s `page.evaluate` passes `userGesture: true`, which grants ~5s
 *    of transient activation; a copy fired from inside that window would prove
 *    nothing about the trigger. Trusted input sidesteps the question (PG-10).
 *  - Every REFUSAL check carries a positive control in the same page load — it
 *    copies something successfully first, then asserts the refusal left that
 *    value in place. Without it, "the clipboard did not change" would also pass
 *    if the write had simply failed, which is the exact false green this file
 *    exists to avoid.
 */
import { setTimeout as sleep } from 'node:timers/promises'

const PERMS = ['clipboardReadWrite', 'clipboardSanitizedWrite']

/** Read the page's DOM without asking for a fake gesture. */
async function read(ctx, fn, ...args) {
  const res = await ctx.cdp.send(
    'Runtime.evaluate',
    {
      expression: `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    },
    ctx.sessionId,
  )
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
  }
  return res.result.value
}

async function grant(ctx) {
  // The tab can still be on `about:blank` for a beat after a navigation, and an
  // opaque origin cannot be granted anything — `Browser.grantPermissions` then
  // throws and the check fails for a reason that has nothing to do with the
  // behaviour under test. Observed once in a dist run; wait for a real origin.
  let origin = ''
  for (let i = 0; i < 20 && !origin.startsWith('http'); i++) {
    if (i) await sleep(100)
    origin = (await read(ctx, () => location.origin)) ?? ''
  }
  if (!origin.startsWith('http')) throw new Error(`page never left about:blank (origin ${JSON.stringify(origin)})`)
  await ctx.cdp.send('Browser.grantPermissions', { origin, permissions: PERMS })
}

const clipboard = (ctx) => read(ctx, () => navigator.clipboard.readText())


/** Text of the first `sel` inside a card's own stage — never the card chrome. */
const stageText = (ctx, demo, sel) =>
  read(
    ctx,
    (d, s) =>
      document.querySelector(`section[id="demo-${d}"] .demo__stage`)?.querySelector(s)?.textContent?.trim() ?? null,
    demo,
    sel,
  )

/** Centre of the nth `sel` inside a card's stage, scrolled into view. */
async function centre(ctx, demo, sel, nth = 0) {
  const box = await read(
    ctx,
    (d, s, n) => {
      const stage = document.querySelector(`section[id="demo-${d}"] .demo__stage`)
      if (!stage) return { err: 'no stage' }
      const el = stage.querySelectorAll(s)[n]
      if (!el) return { err: `no ${s}[${n}]` }
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    },
    demo,
    sel,
    nth,
  )
  if (box.err) throw new Error(`${demo} ${sel}[${nth}]: ${box.err}`)
  return box
}

/** A trusted click. Nothing in this file uses `el.click()`. */
async function click(ctx, demo, sel, nth = 0) {
  const { x, y } = await centre(ctx, demo, sel, nth)
  const common = { x, y, button: 'left', buttons: 1, clickCount: 1 }
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common }, ctx.sessionId)
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common, buttons: 0 }, ctx.sessionId)
  await sleep(170)
}

/** Trusted click on the `tag` inside a card whose text contains `needle`. */
async function clickText(ctx, demo, needle, tag = 'button') {
  const nth = await read(
    ctx,
    (d, n, t) => {
      const stage = document.querySelector(`section[id="demo-${d}"] .demo__stage`)
      return [...(stage?.querySelectorAll(t) ?? [])].findIndex((e) => e.textContent.includes(n))
    },
    demo,
    needle,
    tag,
  )
  if (nth < 0) throw new Error(`${demo}: no ${tag} containing ${JSON.stringify(needle)}`)
  await click(ctx, demo, tag, nth)
}

/**
 * Drag a REAL text selection across the first occurrence of `needle`, with
 * trusted input, and return what the browser ended up selecting.
 *
 * The range's own box gives exact pixel endpoints, so the drag selects the
 * characters it means to rather than whatever a guessed offset lands on. The
 * existing selection is cleared first: a press that starts INSIDE a selection
 * begins a drag-and-drop of it, not a new selection — which silently produced
 * an empty selection, and a check that passed for the wrong reason, while this
 * file was being written.
 */
async function dragSelect(ctx, demo, sel, needle, nth = 0) {
  const box = await read(
    ctx,
    (d, s, n, wanted) => {
      const stage = document.querySelector(`section[id="demo-${d}"] .demo__stage`)
      if (!stage) return { err: 'no stage' }
      const el = stage.querySelectorAll(s)[n]
      if (!el) return { err: `no ${s}[${n}]` }
      el.scrollIntoView({ block: 'center' })
      window.getSelection().removeAllRanges()
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.data.indexOf(wanted)
        if (i < 0) continue
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + wanted.length)
        const r = range.getBoundingClientRect()
        return { x1: r.left, x2: r.right, y: r.top + r.height / 2 }
      }
      return { err: `no text node containing ${JSON.stringify(wanted)}` }
    },
    demo,
    sel,
    nth,
    needle,
  )
  if (box.err) throw new Error(`${demo} ${sel}: ${box.err}`)

  const send = (type, x, y, buttons) =>
    ctx.cdp.send(
      'Input.dispatchMouseEvent',
      { type, x, y, button: buttons ? 'left' : 'none', buttons, clickCount: 1 },
      ctx.sessionId,
    )
  await send('mouseMoved', box.x1, box.y, 0)
  await send('mousePressed', box.x1, box.y, 1)
  for (let i = 1; i <= 8; i++) {
    await send('mouseMoved', box.x1 + ((box.x2 - box.x1) * i) / 8, box.y, 1)
    await sleep(12)
  }
  await send('mouseReleased', box.x2, box.y, 0)
  await sleep(90)
  return read(ctx, () => window.getSelection().toString())
}

/** What the document currently has selected. */
const selection = (ctx) => read(ctx, () => window.getSelection().toString())

/** Trusted key press. `text` makes it a character-producing key (Enter needs it). */
async function pressKey(ctx, { key, code, keyCode, modifiers = 0, text }) {
  const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers }
  await ctx.cdp.send(
    'Input.dispatchKeyEvent',
    { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) },
    ctx.sessionId,
  )
  await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, ctx.sessionId)
  await sleep(40)
}

const shiftRight = (ctx, times) => {
  const one = () => pressKey(ctx, { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, modifiers: 8 })
  return Array.from({ length: times }).reduce((p) => p.then(one), Promise.resolve())
}

const tab = (ctx) => pressKey(ctx, { key: 'Tab', code: 'Tab', keyCode: 9 })
const enter = (ctx) => pressKey(ctx, { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' })

/** A stable description of what has focus, for tab-until assertions. */
const focused = (ctx) =>
  read(ctx, () => {
    const el = document.activeElement
    if (!el) return 'none'
    return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`
  })

/** Put a collapsed caret at the start of an element's text — the keys do the selecting. */
const caretAtStart = (ctx, demo, sel) =>
  read(
    ctx,
    (d, s) => {
      const el = document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelector(s)
      el.scrollIntoView({ block: 'center' })
      el.focus()
      const range = document.createRange()
      range.setStart(el.firstChild, 0)
      range.collapse(true)
      const sel2 = window.getSelection()
      sel2.removeAllRanges()
      sel2.addRange(range)
      return document.activeElement === el
    },
    demo,
    sel,
  )

/**
 * Put a sentinel on the REAL clipboard and confirm it landed.
 *
 * The system clipboard outlives a page load, so a check that asserts
 * `clipboard === 'the expected text'` also passes when an EARLIER check left
 * that exact value there and this one copied nothing. Priming first is what
 * makes the assertion mean "this copy happened".
 *
 * Writing the sentinel is not the behaviour under test and does not go near the
 * directive — `clipboardSanitizedWrite` is granted, so no user activation, real
 * or faked, is involved.
 */
async function prime(ctx, value) {
  await grant(ctx)
  const landed = await read(
    ctx,
    async (v) => {
      await navigator.clipboard.writeText(v)
      return navigator.clipboard.readText()
    },
    value,
  )
  if (landed !== value) throw new Error(`could not prime the clipboard (got ${JSON.stringify(landed)})`)
  return value
}

/** First line of a card's `<pre>` log. */
const lastLog = async (ctx, demo) => (await stageText(ctx, demo, 'pre')).split('\n')[0]

/** Every non-blank line of a card's `<pre>` log, newest-first as rendered. */
const logLines = async (ctx, demo) =>
  (await stageText(ctx, demo, 'pre'))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** Trimmed text of EVERY `sel` inside a card's own stage, in document order. */
const stageTexts = (ctx, demo, sel) =>
  read(
    ctx,
    (d, s) =>
      [...document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelectorAll(s)].map((e) =>
        (e.textContent ?? '').trim(),
      ),
    demo,
    sel,
  )

/** Trimmed text of the nth `sel` inside a card's stage. */
const stageTextNth = async (ctx, demo, sel, nth) => (await stageTexts(ctx, demo, sel))[nth] ?? null

/**
 * Drive a `v-model`-bound control and let Vue see it — `__pg.set` from the
 * harness prelude, which dispatches the `input`+`change` pair Vue listens for.
 * Returns the control's value afterwards so a failure can say what it set.
 */
const setControl = (ctx, demo, sel, value) =>
  read(
    ctx,
    (d, s, v) => {
      const el = document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelector(s)
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      window.__pg.set(el, v)
      return el.value
    },
    demo,
    sel,
    value,
  )

/**
 * What has focus — with enough of its text to tell two same-classed siblings
 * apart, which `focused()` above cannot do (three `span.target`s on card 10).
 */
const focusInfo = (ctx) =>
  read(ctx, () => {
    const el = document.activeElement
    if (!el) return { tag: 'none', cls: '', text: '' }
    return {
      tag: el.tagName.toLowerCase(),
      cls: [...el.classList].join('.'),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 34),
    }
  })

/** Trusted Space. `text` makes it character-producing, so `e.key` is `' '`. */
const space = (ctx) => pressKey(ctx, { key: ' ', code: 'Space', keyCode: 32, text: ' ' })

/**
 * Park the virtual pointer in the corner.
 *
 * `Input.dispatchMouseEvent` leaves the pointer wherever it released, so a
 * just-clicked button stays `:hover`ed — and `.pg-btn:hover:not(:disabled)`
 * (0,3,0) ties with a demo's scoped `.flash-host.flash[data-v-…]`. Reading a
 * background colour under that tie measures the cascade, not the directive.
 */
const unhover = (ctx) =>
  ctx.cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: 2, y: 2, button: 'none', buttons: 0 },
    ctx.sessionId,
  )

/** The number of clicks the counting parent on card 8 has seen. */
const countIn = (ctx, demo, sel, label) =>
  read(
    ctx,
    (d, s, l) => {
      const stage = document.querySelector(`section[id="demo-${d}"] .demo__stage`)
      const el = [...stage.querySelectorAll(s)].find((e) => e.textContent.includes(l))
      if (!el) return null
      const m = new RegExp(`${l}\\s*(\\d+)`).exec(el.textContent)
      return m ? Number(m[1]) : null
    },
    demo,
    sel,
    label,
  )

const NATIVE_CHECKS = [
  {
    demo: '01-bare.vue',
    name: 'a bare binding puts textContent on the REAL clipboard and flashes [data-copied]',
    async run(ctx) {
      await grant(ctx)
      await click(ctx, '01-bare.vue', 'li', 1)
      const copied = await read(ctx, () =>
        !!document.querySelector('section[id="demo-01-bare.vue"] .demo__stage li[data-copied]'),
      )
      const text = await clipboard(ctx)
      return { pass: text === 'grace@hopper.dev' && copied, detail: `clipboard="${text}" data-copied=${copied}` }
    },
  },
  {
    demo: '03-history.vue',
    name: 'history records newest-first and a repeat promotes rather than appends',
    async run(ctx) {
      await grant(ctx)
      await click(ctx, '03-history.vue', '.rows li', 0)
      await click(ctx, '03-history.vue', '.rows li', 1)
      await click(ctx, '03-history.vue', '.rows li', 0) // repeat — dedupe should promote
      const rows = await read(ctx, () =>
        [...document.querySelectorAll('section[id="demo-03-history.vue"] .demo__stage .log li')].map((l) =>
          l.textContent.trim(),
        ),
      )
      return {
        pass: rows.length === 2 && rows[0] === 'ada@lovelace.dev' && rows[1] === 'grace@hopper.dev',
        detail: `history=${JSON.stringify(rows)}`,
      }
    },
  },
  {
    demo: '13-history-picker.vue',
    name: 'picking an older history row re-copies it and promotes it to the top',
    async run(ctx) {
      await grant(ctx)
      await click(ctx, '13-history-picker.vue', 'code.val', 0) // ada@lovelace.dev
      await click(ctx, '13-history-picker.vue', 'code.val', 2) // 9f2c1ab
      const before = await clipboard(ctx)
      await clickText(ctx, '13-history-picker.vue', 'Copy again')
      await sleep(220)
      await click(ctx, '13-history-picker.vue', '.menu .row', 1) // the OLDER row
      const after = await clipboard(ctx)
      const top = await stageText(ctx, '13-history-picker.vue', '.menu .row .row__text')
      return {
        pass: before === '9f2c1ab' && after === 'ada@lovelace.dev' && top === 'ada@lovelace.dev',
        detail: `before="${before}" after="${after}" top-row="${top}"`,
      }
    },
  },
  {
    demo: '14-nothing-to-copy.vue',
    name: 'a null binding is refused and never copies the element label',
    async run(ctx) {
      await grant(ctx)
      const D = '14-nothing-to-copy.vue'
      await clickText(ctx, D, 'Copy token')
      const refusal = (await stageText(ctx, D, 'pre')).split('\n')[0]
      const untouched = await clipboard(ctx)
      // Positive control, same load: the identical binding copies once it lands.
      await clickText(ctx, D, 'Load the token')
      await clickText(ctx, D, 'Copy token')
      const landed = await clipboard(ctx)
      return {
        pass:
          refusal === 'refused — error: "pending"' &&
          !untouched.includes('MUST-NOT') &&
          untouched !== 'Copy token (null — not loaded)' &&
          landed === 'sk-live-4417',
        detail: `refusal=${JSON.stringify(refusal)} beforeClipboard=${JSON.stringify(untouched)} after=${JSON.stringify(landed)}`,
      }
    },
  },
  {
    demo: '14-nothing-to-copy.vue',
    name: 'an empty binding leaves the previous clipboard value in place',
    async run(ctx) {
      await grant(ctx)
      const D = '14-nothing-to-copy.vue'
      // Positive control FIRST: put a known value on the real clipboard.
      await clickText(ctx, D, 'Load the token')
      await clickText(ctx, D, 'Copy token')
      const primed = await clipboard(ctx)
      await clickText(ctx, D, 'Empty string')
      const after = await clipboard(ctx)
      const refusal = (await stageText(ctx, D, 'pre')).split('\n')[0]
      const flashed = await read(
        ctx,
        (d) =>
          !![...document.querySelectorAll(`section[id="demo-${d}"] .demo__stage button`)].find(
            (b) => b.textContent.includes('Empty string') && b.hasAttribute('data-copied'),
          ),
        D,
      )
      return {
        pass: primed === 'sk-live-4417' && after === 'sk-live-4417' && refusal === 'refused — error: "empty"' && !flashed,
        detail: `primed=${JSON.stringify(primed)} after=${JSON.stringify(after)} refusal=${JSON.stringify(refusal)} data-copied=${flashed}`,
      }
    },
  },
  {
    demo: '14-nothing-to-copy.vue',
    name: 'the config form refuses an explicitly absent source',
    async run(ctx) {
      await grant(ctx)
      const D = '14-nothing-to-copy.vue'
      await clickText(ctx, D, 'Load the token')
      await clickText(ctx, D, 'Copy token')
      const primed = await clipboard(ctx)
      await clickText(ctx, D, 'Config form')
      const refused = await clipboard(ctx)
      const reason = (await stageText(ctx, D, 'pre')).split('\n')[0]
      // Positive control: give it a value and the same binding copies.
      await clickText(ctx, D, 'Give it a value')
      await clickText(ctx, D, 'Config form')
      const landed = await clipboard(ctx)
      return {
        pass:
          primed === 'sk-live-4417' &&
          refused === 'sk-live-4417' &&
          reason === 'refused — error: "pending"' &&
          landed === 'cfg-9f2c1ab',
        detail: `refused=${JSON.stringify(refused)} reason=${JSON.stringify(reason)} landed=${JSON.stringify(landed)}`,
      }
    },
  },
  {
    demo: '05-controller.vue',
    name: 'a frozen config object mounts and copies — the 1.1.0 TypeError negative control',
    async run(ctx) {
      await grant(ctx)
      const D = '05-controller.vue'
      // The card would not have rendered at all in 1.1.0: `Object.freeze` on a
      // config object threw `Cannot add property history` out of `mounted`.
      const mounted = await read(
        ctx,
        (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage code.frozen`),
        D,
      )
      await click(ctx, D, 'code.frozen')
      const text = await clipboard(ctx)
      return {
        pass: mounted && text === 'frozen-config-token',
        detail: `frozen-element-mounted=${mounted} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '05-controller.vue',
    name: 'ctrl.disabled written from a timer stops the copy with nothing re-rendering',
    async run(ctx) {
      await grant(ctx)
      const D = '05-controller.vue'
      // Positive control + sentinel in one: a known value on the real clipboard
      // from the OTHER element, so "did not copy" cannot pass on a failed write.
      await click(ctx, D, 'code.frozen')
      const primed = await clipboard(ctx)

      await clickText(ctx, D, 'Revoke in 1.2s')
      await sleep(1600) // the timer writes ctrl.disabled — no click, no render
      await click(ctx, D, 'code.snippet')
      const whileRevoked = await clipboard(ctx)
      const flashed = await read(
        ctx,
        (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage code.snippet[data-copied]`),
        D,
      )

      // …and back: re-enabling is the same write in reverse, also render-free.
      await clickText(ctx, D, 'Reinstate')
      await click(ctx, D, 'code.snippet')
      const after = await clipboard(ctx)

      return {
        pass:
          primed === 'frozen-config-token' &&
          whileRevoked === 'frozen-config-token' &&
          !flashed &&
          after === 'npm install @ozjsey/v-copy',
        detail: `primed=${JSON.stringify(primed)} whileRevoked=${JSON.stringify(whileRevoked)} flashed=${flashed} afterReinstate=${JSON.stringify(after)}`,
      }
    },
  },
  {
    demo: '13-history-picker.vue',
    name: 'ctrl.last follows the sink — a row picked by a second binding updates it',
    async run(ctx) {
      await grant(ctx)
      const D = '13-history-picker.vue'
      await click(ctx, D, 'code.val', 0) // ada@lovelace.dev
      await click(ctx, D, 'code.val', 2) // 9f2c1ab
      const before = await stageText(ctx, D, '.pg-chip.last')
      await clickText(ctx, D, 'Copy again')
      await sleep(220)
      await click(ctx, D, '.menu .row', 1) // the OLDER row — a config binding, not the controller
      const after = await stageText(ctx, D, '.pg-chip.last')
      const onClipboard = await clipboard(ctx)
      return {
        pass: before === 'last 9f2c1ab' && after === 'last ada@lovelace.dev' && onClipboard === 'ada@lovelace.dev',
        detail: `before=${JSON.stringify(before)} after=${JSON.stringify(after)} clipboard=${JSON.stringify(onClipboard)}`,
      }
    },
  },
  {
    demo: '15-dedupe-scope.vue',
    name: "dedupe compares text, not labels — one row and the newest label wins",
    async run(ctx) {
      await grant(ctx)
      const D = '15-dedupe-scope.vue'
      await click(ctx, D, 'td', 0) // row 1 primary
      await click(ctx, D, 'td', 1) // row 1 backup — same address
      const log = await stageText(ctx, D, 'pre')
      const text = await clipboard(ctx)
      return {
        pass: log === '[backup] ok  ada@lovelace.dev' && text === 'ada@lovelace.dev',
        detail: `log=${JSON.stringify(log)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '15-dedupe-scope.vue',
    name: "dedupe scope:'key' keeps one row per label",
    async run(ctx) {
      await grant(ctx)
      const D = '15-dedupe-scope.vue'
      await click(ctx, D, 'input[value="key"]')
      await sleep(150)
      await click(ctx, D, 'td', 0)
      await click(ctx, D, 'td', 1)
      const log = await stageText(ctx, D, 'pre')
      return {
        pass: log === '[backup] ok  ada@lovelace.dev\n[primary] ok  ada@lovelace.dev',
        detail: `log=${JSON.stringify(log)}`,
      }
    },
  },
  {
    demo: '09-disabled-trigger.vue',
    name: "trigger: 'keydown' — the host is reachable by Tab, and a real key press copies",
    async run(ctx) {
      // The regression this exists for: the Enter/Space handler and the
      // tabindex/role were gated on one condition, so a key-shaped trigger lost
      // both. Skipping the handler is right (the trigger listener is already on
      // that key); skipping the tab stop left a <span> no keyboard could reach,
      // which is the only device a `keydown` trigger has. Focus is exactly the
      // thing jsdom cannot settle, so it is settled here: a real tab order,
      // walked with trusted Tab presses.
      //
      // The ONE check in this file that does not end at `navigator.clipboard
      // .readText()`, and the exception is measured rather than casual. A read
      // issued after this card's key-driven copy stalls the renderer itself —
      // even an evaluate raced against a page-side `setTimeout` never comes
      // back, so the harness dies on a 30s timeout and takes the rest of the
      // run with it (six runs out of ten while this was written; a macOS
      // pasteboard contended by another Chrome is the likeliest cause, and the
      // click-driven checks below still read it back fine).
      //
      // `[data-copied]` is not the usual "it rendered something" consolation
      // prize here: `execute.ts` calls `flagCopied` only after `runCopy`
      // resolved `ok`, i.e. after `navigator.clipboard.writeText()` itself
      // resolved. It is evidence the write happened, one step short of reading
      // the bytes back — and the bytes are read back for this library by the
      // eight clipboard checks that follow.
      const D = '09-disabled-trigger.vue'
      await grant(ctx)
      const attrs = await read(
        ctx,
        (d) => {
          const el = document.querySelector(`section[id="demo-${d}"] .demo__stage span.keyed`)
          return { tabindex: el?.getAttribute('tabindex') ?? null, role: el?.getAttribute('role') ?? null }
        },
        D,
      )

      // Enter the card's tab order at its first control, then walk forward with
      // trusted Tab presses — an element with no tab stop is simply never
      // reached, which is the whole assertion.
      await click(ctx, D, 'input[type="checkbox"]')
      let where = await focused(ctx)
      let tabs = 0
      for (; tabs < 8 && !where.includes('keyed'); tabs++) {
        await tab(ctx)
        where = await focused(ctx)
      }

      // Before: the same host must NOT be copying already, or "it copied" below
      // would pass on a stale flash rather than on this key press.
      const before = await read(
        ctx,
        (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage span.keyed[data-copied]`),
        D,
      )
      await enter(ctx)
      await sleep(220)
      const flashed = await read(
        ctx,
        (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage span.keyed[data-copied]`),
        D,
      )
      return {
        pass: attrs.tabindex === '0' && attrs.role === 'button' && where.includes('keyed') && !before && flashed,
        detail: `tabindex=${JSON.stringify(attrs.tabindex)} role=${JSON.stringify(attrs.role)} focusAfter${tabs}Tabs=${where} copiedBefore=${before} copiedAfterEnter=${flashed}`,
      }
    },
  },
  // -- COPY-5: the user's own selection --------------------------------------
  {
    demo: '16-user-selection.vue',
    name: 'the press on a non-interactive trigger really does destroy the selection (the premise)',
    async run(ctx) {
      const D = '16-user-selection.vue'
      const dragged = await dragSelect(ctx, D, '.prose', 'first algorithm')
      const beforePress = await selection(ctx)
      await click(ctx, D, 'span.chip')
      const afterPress = await selection(ctx)
      // If this ever goes green-to-red, the browser stopped collapsing and the
      // check below no longer proves the capture — read the detail, do not
      // "fix" it by deleting the assertion.
      return {
        pass: dragged === 'first algorithm' && beforePress === 'first algorithm' && afterPress === '',
        detail: `dragged=${JSON.stringify(dragged)} beforePress=${JSON.stringify(beforePress)} afterPress=${JSON.stringify(afterPress)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: 'a dragged selection reaches the REAL clipboard from a <span> trigger, which loses it',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-span')
      const D = '16-user-selection.vue'
      const dragged = await dragSelect(ctx, D, '.prose', 'first algorithm')
      await click(ctx, D, 'span.chip')
      const text = await clipboard(ctx)
      const flashed = await read(
        ctx,
        (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage span.chip[data-copied]`),
        D,
      )
      return {
        pass: dragged === 'first algorithm' && text === 'first algorithm' && flashed,
        detail: `sentinel=${sentinel} dragged=${JSON.stringify(dragged)} clipboard=${JSON.stringify(text)} data-copied=${flashed}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: '`.selection.once` on a <span> copies on the first press — the latch must not eat the snapshot',
    async run(ctx) {
      // The regression this exists for: `.once` detaches every listener INSIDE
      // the click it is latching, and on a non-interactive host the snapshot
      // taken on the press is the only text left by then — the live selection
      // is already collapsed. A teardown that dropped the snapshot refused the
      // single copy `.once` exists to make, and the failure is invisible from
      // jsdom, which never collapses anything.
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-once')
      const D = '16-user-selection.vue'

      const dragged = await dragSelect(ctx, D, '.prose', 'first algorithm')
      await click(ctx, D, 'span.latch')
      const firstPress = await clipboard(ctx)

      // Latched: a second press with a DIFFERENT selection must leave the
      // clipboard exactly as the first press left it, and the injected a11y
      // attributes must be gone with the listeners.
      const dragged2 = await dragSelect(ctx, D, '.prose', 'Ada Lovelace')
      await click(ctx, D, 'span.latch')
      const secondPress = await clipboard(ctx)
      const stripped = await read(
        ctx,
        (d) => {
          const el = document.querySelector(`section[id="demo-${d}"] .demo__stage span.latch`)
          return !el.hasAttribute('tabindex') && !el.hasAttribute('role')
        },
        D,
      )

      // Re-arm mounts a fresh element, so the latch is per-element and the
      // card is not dead for the rest of the page load.
      await click(ctx, D, 'button.ghost')
      await dragSelect(ctx, D, '.prose', 'Ada Lovelace')
      await click(ctx, D, 'span.latch')
      const rearmed = await clipboard(ctx)

      return {
        pass:
          dragged === 'first algorithm' &&
          firstPress === 'first algorithm' &&
          dragged2 === 'Ada Lovelace' &&
          secondPress === 'first algorithm' &&
          stripped &&
          rearmed === 'Ada Lovelace',
        detail: `sentinel=${sentinel} dragged=${JSON.stringify(dragged)} firstPress=${JSON.stringify(firstPress)} secondDrag=${JSON.stringify(dragged2)} secondPress=${JSON.stringify(secondPress)} a11yStripped=${stripped} afterReArm=${JSON.stringify(rearmed)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: 'a <button> trigger copies the selection too',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-button')
      const D = '16-user-selection.vue'
      const dragged = await dragSelect(ctx, D, '.prose', 'Ada Lovelace')
      await click(ctx, D, 'button.pg-btn')
      const text = await clipboard(ctx)
      return {
        pass: dragged === 'Ada Lovelace' && text === 'Ada Lovelace',
        detail: `sentinel=${sentinel} dragged=${JSON.stringify(dragged)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: 'an empty selection copies nothing and leaves the primed clipboard intact',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-empty')
      const D = '16-user-selection.vue'
      await read(ctx, () => window.getSelection().removeAllRanges())
      await click(ctx, D, 'span.chip')
      const after = await clipboard(ctx)
      const refusal = await lastLog(ctx, D)
      const flashed = await read(
        ctx,
        (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage span.chip[data-copied]`),
        D,
      )
      // Positive control, same page load and same trigger: it copies when there
      // IS a selection, so "the clipboard did not change" cannot pass because
      // the trigger is simply dead.
      await dragSelect(ctx, D, '.prose', 'first algorithm')
      await click(ctx, D, 'span.chip')
      const control = await clipboard(ctx)
      return {
        pass: after === sentinel && refusal === 'refused — error: "empty"' && !flashed && control === 'first algorithm',
        detail: `afterRefusal=${JSON.stringify(after)} log=${JSON.stringify(refusal)} data-copied=${flashed} positiveControl=${JSON.stringify(control)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: 'a user-select:none region selects as "" and is refused, clipboard untouched',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-nosel')
      const D = '16-user-selection.vue'
      const dragged = await dragSelect(ctx, D, '.nosel', 'stringifies')
      await click(ctx, D, 'span.chip')
      const after = await clipboard(ctx)
      const refusal = await lastLog(ctx, D)
      // Positive control: the same drag over ordinary text does copy.
      await dragSelect(ctx, D, '.prose', 'first algorithm')
      await click(ctx, D, 'span.chip')
      const control = await clipboard(ctx)
      return {
        pass: dragged === '' && after === sentinel && refusal === 'refused — error: "empty"' && control === 'first algorithm',
        detail: `draggedOverNoSelect=${JSON.stringify(dragged)} afterRefusal=${JSON.stringify(after)} log=${JSON.stringify(refusal)} positiveControl=${JSON.stringify(control)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: 'Shift+Arrow in the note, Tab to the trigger, Enter — the keyboard path copies',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-keyboard')
      const D = '16-user-selection.vue'
      const caret = await caretAtStart(ctx, D, '.note')
      await shiftRight(ctx, 15)
      const selected = await selection(ctx)

      let where = await focused(ctx)
      for (let i = 0; i < 4 && !where.includes('chip'); i++) {
        await tab(ctx)
        where = await focused(ctx)
      }
      const survived = await selection(ctx)
      await enter(ctx)
      await sleep(180)
      const text = await clipboard(ctx)
      return {
        pass: caret && selected === 'contenteditable' && where.includes('chip') && survived === 'contenteditable' && text === 'contenteditable',
        detail: `sentinel=${sentinel} caret=${caret} selected=${JSON.stringify(selected)} focus=${where} afterTab=${JSON.stringify(survived)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: "a focused field's own Shift+Arrow selection is what gets copied",
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-field')
      const D = '16-user-selection.vue'
      await read(
        ctx,
        (d) => {
          const el = document.querySelector(`section[id="demo-${d}"] .demo__stage textarea.field`)
          el.scrollIntoView({ block: 'center' })
          el.focus()
          el.setSelectionRange(0, 0)
        },
        D,
      )
      await shiftRight(ctx, 12)
      const field = await read(
        ctx,
        (d) => {
          const el = document.querySelector(`section[id="demo-${d}"] .demo__stage textarea.field`)
          return el.value.slice(el.selectionStart, el.selectionEnd)
        },
        D,
      )
      await click(ctx, D, 'span.chip')
      const text = await clipboard(ctx)
      return {
        pass: field === 'sk-live-4417' && text === 'sk-live-4417',
        detail: `sentinel=${sentinel} fieldSelection=${JSON.stringify(field)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '16-user-selection.vue',
    name: 'selections land in the history, newest-first, with dedupe promoting a repeat',
    async run(ctx) {
      await grant(ctx)
      const D = '16-user-selection.vue'
      await dragSelect(ctx, D, '.prose', 'first algorithm')
      await click(ctx, D, 'span.chip')
      await dragSelect(ctx, D, '.prose', 'Ada Lovelace')
      await click(ctx, D, 'button.pg-btn')
      await dragSelect(ctx, D, '.prose', 'first algorithm')
      await click(ctx, D, 'span.chip') // repeat — promotes, never appends
      const rows = await read(
        ctx,
        (d) =>
          [...document.querySelectorAll(`section[id="demo-${d}"] .demo__stage ul.picked li`)].map((l) =>
            l.textContent.trim(),
          ),
        D,
      )
      return {
        pass: rows.length === 2 && rows[0] === 'first algorithm' && rows[1] === 'Ada Lovelace',
        detail: `history=${JSON.stringify(rows)}`,
      }
    },
  },
  {
    demo: '17-selection-scope.vue',
    name: "within: '.card' refuses the neighbouring card's selection and copies its own",
    async run(ctx) {
      const D = '17-selection-scope.vue'
      // Positive control: card A's own button copies card A's selection, over a
      // sentinel so the value can only have come from this copy.
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-scope')
      await dragSelect(ctx, D, '.card .prose', 'Ada Lovelace', 0)
      await click(ctx, D, '.card button', 0)
      const primed = await clipboard(ctx)

      // Card A selected, card B pressed: out of scope.
      const dragged = await dragSelect(ctx, D, '.card .prose', 'ada@lovelace.dev', 0)
      await click(ctx, D, '.card button', 1)
      const after = await clipboard(ctx)
      const refusal = await lastLog(ctx, D)

      // …and card B copies its own.
      await dragSelect(ctx, D, '.card .prose', 'Grace Hopper', 1)
      await click(ctx, D, '.card button', 1)
      const own = await clipboard(ctx)
      return {
        pass:
          primed === 'Ada Lovelace' &&
          dragged === 'ada@lovelace.dev' &&
          after === 'Ada Lovelace' &&
          refusal === '[receipt] refused — error: "empty"' &&
          own === 'Grace Hopper',
        detail: `sentinel=${sentinel} primed=${JSON.stringify(primed)} draggedInA=${JSON.stringify(dragged)} afterPressingB=${JSON.stringify(after)} log=${JSON.stringify(refusal)} bOwn=${JSON.stringify(own)}`,
      }
    },
  },
  {
    demo: '17-selection-scope.vue',
    name: 'within: true — selecting INSIDE the trigger does not copy; the click after it does',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-within-true')
      const D = '17-selection-scope.vue'
      // The host is both the text and the trigger. Chrome does not fire `click`
      // for a press-drag-release that made a selection, so highlighting inside
      // a copyable block is not itself a copy — which is what the card tells
      // the reader to do, and would be a surprising copy if it were.
      const dragged = await dragSelect(ctx, D, '.quote', 'this block is both the text')
      await sleep(200)
      const afterDrag = await clipboard(ctx)
      await click(ctx, D, '.quote')
      const afterClick = await clipboard(ctx)
      return {
        pass: dragged === 'this block is both the text' && afterDrag === sentinel && afterClick === dragged,
        detail: `dragged=${JSON.stringify(dragged)} afterDragAlone=${JSON.stringify(afterDrag)} afterClick=${JSON.stringify(afterClick)}`,
      }
    },
  },
  {
    demo: '17-selection-scope.vue',
    name: 'the unscoped default copies a selection made anywhere on the page',
    async run(ctx) {
      const sentinel = await prime(ctx, 'COPY5-SENTINEL-page')
      const D = '17-selection-scope.vue'
      const dragged = await dragSelect(ctx, D, '.card .prose', 'Grace Hopper', 1)
      await click(ctx, D, 'button.page')
      const text = await clipboard(ctx)
      return {
        pass: dragged === 'Grace Hopper' && text === 'Grace Hopper',
        detail: `sentinel=${sentinel} dragged=${JSON.stringify(dragged)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  // -- COPY-8: the eight cards that had no check at all ----------------------
  //
  // Same rules as everything above: a copy is only real if the REAL clipboard
  // changed, every clipboard assertion is primed with a sentinel first, and
  // every click is trusted input. The additions here are for the cards whose
  // behaviour is *not* the clipboard payload — the feedback window, the
  // aria-live region, the tab order, the `.prevent`ed navigation — and those
  // are measured the same way: drive it, then read the rendered number back.
  {
    demo: '02-source-override.vue',
    name: 'a string binding copies the value, never the masked label — unmasking changes the label only',
    async run(ctx) {
      const D = '02-source-override.vue'
      const TOKEN = 'sk_live_51H9xQ2eZvKYlo2C…'
      await prime(ctx, 'COPY8-SENTINEL-02-masked')
      const maskedLabel = await stageTextNth(ctx, D, 'button', 0)
      await click(ctx, D, 'button', 0)
      const whileMasked = await clipboard(ctx)

      // Unmask: the rendered label becomes the token, so a textContent fallback
      // would now produce *almost* the right string. It must still copy the ref.
      await click(ctx, D, 'input[type="checkbox"]')
      const shownLabel = await stageTextNth(ctx, D, 'button', 0)
      await prime(ctx, 'COPY8-SENTINEL-02-unmasked')
      await click(ctx, D, 'button', 0)
      const whileShown = await clipboard(ctx)

      return {
        pass:
          maskedLabel === 'Copy token (sk_live_••••••)' &&
          whileMasked === TOKEN &&
          shownLabel === `Copy token (${TOKEN})` &&
          whileShown === TOKEN,
        detail: `label(masked)=${JSON.stringify(maskedLabel)} clipboard=${JSON.stringify(whileMasked)} · label(shown)=${JSON.stringify(shownLabel)} clipboard=${JSON.stringify(whileShown)}`,
      }
    },
  },
  {
    demo: '02-source-override.vue',
    name: 'a getter source runs at click time — two copies 1.2s apart carry two different timestamps',
    async run(ctx) {
      const D = '02-source-override.vue'
      await prime(ctx, 'COPY8-SENTINEL-02-getter')
      const opened = await read(ctx, () => Date.now())
      await click(ctx, D, 'button', 1)
      const first = await clipboard(ctx)
      await sleep(1200)
      await click(ctx, D, 'button', 1)
      const second = await clipboard(ctx)
      const closed = await read(ctx, () => Date.now())

      // A source stringified once at bind time reads `() => new Date()...`;
      // a source resolved once and cached repeats the same instant.
      const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      const t1 = Date.parse(first)
      const t2 = Date.parse(second)
      const delta = t2 - t1
      return {
        pass:
          ISO.test(first) &&
          ISO.test(second) &&
          delta >= 1000 &&
          delta < 8000 &&
          t1 >= opened - 1000 &&
          t2 <= closed + 1000,
        detail: `first=${JSON.stringify(first)} second=${JSON.stringify(second)} delta=${Number.isFinite(delta) ? delta : 'NaN'}ms clickWindow=${closed - opened}ms`,
      }
    },
  },
  {
    demo: '02-source-override.vue',
    name: 'a number binding is stringified to "42" instead of falling back to the button label',
    async run(ctx) {
      const D = '02-source-override.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-02-number')
      const label = await stageTextNth(ctx, D, 'button', 2)
      await click(ctx, D, 'button', 2)
      const text = await clipboard(ctx)
      return {
        pass: label === 'Copy the number 42' && text === '42' && text.length === 2,
        detail: `sentinel=${sentinel} label=${JSON.stringify(label)} clipboard=${JSON.stringify(text)} length=${text.length}`,
      }
    },
  },
  {
    demo: '04-rich-multi.vue',
    name: 'the directive argument labels each rich entry, and the shared log is newest-first',
    async run(ctx) {
      const D = '04-rich-multi.vue'
      await prime(ctx, 'COPY8-SENTINEL-04-keys')
      await click(ctx, D, 'td', 0) // [u1] ada@lovelace.dev
      await click(ctx, D, 'td', 3) // [u2:phone] +1 202 555 0102
      await click(ctx, D, 'td', 2) // [u2] grace@hopper.dev
      const log = await stageText(ctx, D, 'pre')
      const text = await clipboard(ctx)
      const expected = [
        '[u2] ok  grace@hopper.dev',
        '[u2:phone] ok  +1 202 555 0102',
        '[u1] ok  ada@lovelace.dev',
      ].join('\n')
      return {
        pass: log === expected && text === 'grace@hopper.dev',
        detail: `log=${JSON.stringify(log)} clipboard=${JSON.stringify(text)} expected=${JSON.stringify(expected)}`,
      }
    },
  },
  {
    demo: '04-rich-multi.vue',
    name: 'each cell copies its OWN text — four cells, four distinct clipboard payloads',
    async run(ctx) {
      const D = '04-rich-multi.vue'
      // A textContent resolution that walks up to the <tr> produces
      // "ada@lovelace.dev+44 20 7946 0001"; one that walks down to the table
      // produces all four. Both are green against "the clipboard is not empty".
      const CELLS = ['ada@lovelace.dev', '+44 20 7946 0001', 'grace@hopper.dev', '+1 202 555 0102']
      const rendered = await stageTexts(ctx, D, 'td')
      const copied = []
      for (let i = 0; i < 4; i++) {
        await prime(ctx, `COPY8-SENTINEL-04-cell${i}`)
        await click(ctx, D, 'td', i)
        copied.push(await clipboard(ctx))
      }
      const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
      return {
        pass: same(rendered, CELLS) && same(copied, CELLS),
        detail: `rendered=${JSON.stringify(rendered)} clipboard=${JSON.stringify(copied)}`,
      }
    },
  },
  {
    demo: '06-feedback.vue',
    name: 'feedback className + duration are honoured and re-read per copy: 700ms closes, 2400ms is still open',
    async run(ctx) {
      const D = '06-feedback.vue'
      await grant(ctx)
      const GREEN = 'rgb(22, 163, 74)' // .flash-host.flash { background: #16a34a }
      const flashState = () =>
        read(
          ctx,
          (d) => {
            const el = document.querySelector(`section[id="demo-${d}"] .demo__stage button.flash-host`)
            return {
              flash: el.classList.contains('flash'),
              copied: el.hasAttribute('data-copied'),
              bg: getComputedStyle(el).backgroundColor,
            }
          },
          D,
        )

      await setControl(ctx, D, 'input[type="number"]', 700)
      const shortLabel = await stageTextNth(ctx, D, 'button', 0)
      const t0 = Date.now() // pressed at +0ms; the numbers below are elapsed from here
      await click(ctx, D, 'button.flash-host')
      await unhover(ctx) // or `.pg-btn:hover` decides the colour read below
      const on = await flashState()
      const onAt = Date.now() - t0
      await sleep(1000)
      const off = await flashState()
      const offAt = Date.now() - t0

      // The option is a ref in the binding's config object: a new duration has
      // to reach the NEXT copy without anything re-attaching listeners.
      await setControl(ctx, D, 'input[type="number"]', 2400)
      const longLabel = await stageTextNth(ctx, D, 'button', 0)
      const t1 = Date.now()
      await click(ctx, D, 'button.flash-host')
      await unhover(ctx)
      await sleep(800)
      const stillOn = await flashState()
      const stillAt = Date.now() - t1
      await sleep(2000)
      const ended = await flashState()
      const endedAt = Date.now() - t1

      return {
        pass:
          shortLabel === '.flash for 700ms' &&
          longLabel === '.flash for 2400ms' &&
          on.flash &&
          on.copied &&
          on.bg === GREEN &&
          !off.flash &&
          !off.copied &&
          stillOn.flash &&
          !ended.flash,
        detail:
          `dur=700: +${onAt}ms flash=${on.flash} data-copied=${on.copied} bg=${on.bg} · ` +
          `+${offAt}ms flash=${off.flash} data-copied=${off.copied} · ` +
          `dur=2400: +${stillAt}ms flash=${stillOn.flash} · +${endedAt}ms flash=${ended.flash} · ` +
          `labels=${JSON.stringify([shortLabel, longLabel])}`,
      }
    },
  },
  {
    demo: '06-feedback.vue',
    name: 'feedback.attribute renames the flag — data-done drives the outline and data-copied is never set',
    async run(ctx) {
      const D = '06-feedback.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-06-attr')
      const attrState = () =>
        read(
          ctx,
          (d) => {
            const el = document.querySelector(`section[id="demo-${d}"] .demo__stage button.attr-host`)
            const cs = getComputedStyle(el)
            return {
              done: el.hasAttribute('data-done'),
              copied: el.hasAttribute('data-copied'),
              cls: el.classList.contains('v-copy-copied'),
              outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
            }
          },
          D,
        )
      const before = await attrState()
      await click(ctx, D, 'button.attr-host')
      const during = await attrState()
      const text = await clipboard(ctx)
      await sleep(1700) // default window is 1500ms
      const after = await attrState()
      return {
        pass:
          !before.done &&
          during.done &&
          !during.copied &&
          during.cls &&
          during.outline === 'solid 2px rgb(79, 70, 229)' &&
          text === 'renamed attribute' &&
          !after.done &&
          !after.cls,
        detail:
          `sentinel=${sentinel} clipboard=${JSON.stringify(text)} · ` +
          `during: data-done=${during.done} data-copied=${during.copied} .v-copy-copied=${during.cls} outline=${JSON.stringify(during.outline)} · ` +
          `after 1700ms: data-done=${after.done} .v-copy-copied=${after.cls} (outline ${JSON.stringify(after.outline)})`,
      }
    },
  },
  {
    demo: '06-feedback.vue',
    name: 'feedback:false copies silently — the real clipboard changes and not one attribute moves',
    async run(ctx) {
      const D = '06-feedback.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-06-silent')
      const snapshot = () =>
        read(
          ctx,
          (d) => {
            const el = [...document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelectorAll('button')].find(
              (b) => b.textContent.includes('feedback: false'),
            )
            return { attrs: [...el.attributes].map((a) => `${a.name}="${a.value}"`).sort().join(' ') }
          },
          D,
        )
      const before = await snapshot()
      await clickText(ctx, D, 'feedback: false')
      const during = await snapshot()
      const text = await clipboard(ctx)
      return {
        pass: text === 'no feedback at all' && during.attrs === before.attrs,
        detail: `sentinel=${sentinel} clipboard=${JSON.stringify(text)} attrsBefore=${JSON.stringify(before.attrs)} attrsDuring=${JSON.stringify(during.attrs)}`,
      }
    },
  },
  {
    demo: '06-feedback.vue',
    name: 'duration 0 turns the window off outright — zero attribute mutations, and the copy still lands',
    async run(ctx) {
      const D = '06-feedback.vue'
      // Reading the class 200ms later cannot tell "no feedback at all" from "a
      // 0ms window that opened and shut", and those are different behaviours:
      // one is the documented opt-out, the other is a flicker. So watch the
      // element instead of sampling it.
      const watchHost = () =>
        read(
          ctx,
          (d) => {
            const el = document.querySelector(`section[id="demo-${d}"] .demo__stage button.flash-host`)
            if (window.__copy06obs) window.__copy06obs.disconnect()
            window.__copy06 = []
            const obs = new MutationObserver((records) => {
              for (const m of records) window.__copy06.push(`${m.attributeName}=${JSON.stringify(el.getAttribute(m.attributeName))}`)
            })
            obs.observe(el, { attributes: true, attributeFilter: ['class', 'data-copied'] })
            window.__copy06obs = obs
            return true
          },
          D,
        )
      const records = () => read(ctx, () => (window.__copy06 ?? []).slice())

      // Positive control: the same observer sees a real 300ms window open AND shut.
      await setControl(ctx, D, 'input[type="number"]', 300)
      await watchHost()
      await prime(ctx, 'COPY8-SENTINEL-06-dur300')
      await click(ctx, D, 'button.flash-host')
      await sleep(500)
      const live = await records()
      const liveText = await clipboard(ctx)

      await setControl(ctx, D, 'input[type="number"]', 0)
      const zeroLabel = await stageTextNth(ctx, D, 'button', 0)
      await watchHost()
      await prime(ctx, 'COPY8-SENTINEL-06-dur0')
      await click(ctx, D, 'button.flash-host')
      await sleep(500)
      const silent = await records()
      const silentText = await clipboard(ctx)

      return {
        pass:
          live.length >= 2 &&
          live.some((r) => r.startsWith('class=')) &&
          live.some((r) => r.startsWith('data-copied=')) &&
          liveText === 'custom feedback' &&
          zeroLabel === '.flash for 0ms' &&
          silent.length === 0 &&
          silentText === 'custom feedback',
        detail: `dur=300: ${live.length} mutation(s) ${JSON.stringify(live)} clipboard=${JSON.stringify(liveText)} · dur=0 (${JSON.stringify(zeroLabel)}): ${silent.length} mutation(s) ${JSON.stringify(silent)} clipboard=${JSON.stringify(silentText)}`,
      }
    },
  },
  {
    demo: '07-callbacks-event.vue',
    name: 'onCopy runs before onSuccess with the via strategy and the copied text, and onError stays quiet',
    async run(ctx) {
      const D = '07-callbacks-event.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-07-callbacks')
      await clickText(ctx, D, 'Copy with onCopy')
      const lines = await logLines(ctx, D)
      const text = await clipboard(ctx)
      // The log unshifts, so newest is first: onSuccess above the onCopy that
      // preceded it. The button is OUTSIDE the <ul>, so no `event` line at all.
      return {
        pass:
          lines.length === 2 &&
          lines[0].endsWith("onSuccess 'callback demo'") &&
          lines[1].endsWith('onCopy   attempt via clipboard-api') &&
          !lines.some((l) => l.includes('onError')) &&
          !lines.some((l) => l.includes('event ')) &&
          text === 'callback demo',
        detail: `sentinel=${sentinel} lines(${lines.length})=${JSON.stringify(lines)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '07-callbacks-event.vue',
    name: 'one @copy-result listener on the <ul> collects each child copy with that child’s own text',
    async run(ctx) {
      const D = '07-callbacks-event.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-07-event')
      await click(ctx, D, '.rows li', 0) // alpha
      await click(ctx, D, '.rows li', 2) // gamma
      const lines = await logLines(ctx, D)
      const text = await clipboard(ctx)
      return {
        pass:
          lines.length === 2 &&
          lines[0].endsWith('event  ok=true via=clipboard-api text="gamma"') &&
          lines[1].endsWith('event  ok=true via=clipboard-api text="alpha"') &&
          text === 'gamma',
        detail: `sentinel=${sentinel} lines(${lines.length})=${JSON.stringify(lines)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '08-modifiers.vue',
    name: '.trim strips an explicit source — "   padded source   " lands as 13 characters',
    async run(ctx) {
      const D = '08-modifiers.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-08-trim')
      await clickText(ctx, D, '.trim — copies')
      const text = await clipboard(ctx)
      return {
        pass: text === 'padded source' && text.length === 13,
        detail: `sentinel=${sentinel} clipboard=${JSON.stringify(text)} length=${text.length} (untrimmed source is 19)`,
      }
    },
  },
  {
    demo: '08-modifiers.vue',
    name: '.once copies on the first press only — the second press leaves the previous clipboard in place',
    async run(ctx) {
      const D = '08-modifiers.vue'
      await prime(ctx, 'COPY8-SENTINEL-08-once')
      await clickText(ctx, D, '.once — click twice')
      const firstPress = await clipboard(ctx)
      await sleep(1700) // let the default 1500ms feedback window close
      const flashBetween = await read(
        ctx,
        (d) =>
          !![...document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelectorAll('button')].find(
            (b) => b.textContent.includes('.once — click twice') && b.hasAttribute('data-copied'),
          ),
        D,
      )
      // A fresh value from a DIFFERENT binding on the same card: "the clipboard
      // did not change" can now only mean the latched press wrote nothing.
      await clickText(ctx, D, '.trim — copies')
      const between = await clipboard(ctx)
      await clickText(ctx, D, '.once — click twice')
      const secondPress = await clipboard(ctx)
      const flashAfter = await read(
        ctx,
        (d) =>
          !![...document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelectorAll('button')].find(
            (b) => b.textContent.includes('.once — click twice') && b.hasAttribute('data-copied'),
          ),
        D,
      )
      return {
        pass:
          firstPress === 'copied exactly once' &&
          !flashBetween &&
          between === 'padded source' &&
          secondPress === 'padded source' &&
          !flashAfter,
        detail: `firstPress=${JSON.stringify(firstPress)} flashCleared=${!flashBetween} reprimed=${JSON.stringify(between)} afterSecondPress=${JSON.stringify(secondPress)} flashedAgain=${flashAfter}`,
      }
    },
  },
  {
    demo: '08-modifiers.vue',
    name: '.stop keeps the click off the counting parent while the unmodified sibling increments it',
    async run(ctx) {
      const D = '08-modifiers.vue'
      await prime(ctx, 'COPY8-SENTINEL-08-stop')
      const before = await countIn(ctx, D, '.outer', 'parent click count:')
      await clickText(ctx, D, '.stop (parent stays put)')
      const afterStop = await countIn(ctx, D, '.outer', 'parent click count:')
      const stopped = await clipboard(ctx)
      await clickText(ctx, D, 'no modifier (parent increments)')
      const afterPlain = await countIn(ctx, D, '.outer', 'parent click count:')
      const plain = await clipboard(ctx)
      return {
        pass:
          before === 0 &&
          afterStop === 0 &&
          stopped === 'stopped' &&
          afterPlain === 1 &&
          plain === 'not stopped',
        detail: `parentClicks ${before} → ${afterStop} (.stop, clipboard=${JSON.stringify(stopped)}) → ${afterPlain} (no modifier, clipboard=${JSON.stringify(plain)})`,
      }
    },
  },
  {
    demo: '08-modifiers.vue',
    name: '.prevent copies from an <a href="#never"> without the document ever reaching that hash',
    async run(ctx) {
      const D = '08-modifiers.vue'
      await prime(ctx, 'COPY8-SENTINEL-08-prevent')
      const hashBefore = await read(ctx, () => location.hash)
      const clicksBefore = await countIn(ctx, D, 'p', 'link clicks:')
      await click(ctx, D, 'a[href="#never"]')
      const clicksAfter = await countIn(ctx, D, 'p', 'link clicks:')
      const text = await clipboard(ctx)
      const hashAfter = await read(ctx, () => location.hash)
      // The two counters are the positive control: the press really landed on
      // the anchor, so an unchanged hash means `preventDefault`, not a miss.
      return {
        pass:
          hashBefore.startsWith('#v-copy') &&
          clicksBefore === 0 &&
          clicksAfter === 1 &&
          text === 'link text' &&
          hashAfter === hashBefore,
        detail: `linkClicks ${clicksBefore} → ${clicksAfter} clipboard=${JSON.stringify(text)} hash ${JSON.stringify(hashBefore)} → ${JSON.stringify(hashAfter)}`,
      }
    },
  },
  {
    demo: '10-a11y.vue',
    name: 'the three non-interactive spans are real tab stops, in document order, ahead of the native button',
    async run(ctx) {
      const D = '10-a11y.vue'
      // Enter the card at its own chrome — the last enabled head button is the
      // tab stop immediately before the stage — then walk forward with trusted
      // Tab presses. An element with no injected tabindex is simply never
      // reached, which is the whole assertion; reading the attribute back would
      // not prove the browser agrees it is focusable.
      const entered = await read(
        ctx,
        (d) => {
          const btns = document.querySelectorAll(
            `section[id="demo-${d}"] .demo__head .demo__actions button:not([disabled])`,
          )
          const last = btns[btns.length - 1]
          if (!last) return null
          last.scrollIntoView({ block: 'center' })
          last.focus()
          return document.activeElement === last ? last.textContent.trim() : null
        },
        D,
      )
      const seen = []
      for (let i = 0; i < 4; i++) {
        await tab(ctx)
        seen.push(await focusInfo(ctx))
      }
      const want = [
        ['span', 'Non-interactive span'],
        ['span', 'Custom aria-live message'],
        ['span', 'announce: false'],
        ['button', 'Native button'],
      ]
      const ok = want.every(([tag, prefix], i) => seen[i]?.tag === tag && seen[i].text.startsWith(prefix))
      return {
        pass: entered === 'Edit code' && ok,
        detail: `enteredFrom=${JSON.stringify(entered)} tabOrder=${JSON.stringify(seen.map((s) => `${s.tag}:${s.text}`))}`,
      }
    },
  },
  {
    demo: '10-a11y.vue',
    name: 'Space on a focused span copies and does NOT scroll the page — the handler preventDefaults',
    async run(ctx) {
      const D = '10-a11y.vue'
      await read(
        ctx,
        (d) => {
          const el = document.querySelector(`section[id="demo-${d}"] .demo__stage span.target`)
          el.scrollIntoView({ block: 'center' })
          el.focus()
        },
        D,
      )
      await sleep(600) // any smooth scroll has to settle before scrollY is a baseline
      const probe = (d) => {
        const el = document.querySelector(`section[id="demo-${d}"] .demo__stage span.target`)
        return {
          focused: document.activeElement === el,
          y: Math.round(window.scrollY),
          room: Math.round(document.documentElement.scrollHeight - window.scrollY - window.innerHeight),
          copied: el.hasAttribute('data-copied'),
        }
      }
      const before = await read(ctx, probe, D)
      await space(ctx)
      await sleep(300)
      const after = await read(ctx, probe, D)
      return {
        // `room` is the negative control: with nothing below the fold an
        // unprevented Space would not move the page either.
        pass: before.focused && !before.copied && before.room > 200 && after.copied && after.y === before.y,
        detail: `focused=${before.focused} scrollRoomBelow=${before.room}px scrollY ${before.y} → ${after.y} data-copied ${before.copied} → ${after.copied}`,
      }
    },
  },
  {
    demo: '10-a11y.vue',
    name: 'one shared aria-live region carries the custom message, and announce:false copies without a word',
    async run(ctx) {
      const D = '10-a11y.vue'
      const sentinel = await prime(ctx, 'COPY8-SENTINEL-10-announce')
      // `announce()` blanks the region synchronously and writes the message on
      // the next frame, so an announcement is only readable a frame later —
      // wait for text rather than sampling once. For `announce: false` nothing
      // blanks it, so this returns the retained previous message immediately,
      // which is exactly the assertion.
      const live = (wait) =>
        read(
          ctx,
          async (w) => {
            const pick = () => [...document.querySelectorAll('body > div[role="status"][aria-live="polite"]')]
            if (w) await window.__pg.until(() => pick().some((n) => n.textContent), 1500)
            const nodes = pick()
            return { count: nodes.length, text: nodes.length ? nodes[nodes.length - 1].textContent : null }
          },
          wait,
        )
      const before = await live(false)
      await click(ctx, D, 'span.target', 1) // announce: 'Email address copied'
      const custom = await live(true)
      const customClip = await clipboard(ctx)
      await click(ctx, D, 'span.target', 2) // announce: false
      const silent = await live(true)
      const silentClip = await clipboard(ctx)
      await click(ctx, D, 'span.target', 0) // default announcement
      const dflt = await live(true)
      const dfltClip = await clipboard(ctx)
      return {
        pass:
          before.count <= 1 &&
          custom.count === 1 &&
          custom.text === 'Email address copied' &&
          customClip === 'custom announcement' &&
          // The copy happened — it just said nothing — so the region still
          // holds the PREVIOUS message rather than 'silent' or ''.
          silentClip === 'silent' &&
          silent.count === 1 &&
          silent.text === 'Email address copied' &&
          dflt.count === 1 &&
          dflt.text === 'Copied' &&
          dfltClip.startsWith('Non-interactive span'),
        detail:
          `sentinel=${sentinel} regions ${before.count} → ${custom.count} → ${silent.count} → ${dflt.count} · ` +
          `custom: live=${JSON.stringify(custom.text)} clipboard=${JSON.stringify(customClip)} · ` +
          `announce:false: live=${JSON.stringify(silent.text)} clipboard=${JSON.stringify(silentClip)} · ` +
          `default: live=${JSON.stringify(dflt.text)} clipboard=${JSON.stringify(dfltClip)}`,
      }
    },
  },
  {
    demo: '11-config-sink.vue',
    name: 'the config form records labelled rich entries newest-first and evicts past max',
    async run(ctx) {
      const D = '11-config-sink.vue'
      await prime(ctx, 'COPY8-SENTINEL-11-sink')
      for (let i = 0; i < 4; i++) await click(ctx, D, 'code.cmd', i) // npm, pnpm, yarn, bun
      const rows = await logLines(ctx, D)
      const text = await clipboard(ctx)
      const expected = [
        '[bun] bun add @ozjsey/v-copy',
        '[yarn] yarn add @ozjsey/v-copy',
        '[pnpm] pnpm add @ozjsey/v-copy',
      ]
      return {
        pass:
          rows.length === 3 &&
          rows.every((r, i) => r === expected[i]) &&
          text === 'bun add @ozjsey/v-copy',
        detail: `max=3 rows(${rows.length})=${JSON.stringify(rows)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '11-config-sink.vue',
    name: 'max is re-read per copy — shrinking the slider evicts on the NEXT copy, not on the slider move',
    async run(ctx) {
      const D = '11-config-sink.vue'
      await prime(ctx, 'COPY8-SENTINEL-11-max')
      for (let i = 0; i < 3; i++) await click(ctx, D, 'code.cmd', i) // npm, pnpm, yarn
      const filled = await logLines(ctx, D)
      await setControl(ctx, D, 'input[type="range"]', 1)
      // The slider's own rendered read-out, so a failure says whether the
      // control moved or the cap simply did not follow it.
      const label = await read(
        ctx,
        (d) =>
          window.__pg
            .txt(document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelector('label')),
        D,
      )
      const afterSlider = await logLines(ctx, D)
      await click(ctx, D, 'code.cmd', 0) // npm again, now capped at 1
      const afterCopy = await logLines(ctx, D)
      const text = await clipboard(ctx)
      return {
        pass:
          filled.length === 3 &&
          label === 'max 1' &&
          afterSlider.length === 3 &&
          afterCopy.length === 1 &&
          afterCopy[0] === '[npm] npm install @ozjsey/v-copy' &&
          text === 'npm install @ozjsey/v-copy',
        detail: `rows ${filled.length} → ${afterSlider.length} (slider ${JSON.stringify(label)}) → ${afterCopy.length} after the next copy: ${JSON.stringify(afterCopy)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '11-config-sink.vue',
    name: 'Clear replaces the sink array and the next copy lands in the NEW one',
    async run(ctx) {
      const D = '11-config-sink.vue'
      const EMPTY = '— copy a few commands, then shrink max and copy again —'
      await prime(ctx, 'COPY8-SENTINEL-11-clear')
      await click(ctx, D, 'code.cmd', 0)
      await click(ctx, D, 'code.cmd', 1)
      const filled = await logLines(ctx, D)
      await clickText(ctx, D, 'Clear')
      const cleared = await stageText(ctx, D, 'pre')
      const clearDisabled = await read(
        ctx,
        (d) =>
          [...document.querySelector(`section[id="demo-${d}"] .demo__stage`).querySelectorAll('button')].find((b) =>
            b.textContent.includes('Clear'),
          )?.disabled ?? null,
        D,
      )
      // `log = []` hands the binding a DIFFERENT array. A directive holding the
      // old reference records into an orphan and this stays on the placeholder.
      await click(ctx, D, 'code.cmd', 2)
      const after = await logLines(ctx, D)
      const text = await clipboard(ctx)
      return {
        pass:
          filled.length === 2 &&
          cleared === EMPTY &&
          clearDisabled === true &&
          after.length === 1 &&
          after[0] === '[yarn] yarn add @ozjsey/v-copy' &&
          text === 'yarn add @ozjsey/v-copy',
        detail: `rows ${filled.length} → cleared=${JSON.stringify(cleared)} clearDisabled=${clearDisabled} → ${JSON.stringify(after)} clipboard=${JSON.stringify(text)}`,
      }
    },
  },
  {
    demo: '12-multi-select.vue',
    name: 'the computed TSV source is re-read on every render — 2, then 3, then all 5 rows',
    async run(ctx) {
      const D = '12-multi-select.vue'
      const HEAD = 'name\temail\tteam'
      const ADA = 'Ada Lovelace\tada@lovelace.dev\tCompilers'
      const GRACE = 'Grace Hopper\tgrace@hopper.dev\tLanguages'
      const ALAN = 'Alan Turing\talan@turing.dev\tCrypto'
      const BARBARA = 'Barbara Liskov\tbarbara@liskov.dev\tTypes'
      const DON = 'Donald Knuth\tdon@knuth.dev\tTypesetting'

      await prime(ctx, 'COPY8-SENTINEL-12-two')
      const label0 = await stageText(ctx, D, 'button.copy-btn')
      await click(ctx, D, 'button.copy-btn')
      const two = await clipboard(ctx)

      // A string source is the value from the LAST RENDER — the defect this
      // card documents is one that never re-renders, so the block stays stale.
      await click(ctx, D, 'tbody td', 1) // Ada's name cell — the row toggles
      const label1 = await stageText(ctx, D, 'button.copy-btn')
      await prime(ctx, 'COPY8-SENTINEL-12-three')
      await click(ctx, D, 'button.copy-btn')
      const three = await clipboard(ctx)

      await click(ctx, D, 'thead input[type="checkbox"]') // select all
      const label2 = await stageText(ctx, D, 'button.copy-btn')
      await prime(ctx, 'COPY8-SENTINEL-12-five')
      await click(ctx, D, 'button.copy-btn')
      const five = await clipboard(ctx)

      return {
        pass:
          label0 === 'Copy 2 selected as TSV' &&
          two === [HEAD, GRACE, ALAN].join('\n') &&
          label1 === 'Copy 3 selected as TSV' &&
          three === [HEAD, ADA, GRACE, ALAN].join('\n') &&
          label2 === 'Copy 5 selected as TSV' &&
          five === [HEAD, ADA, GRACE, ALAN, BARBARA, DON].join('\n'),
        detail:
          `${JSON.stringify(label0)} → ${two.split('\n').length} lines ${JSON.stringify(two)} · ` +
          `${JSON.stringify(label1)} → ${three.split('\n').length} lines ${JSON.stringify(three)} · ` +
          `${JSON.stringify(label2)} → ${five.split('\n').length} lines ${JSON.stringify(five)}`,
      }
    },
  },
  {
    demo: '12-multi-select.vue',
    name: 'an empty selection binds `false` — the button copies nothing, not a lone header row',
    async run(ctx) {
      const D = '12-multi-select.vue'
      const HEAD = 'name\temail\tteam'
      const GRACE = 'Grace Hopper\tgrace@hopper.dev\tLanguages'
      const ALAN = 'Alan Turing\talan@turing.dev\tCrypto'
      const BARBARA = 'Barbara Liskov\tbarbara@liskov.dev\tTypes'
      const flashed = () =>
        read(
          ctx,
          (d) => !!document.querySelector(`section[id="demo-${d}"] .demo__stage button.copy-btn[data-copied]`),
          D,
        )

      // Positive control first: with two rows picked the same button copies.
      await prime(ctx, 'COPY8-SENTINEL-12-disabled')
      await click(ctx, D, 'button.copy-btn')
      const primed = await clipboard(ctx)
      await sleep(1700) // let its feedback window close, or the flash below is stale
      const flashBefore = await flashed()

      await click(ctx, D, 'tbody input[type="checkbox"]', 1) // Grace off
      await click(ctx, D, 'tbody input[type="checkbox"]', 2) // Alan off
      const emptyLabel = await stageText(ctx, D, 'button.copy-btn')
      await click(ctx, D, 'button.copy-btn')
      const whileEmpty = await clipboard(ctx)
      const flashWhileEmpty = await flashed()

      // …and re-arming the binding is the same write in reverse.
      await click(ctx, D, 'tbody input[type="checkbox"]', 3) // Barbara on
      const oneLabel = await stageText(ctx, D, 'button.copy-btn')
      await click(ctx, D, 'button.copy-btn')
      const rearmed = await clipboard(ctx)

      return {
        pass:
          primed === [HEAD, GRACE, ALAN].join('\n') &&
          !flashBefore &&
          emptyLabel === 'Copy 0 selected as TSV' &&
          whileEmpty === primed &&
          !flashWhileEmpty &&
          oneLabel === 'Copy 1 selected as TSV' &&
          rearmed === [HEAD, BARBARA].join('\n'),
        detail:
          `primed=${JSON.stringify(primed)} (flashCleared=${!flashBefore}) · ` +
          `${JSON.stringify(emptyLabel)}: clipboard=${JSON.stringify(whileEmpty)} data-copied=${flashWhileEmpty} · ` +
          `${JSON.stringify(oneLabel)}: clipboard=${JSON.stringify(rearmed)}`,
      }
    },
  },
]

export default {
  library: 'v-copy',
  nativeChecks: NATIVE_CHECKS,
}
