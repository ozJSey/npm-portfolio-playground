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
  const origin = await read(ctx, () => location.origin)
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
]

export default {
  library: 'v-copy',
  nativeChecks: NATIVE_CHECKS,
}
