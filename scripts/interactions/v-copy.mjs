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
]

export default {
  library: 'v-copy',
  nativeChecks: NATIVE_CHECKS,
}
