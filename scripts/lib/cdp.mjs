/**
 * Minimal Chrome DevTools Protocol client — zero dependencies, Node 22+ (the
 * global `WebSocket` landed there), same spirit as scripts/smoke.mjs.
 *
 * `smoke.mjs` only needs a rendered DOM, so it shells out to `--dump-dom`.
 * Driving a card — dispatching a drag, clicking a button, reading the state
 * attribute afterwards — needs a live page, which means CDP.
 *
 * ## PG-21: every command is on a clock, and a reload fails it out loud
 *
 * This client used to `await` a reply that could never arrive. Vite full-reloads
 * the page whenever an aliased sibling source changes — which, with several
 * agents editing sibling packages at once, is the normal condition here, not an
 * edge case. A reload mid-`Runtime.evaluate` destroys the execution context, the
 * reply is dropped, and the run blocked *forever*. That is the worst possible
 * failure mode: it looks like slow work. It cost a 20-minute hang, several
 * "the run looked contaminated" reports, and at least two terminated agents.
 *
 * So, two guarantees, and both name the cause:
 *
 *   1. **A deadline.** Every command rejects after `CDP_TIMEOUT_MS` (default
 *      30s) with the method, the elapsed time and the session.
 *   2. **Reload detection.** `Page.frameNavigated` (main frame) and
 *      `Runtime.executionContextsCleared` arriving while commands are
 *      outstanding fail those commands *immediately* — no waiting out the
 *      deadline for a reply that is already known to be gone. Commands that
 *      navigate on purpose (`Page.navigate`, `Page.reload`, …) are exempt, and
 *      any caller can opt out per send with `{ survivesNavigation: true }`.
 *
 * A check that needs to survive a reload should not be doing that silently:
 * catch the error and say so. See `scripts/interactions/vue-write-behind.mjs`,
 * whose stamp-the-document trick this generalises.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

/** Per-command deadline. Generous: a cold `Runtime.evaluate` can take seconds. */
export const DEFAULT_TIMEOUT_MS = Number(process.env.CDP_TIMEOUT_MS ?? 30_000)

/**
 * Commands whose whole job is to tear down the execution context they run in.
 * Failing these on the navigation they caused would be nonsense.
 */
const NAVIGATING_METHODS = new Set([
  'Page.navigate',
  'Page.navigateToHistoryEntry',
  'Page.reload',
  'Page.close',
  'Page.crash',
  'Target.closeTarget',
  'Target.createTarget',
  'Target.attachToTarget',
])

export function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH.')
  return found
}

export async function launchChrome({ port = 9333, headless = true, windowSize = '1280,1400' } = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'dz-cdp-'))
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--window-size=${windowSize}`,
    'about:blank',
  ]
  if (headless) args.unshift('--headless=new')
  const proc = spawn(findChrome(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  proc.stdout.on('data', (c) => (log += c))
  proc.stderr.on('data', (c) => (log += c))

  let version
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) { version = await res.json(); break }
    } catch { /* not up */ }
    await sleep(250)
  }
  if (!version) { proc.kill('SIGKILL'); throw new Error(`Chrome never exposed CDP:\n${log}`) }
  return { proc, wsUrl: version.webSocketDebuggerUrl, port }
}

/**
 * Thrown when a command is abandoned — deadline reached, or the page navigated
 * out from under it. Carries the method and elapsed time as fields so a caller
 * that legitimately expects a reload (a check that navigates from page script)
 * can branch on `err.reason === 'navigated'` instead of matching on a string.
 */
export class CdpCommandError extends Error {
  constructor({ method, elapsedMs, reason, detail, sessionId }) {
    super(
      `CDP ${method} ${reason === 'timeout' ? 'timed out' : 'was abandoned'} after ${elapsedMs}ms` +
        (sessionId ? ` (session ${sessionId.slice(0, 8)}…)` : '') +
        `: ${detail}`,
    )
    this.name = 'CdpCommandError'
    this.method = method
    this.elapsedMs = elapsedMs
    this.reason = reason
    this.sessionId = sessionId
  }
}

/**
 * Chrome's own wording for "the context you addressed is gone".
 *
 * It arrives as an ordinary error reply rather than as silence, so it never
 * hung the run — but it read as a mystery string. Normalising it into a
 * `CdpCommandError` with `reason: 'navigated'` is what lets `throughReload`
 * below tell a benign Vite reload from a real fault.
 */
const NAVIGATED_AWAY =
  /Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id|Target closed/i

function protocolError(error, entry) {
  if (NAVIGATED_AWAY.test(error.message ?? '')) {
    return new CdpCommandError({
      method: entry.method,
      elapsedMs: Date.now() - entry.startedAt,
      reason: 'navigated',
      detail: `Chrome answered "${error.message}" — the page reloaded while the command was in flight`,
      sessionId: entry.sessionId,
    })
  }
  return new Error(`${error.message} (${JSON.stringify(error.data ?? '')})`)
}

/**
 * Runs `fn`, and runs it again if the page full-reloaded underneath it.
 *
 * Vite full-reloads on its first cold load (once the dependency optimizer has
 * discovered what the page needs) and again whenever an aliased sibling source
 * changes. Neither is a fault, and before PG-21 both were invisible: the
 * command simply never came back. Now they are legible — and here, recoverable.
 * Anything that is not a navigation propagates untouched.
 */
export async function throughReload(fn, { attempts = 3, onRetry } = {}) {
  let last
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i)
    } catch (err) {
      if (!(err instanceof CdpCommandError) || err.reason !== 'navigated') throw err
      last = err
      onRetry?.(err, i)
      await sleep(1200)
    }
  }
  throw new Error(
    `The page reloaded under every one of ${attempts} attempts. Last: ${last.message}\n` +
      `Something is rewriting a file this page imports while the run is going — check whether ` +
      `another agent is editing a sibling package, and consider PLAYGROUND_UNALIAS.`,
  )
}

export class Cdp {
  constructor(ws, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.ws = ws
    this.id = 0
    this.timeoutMs = timeoutMs
    this.pending = new Map()
    this.listeners = new Map()
    this.closed = false
    /** Every main-frame navigation this client saw — the contamination meter. */
    this.navigations = []

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        if (!p) return
        if (msg.error) p.reject(protocolError(msg.error, p))
        else p.resolve(msg.result)
      } else {
        for (const fn of [...(this.listeners.get(msg.method) ?? [])]) fn(msg.params, msg.sessionId)
      }
    })
    ws.addEventListener('close', () => {
      this.closed = true
      this.abandonOutstanding(undefined, 'closed', 'the CDP socket closed (Chrome exited?)', true)
    })

    // PG-21. A full reload destroys the execution context; any reply still owed
    // to us died with it. Fail those commands now, naming the reload, instead of
    // waiting out the deadline — or, as before, forever.
    this.on('Page.frameNavigated', (params, sessionId) => {
      if (params?.frame?.parentId) return // a subframe navigating is not our reload
      const url = params?.frame?.url ?? '(unknown url)'
      this.navigations.push({ at: Date.now(), url })
      this.abandonOutstanding(
        sessionId,
        'navigated',
        `the page navigated to ${url} while the command was in flight, so its reply can never arrive. ` +
          `Vite full-reloads on any change to an aliased sibling source — re-run once the tree is quiet, ` +
          `or use PLAYGROUND_UNALIAS to pin the package being edited.`,
      )
    })
    // A closed or crashed tab answers nothing at all — not even an error — so
    // without this the only thing that ends the wait is the 30s deadline. The
    // detach event names the session, so only that session's commands die.
    this.on('Target.detachedFromTarget', (params) => {
      this.abandonSession(
        params?.sessionId,
        `the page was detached or closed while the command was in flight (reason: ${params?.reason ?? 'unknown'})`,
      )
    })
    this.on('Inspector.targetCrashed', (_params, sessionId) => {
      this.abandonSession(sessionId, 'the tab crashed while the command was in flight')
    })

    // Not counted in `navigations`: this fires alongside Page.frameNavigated for
    // the same reload, and double-counting would make the contamination meter
    // read twice the truth.
    this.on('Runtime.executionContextsCleared', (_params, sessionId) => {
      this.abandonOutstanding(
        sessionId,
        'navigated',
        `the page's JavaScript contexts were cleared (a full reload) while the command was in flight, ` +
          `so its reply can never arrive. Usually Vite reloading because an aliased sibling source changed.`,
      )
    })
  }

  static async connect(wsUrl, options) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
    })
    return new Cdp(ws, options)
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
    return () => this.off(method, fn)
  }

  /**
   * Needed, not tidiness: `newPage().navigate()` registers a listener per call
   * and this runner navigates a hundred-odd times, so without it the handler
   * list grows for the whole run.
   */
  off(method, fn) {
    const list = this.listeners.get(method)
    if (!list) return
    const i = list.indexOf(fn)
    if (i !== -1) list.splice(i, 1)
  }

  /** Reject every in-flight command that cannot survive `reason`. */
  abandonOutstanding(sessionId, reason, detail, all = false) {
    for (const entry of [...this.pending.values()]) {
      if (!all && entry.survivesNavigation) continue
      if (!all && sessionId && entry.sessionId && entry.sessionId !== sessionId) continue
      entry.reject(
        new CdpCommandError({
          method: entry.method,
          elapsedMs: Date.now() - entry.startedAt,
          reason,
          detail,
          sessionId: entry.sessionId,
        }),
      )
    }
  }

  /** Fail only the commands belonging to one session — a closed or crashed tab. */
  abandonSession(sessionId, detail) {
    if (!sessionId) return
    for (const entry of [...this.pending.values()]) {
      if (entry.sessionId !== sessionId) continue
      entry.reject(
        new CdpCommandError({
          method: entry.method,
          elapsedMs: Date.now() - entry.startedAt,
          reason: 'closed',
          detail,
          sessionId,
        }),
      )
    }
  }

  /**
   * @param {object} [options]
   * @param {number} [options.timeout]            per-command deadline, ms; 0 disables
   * @param {boolean} [options.survivesNavigation] do not fail this command on a reload
   */
  send(method, params = {}, sessionId, options = {}) {
    const { timeout = this.timeoutMs, survivesNavigation = NAVIGATING_METHODS.has(method) } = options
    const id = ++this.id
    const startedAt = Date.now()

    return new Promise((resolve, reject) => {
      const settle = (fn, value) => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        if (entry.timer) clearTimeout(entry.timer)
        fn(value)
      }
      const entry = {
        method,
        sessionId,
        startedAt,
        survivesNavigation,
        timer: null,
        resolve: (v) => settle(resolve, v),
        reject: (e) => settle(reject, e),
      }
      if (timeout > 0) {
        entry.timer = setTimeout(() => {
          entry.reject(
            new CdpCommandError({
              method,
              elapsedMs: Date.now() - startedAt,
              reason: 'timeout',
              detail:
                `no reply within ${timeout}ms. Chrome is alive but never answered — a page that reloaded ` +
                `without emitting Page.frameNavigated, an evaluate that never settles, or a genuinely slow ` +
                `call. Raise CDP_TIMEOUT_MS if the work really takes this long.`,
              sessionId,
            }),
          )
        }, timeout)
        entry.timer.unref?.()
      }
      this.pending.set(id, entry)

      if (this.closed) {
        entry.reject(
          new CdpCommandError({
            method,
            elapsedMs: 0,
            reason: 'closed',
            detail: 'the CDP socket is already closed',
            sessionId,
          }),
        )
        return
      }
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      try {
        this.ws.send(JSON.stringify(payload))
      } catch (err) {
        entry.reject(
          new CdpCommandError({
            method,
            elapsedMs: Date.now() - startedAt,
            reason: 'closed',
            detail: `could not be sent — ${err.message}`,
            sessionId,
          }),
        )
      }
    })
  }

  close() {
    this.closed = true
    this.abandonOutstanding(undefined, 'closed', 'the client was closed while the command was in flight', true)
    try { this.ws.close() } catch { /* already gone */ }
  }
}

/** Attach to a fresh tab and return a page handle with evaluate/navigate. */
export async function newPage(cdp, url = 'about:blank') {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

  const consoleErrors = []
  const consoleWarnings = []
  const pageErrors = []
  const text = (p) => p.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
  cdp.on('Runtime.consoleAPICalled', (p, sid) => {
    if (sid !== sessionId) return
    if (p.type === 'error') consoleErrors.push(text(p))
    else if (p.type === 'warning') consoleWarnings.push(text(p))
  })
  cdp.on('Runtime.exceptionThrown', (p, sid) => {
    if (sid !== sessionId) return
    const d = p.exceptionDetails
    pageErrors.push(d.exception?.description ?? d.text)
  })

  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Page.enable', {}, sessionId)

  const page = {
    sessionId,
    targetId,
    consoleErrors,
    consoleWarnings,
    pageErrors,
    /** Count of full reloads seen on this page — a run's contamination meter. */
    get navigations() { return cdp.navigations.length },
    async navigate(u, { budget = 20_000 } = {}) {
      const startedAt = Date.now()
      let fired = false
      const onLoad = (_p, sid) => { if (sid === sessionId) { fired = true; resolveLoad() } }
      let resolveLoad
      const loaded = new Promise((r) => (resolveLoad = r))
      cdp.on('Page.loadEventFired', onLoad)
      try {
        await cdp.send('Page.navigate', { url: u }, sessionId)
        await Promise.race([loaded, sleep(budget)])
      } finally {
        cdp.off('Page.loadEventFired', onLoad)
      }
      if (fired) return

      // PG-22 / PG-21. The old code raced a 15s sleep and then carried on as if
      // the page were up, so "the server is wedged" and "loaded fine" printed
      // the same thing. A hash-only navigation legitimately fires no load event,
      // so confirm the document really is there before calling it a failure.
      const state = await cdp
        .send('Runtime.evaluate', {
          expression: '({ readyState: document.readyState, href: location.href, body: !!document.body && document.body.innerHTML.length })',
          returnByValue: true,
        }, sessionId)
        .then((r) => r.result?.value ?? null)
        .catch((err) => ({ error: err.message }))
      if (state && state.readyState === 'complete' && state.href === u) return
      throw new Error(
        `Navigation to ${u} never fired a load event within ${Date.now() - startedAt}ms, and the page is ` +
          `not there either: ${JSON.stringify(state)}. The dev server is wedged, or Chrome is.`,
      )
    },
    evaluate(fnOrExpr, ...args) {
      return page.evaluateWithin(undefined, fnOrExpr, ...args)
    },
    /**
     * `evaluate` with an explicit deadline, for a call that is *supposed* to
     * take minutes — `scripts/geometry.mjs` drives a whole tab inside one
     * `Runtime.evaluate` and legitimately needs tens of seconds. Without this
     * the PG-21 deadline turns a slow-but-working probe into a failed run,
     * which is the same crime in the opposite direction.
     */
    async evaluateWithin(timeout, fnOrExpr, ...args) {
      const expr =
        typeof fnOrExpr === 'function'
          ? `(${fnOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`
          : fnOrExpr
      const res = await cdp.send(
        'Runtime.evaluate',
        { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true },
        sessionId,
        timeout === undefined ? {} : { timeout },
      )
      if (res.exceptionDetails) {
        throw new Error(
          res.exceptionDetails.exception?.description ?? res.exceptionDetails.text,
        )
      }
      return res.result.value
    },
    /** Resize the viewport without relaunching Chrome — geometry sweeps widths. */
    async setViewport(width, height, deviceScaleFactor = 1) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor, mobile: false },
        sessionId,
      )
    },
    async screenshot(path) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId)
      const { writeFileSync } = await import('node:fs')
      writeFileSync(path, Buffer.from(data, 'base64'))
      return path
    },
  }
  if (url !== 'about:blank') await page.navigate(url)
  return page
}

export { sleep }
