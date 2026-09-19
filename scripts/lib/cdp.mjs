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
 *
 * ## PG-21, second pass: the deadline fired, and the run hung anyway
 *
 * Measured, 2026-09-15: a `Runtime.evaluate` on a promise that never settles is
 * rejected in 3004 ms against a 3000 ms deadline. The clock above works. And a
 * `pnpm interactions` run still hung for 14 minutes at 0% CPU with Chrome, Vite
 * and an ESTABLISHED debugging socket all alive, and had to be killed by hand —
 * so a deadline on `send` was never the whole answer, because **`send` was
 * never the only place this file waits.** Three others had no clock at all:
 *
 *   - `launchChrome`'s `/json/version` poll. `fetch` has no default timeout, so
 *     one attempt that connects and is never answered eats the entire 60-try
 *     retry budget the loop appears to have. Its symptom is exactly the one
 *     observed: an ESTABLISHED socket to the debugging port and a node process
 *     with nothing to do.
 *   - `Cdp.connect`'s WebSocket handshake, which fires neither `open` nor
 *     `error` when the upgrade response never arrives.
 *   - anything a spec does with the raw `cdp`/`page` handle it is given.
 *
 * The first two are now on clocks. The third cannot be, from here — which is
 * the point of the fourth guarantee:
 *
 *   3. **A stall watchdog.** Progress is "a CDP command settled". If nothing
 *      settles for `CDP_STALL_MS` while nothing is in flight — or if something
 *      in flight outlives its own deadline, meaning the clock in `send` did not
 *      fire — the run prints what it was doing, kills Chrome and the dev server,
 *      and exits 3. It is not attached to any one `await`, so it does not need
 *      to know which one is stuck. See `scripts/lib/watchdog.mjs`.
 *
 * Negative control for all of it, per BOARD.md's standing criteria:
 *
 *     node scripts/lib/cdp.mjs           # drives a real Chrome into a real hang
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  EXIT_WEDGED,
  installExitCleanup,
  registerChild,
  registerProfileDir,
  startWatchdog,
  sweepStaleProfileDirs,
} from './watchdog.mjs'

/**
 * The `mkdtempSync` prefix for the throwaway profile each launch gets, and the
 * marker the PG-25 startup sweep recognises its own litter by. One constant,
 * because "what we create" and "what we are allowed to delete" being two
 * strings that merely look alike is how a sweep ends up deleting someone else's
 * directory — or, quieter, none of its own.
 */
const PROFILE_PREFIX = 'dz-cdp-'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

/**
 * Read a millisecond budget from the environment, or refuse to start.
 *
 * `Number('')` is 0 and `Number('30s')` is NaN, and the old
 * `Number(process.env.CDP_TIMEOUT_MS ?? 30_000)` turned both of those into a
 * *silently disabled* deadline — `timeout > 0` is false for each. A typo in the
 * one variable whose job is to bound the run would have restored the original
 * PG-21 hang, and nothing would have said so. Fail at import instead.
 */
function msFromEnv(name, raw, fallback, { zeroDisables = false } = {}) {
  if (raw === undefined || raw === '') return fallback // `FOO=` is how a shell unsets
  const n = Number(raw)
  if (zeroDisables && n === 0) return 0
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `${name}=${JSON.stringify(raw)} is not a positive number of milliseconds.\n` +
        `Refusing to start rather than run with the deadline it was supposed to set quietly ` +
        `switched off — that is the PG-21 hang with extra steps. Unset it for the ${fallback}ms default` +
        (zeroDisables ? `, or set it to 0 to disable this guard on purpose.` : `.`),
    )
  }
  return n
}

/** Per-command deadline. Generous: a cold `Runtime.evaluate` can take seconds. */
export const DEFAULT_TIMEOUT_MS = msFromEnv('CDP_TIMEOUT_MS', process.env.CDP_TIMEOUT_MS, 30_000)

/**
 * How long the whole run may make no progress before it is declared wedged.
 *
 * Chosen against what this suite actually does, not rounded off a hunch. The
 * longest windows in which a *healthy* run legitimately issues no CDP command
 * at all, measured by reading the specs:
 *
 *   | source                                                   |     ms |
 *   |----------------------------------------------------------|--------|
 *   | `v-select-text` native checks — `await wait(9000)`        |  9 000 |
 *   | `interactions.mjs` — settle after `fresh()` navigates     |  2 200 |
 *   | `throughReload` — backoff between attempts                |  1 200 |
 *   | worst case, if all three land back to back                | 12 400 |
 *
 * So ~12.4 s is the ceiling on healthy silence, and 120 000 ms is ~10x it. The
 * other direction matters just as much: this must never cut short work that is
 * slow *on purpose*, and `geometry.mjs` spends up to `GEOMETRY_PROBE_BUDGET_MS`
 * (300 000 ms) inside a single `Runtime.evaluate`. It does not have to be
 * special-cased, because while any command is in flight the watchdog defers to
 * **that command's own deadline** rather than to this number — see
 * `diagnoseStall`. This budget only ever applies when nothing is in flight,
 * which is precisely the state no other clock in this file covers.
 *
 * Two minutes is also short enough to be a diagnosis rather than a CI job
 * timeout, which is the whole complaint: 14 minutes of silence produced no
 * verdict, and a job timeout produces no verdict either.
 *
 * `CDP_STALL_MS=0` disables it, for a script that legitimately parks a CDP
 * connection while it does something else for minutes.
 */
export const DEFAULT_STALL_MS = msFromEnv('CDP_STALL_MS', process.env.CDP_STALL_MS, 120_000, {
  zeroDisables: true,
})

/**
 * Slack on top of a command's own deadline before the watchdog calls it dead.
 *
 * Only reached when the `setTimeout` in `send` did not fire — an event loop
 * starved by a page that is pegging the CPU, or a bug here. It has to be wide
 * enough not to race a timer that is merely late on a loaded box (PG-24 measured
 * this machine at 100% all-core under 20 spinning processes).
 */
const STALL_GRACE_MS = 5_000

/** How long `Cdp.connect` waits for the WebSocket upgrade before giving up. */
export const DEFAULT_HANDSHAKE_MS = 15_000

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

export async function launchChrome({
  port = 9333,
  headless = true,
  windowSize = '1280,1400',
  /**
   * Total budget for "Chrome is serving CDP".
   *
   * The loop this replaces was `for (i = 0; i < 60; i++)` with a 250 ms sleep,
   * i.e. 15 s of sleeping plus 60 unbounded `fetch` round trips — a budget with
   * no ceiling, which is the bug. 30 s is deliberately the generous reading of
   * that: PG-24 measured this machine pinned at 100% all-core by a neighbouring
   * agent, and a cold Chrome start under that is slow but not broken. The point
   * here is that the budget *exists*, not that it is tight.
   */
  bootMs = 30_000,
  /** Per-attempt budget for the `/json/version` probe. See PG-21 below. */
  probeMs = 2_000,
} = {}) {
  // Whatever happens next, the browser must not outlive this process. The
  // 14-minute hang left an orphan Chrome holding its profile directory until it
  // was killed by hand; `installExitCleanup` is what makes Ctrl-C enough.
  installExitCleanup()
  // PG-25. Two halves of one leak. The directory below is registered so the
  // teardown deletes it after the browser is dead, and the sweep collects what
  // an earlier run could not: a `kill -9` of node runs no exit handler at all.
  // 28 directories and 1.5 GB had accumulated under $TMPDIR before either
  // existed, and not only from runs that went wrong — a `pnpm deeplinks` that
  // passed 316/316 left one behind too.
  sweepStaleProfileDirs(PROFILE_PREFIX)
  const userDataDir = registerProfileDir(mkdtempSync(join(tmpdir(), PROFILE_PREFIX)))
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
  // `detached` so Chrome gets its own process group: the browser, the GPU
  // process and one renderer per tab are a *tree*, and SIGKILLing only the
  // browser reparents the rest to init, where they sit on 300 MB and the
  // profile directory. `watchdog.mjs` kills the group, which needs one.
  const proc = spawn(findChrome(), args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  registerChild(proc)
  let log = ''
  proc.stdout.on('data', (c) => (log += c))
  proc.stderr.on('data', (c) => (log += c))

  let version
  const deadline = Date.now() + bootMs
  let attempts = 0
  while (Date.now() < deadline) {
    attempts++
    try {
      // PG-21. `fetch` has NO default timeout, and this loop only *looks* like
      // it has a retry budget: Chrome binds the debugging port before it can
      // serve on it, so an attempt can connect and then wait for a response
      // that never comes — forever, consuming every remaining retry as one
      // `await` that never returns. That is the exact shape of the observed
      // hang (ESTABLISHED socket to the debugging port, node at 0% CPU), and
      // it is why the retry count is now a wall-clock deadline instead.
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(probeMs),
      })
      if (res.ok) { version = await res.json(); break }
    } catch { /* not up yet, or this attempt hit its own deadline */ }
    await sleep(250)
  }
  if (!version) {
    proc.kill('SIGKILL')
    throw new Error(
      `Chrome never exposed CDP on port ${port}: ${attempts} probe(s) over ${bootMs}ms, each capped ` +
        `at ${probeMs}ms, none answered /json/version.\n${log}`,
    )
  }
  return { proc, wsUrl: version.webSocketDebuggerUrl, port, userDataDir }
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

/**
 * One line saying what a command was *about*, for the stall diagnostic.
 *
 * Kept deliberately dumb and lossy: it is read by a human at the moment a run
 * has already gone wrong, so the only requirement is that it be enough to
 * identify the card. For `Runtime.evaluate` that falls out for free —
 * `interactions.mjs` compiles the check body into the expression and every
 * check opens by naming its demo file.
 */
function fingerprint(method, params) {
  const one = (v) => String(v).replace(/\s+/g, ' ').trim().slice(0, 200)
  if (params?.expression) return one(params.expression)
  if (params?.functionDeclaration) return one(params.functionDeclaration)
  if (params?.url) return one(params.url)
  if (method.startsWith('Input.')) {
    return one(`${params?.type ?? '?'} ${params?.key ?? ''} at ${params?.x ?? '?'},${params?.y ?? '?'}`)
  }
  if (params?.origin) return one(params.origin)
  return ''
}

export class Cdp {
  constructor(ws, { timeoutMs = DEFAULT_TIMEOUT_MS, stallMs = DEFAULT_STALL_MS } = {}) {
    this.ws = ws
    this.id = 0
    this.timeoutMs = timeoutMs
    this.stallMs = stallMs
    this.pending = new Map()
    this.listeners = new Map()
    this.closed = false
    /** Every main-frame navigation this client saw — the contamination meter. */
    this.navigations = []
    /**
     * The progress clock. A command *settling* is the only thing counted, and
     * CDP events deliberately are not: a page that keeps logging to the console
     * would otherwise keep a thoroughly wedged run looking alive forever.
     */
    this.lastSettledAt = Date.now()
    this.lastSettled = null
    // PG-21. Nothing below this line knows where the run might get stuck, and
    // that is the design: `send` is on a clock, but `send` was never the only
    // place this harness waits.
    this.watchdog = stallMs > 0
      ? startWatchdog({
          diagnose: () => this.diagnoseStall(),
          onFire: () => { try { this.ws.close() } catch { /* already gone */ } },
        })
      : null

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
    const handshakeMs = options?.handshakeMs ?? DEFAULT_HANDSHAKE_MS
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      // PG-21. The second unbounded `await` in this file. `open` and `error`
      // are the only two events this ever waited on, and a socket that is
      // accepted at the TCP level but never completes the HTTP upgrade emits
      // neither — so a Chrome that is alive but wedged parked the whole run
      // here, before a single line of output, with nothing to show for it.
      const timer = setTimeout(() => {
        try { ws.close() } catch { /* never opened */ }
        reject(
          new Error(
            `CDP WebSocket handshake to ${wsUrl} did not complete within ${handshakeMs}ms. ` +
              `The port answered /json/version, so Chrome is up but not talking — usually a browser ` +
              `left over from an earlier run holding the port. Check for a stray Chrome.`,
          ),
        )
      }, handshakeMs)
      const done = (fn, value) => { clearTimeout(timer); fn(value) }
      ws.addEventListener('open', () => done(resolve), { once: true })
      ws.addEventListener('error', () => done(reject, new Error('CDP socket failed')), { once: true })
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

  /**
   * The watchdog's only question: is this run still making progress?
   *
   * Two states, because they mean opposite things and want different budgets.
   *
   * **Something is in flight.** Its own deadline is the promise that was made
   * about it, so anything short of that is healthy *by definition* — this is
   * what lets `geometry.mjs` spend five minutes inside one `Runtime.evaluate`
   * without being killed for it. Past that deadline plus `STALL_GRACE_MS` means
   * the `setTimeout` in `send` did not fire, which is a fault in this file, not
   * in the page, and is worth saying out loud.
   *
   * **Nothing is in flight.** Then no other clock in this file is running at
   * all, and `DEFAULT_STALL_MS` is the only thing standing between a wedge
   * somewhere else — `fetch`, a spec helper, the dev server — and another
   * 14-minute silence.
   *
   * @returns {string|null} the diagnostic, or null while the run is healthy
   */
  diagnoseStall() {
    if (this.closed) return null
    const now = Date.now()
    const inFlight = [...this.pending.values()]

    if (inFlight.length) {
      const overdue = inFlight.filter((e) => {
        const budget = e.timeout > 0 ? e.timeout : this.stallMs
        return now - e.startedAt > budget + STALL_GRACE_MS
      })
      if (!overdue.length) return null
      // Two different faults share this branch and must not be reported as one
      // another: a command that HAD a deadline and outlived it means the timer
      // in `send` did not fire, which is a bug in this file. A command sent
      // with `{ timeout: 0 }` never had one, and is exactly the documented
      // escape hatch this watchdog exists to keep honest.
      const unclocked = overdue.filter((e) => !(e.timeout > 0)).length
      return this.stallReport(now, inFlight, {
        why:
          `${overdue.length} of ${inFlight.length} in-flight CDP command(s) outlived their own ` +
          `deadline by more than ${STALL_GRACE_MS}ms — ` +
          (unclocked === overdue.length
            ? `sent with { timeout: 0 }, so nothing but this watchdog was ever going to end them`
            : unclocked
              ? `${unclocked} of them with no deadline at all; for the rest the per-command timer did not fire`
              : `the per-command timer did not fire`),
      })
    }

    const quietFor = now - this.lastSettledAt
    if (quietFor <= this.stallMs) return null
    return this.stallReport(now, inFlight, {
      why:
        `no CDP command has settled for ${quietFor}ms and none is in flight, so nothing in this ` +
        `client is on a clock — the run is waiting on something else`,
    })
  }

  /**
   * The message the 14-minute hang never printed.
   *
   * "Timed out" on its own would repeat the defect in a new colour, so this
   * names the method, the elapsed time, and — this is the one that matters when
   * you are reading it at 2am — *which card* was being driven. It is knowable
   * here without any cooperation from the runner: `interactions.mjs` compiles
   * each check into the `Runtime.evaluate` expression, and every check opens by
   * naming its demo file (`__pg.stage('09-contenteditable.vue')`). Navigating
   * to `?run=N#<library>` pins the tab the same way.
   */
  stallReport(now, inFlight, { why }) {
    const ago = (t) => `${now - t}ms ago`
    const nav = this.navigations.at(-1)
    const lines = [
      `CDP STALL — this run is wedged and will not produce a verdict (PG-21).`,
      ``,
      `  why .............. ${why}`,
      `  last settled ..... ${this.lastSettled
        ? `${this.lastSettled.method} (${ago(this.lastSettled.at)})${this.lastSettled.describe ? `\n                     ${this.lastSettled.describe}` : ''}`
        : 'nothing has ever settled on this connection'}`,
      `  last navigation .. ${nav ? `${nav.url} (${ago(nav.at)})` : 'none seen'}`,
      `  navigations ...... ${this.navigations.length}`,
      `  in flight ........ ${inFlight.length || 'nothing'}`,
    ]
    for (const e of inFlight) {
      lines.push(
        `      ${e.method} — ${now - e.startedAt}ms in flight, ` +
          `${e.timeout > 0 ? `${e.timeout}ms deadline` : 'NO deadline (timeout: 0)'}` +
          `${e.sessionId ? `, session ${e.sessionId.slice(0, 8)}…` : ''}`,
      )
      if (e.describe) lines.push(`        ${e.describe}`)
    }
    lines.push(
      ``,
      `Chrome and every child of this process (the Vite dev server included) are being killed now, ` +
        `so nothing is left holding a port or a profile directory. Exit code ${EXIT_WEDGED} means ` +
        `"no verdict", which is a different thing from "checks failed" (1) or "refused to run" (2).`,
      ``,
      `If the work above is genuinely this slow, raise the budget it belongs to rather than this one: ` +
        `CDP_TIMEOUT_MS (per command, now ${this.timeoutMs}ms) or CDP_STALL_MS (no progress at all, ` +
        `now ${this.stallMs}ms; 0 disables).`,
    )
    return lines.join('\n')
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
    const describe = fingerprint(method, params)

    return new Promise((resolve, reject) => {
      const settle = (fn, value) => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        if (entry.timer) clearTimeout(entry.timer)
        // The progress tick the watchdog reads. Recorded on *any* outcome —
        // a run that is failing every command is still a run that is moving,
        // and only silence means wedged.
        this.lastSettledAt = Date.now()
        this.lastSettled = { method, describe, at: this.lastSettledAt }
        fn(value)
      }
      const entry = {
        method,
        sessionId,
        startedAt,
        survivesNavigation,
        timeout,
        describe,
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
                `call. Raise CDP_TIMEOUT_MS if the work really takes this long.` +
                // Which card was being driven, so the failure is actionable
                // without going and re-running the whole suite to find out.
                (describe ? `\n  in flight: ${describe}` : '') +
                (this.navigations.at(-1) ? `\n  last navigation: ${this.navigations.at(-1).url}` : ''),
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
    // Before the socket, or the watchdog watches a connection nobody is using
    // and eventually declares a finished run wedged.
    this.watchdog?.disarm()
    this.abandonOutstanding(undefined, 'closed', 'the client was closed while the command was in flight', true)
    try { this.ws.close() } catch { /* already gone */ }
  }
}

/** Attach to a fresh tab and return a page handle with evaluate/navigate. */
/**
 * A rejection reason, in the most specific form the protocol gave us.
 *
 * Order matters and each branch earns its place. An Error's `description`
 * carries the stack, so it wins outright. A primitive arrives as `value`.
 * A plain object arrives with `description: "Object"` — technically present
 * and completely useless — so its `preview` properties are rendered instead,
 * and `undefined`/`null` arrive with neither `value` nor `description` and
 * have to be read off `type`/`subtype`.
 *
 * All four were checked against a real Chrome rather than reasoned about; the
 * middle two are exactly the shapes that used to collapse into the single
 * string "Uncaught (in promise)".
 */
const describeRemote = (ex, text) => {
  if (!ex) return text
  if (ex.subtype === 'error' && ex.description) return ex.description
  if ('value' in ex) return `${text}: ${JSON.stringify(ex.value)}`
  if (ex.preview?.properties?.length) {
    const body = ex.preview.properties.map((pr) => `${pr.name}: ${pr.value}`).join(', ')
    return `${text}: ${ex.className ?? 'Object'} { ${body} }`
  }
  if (ex.type === 'undefined') return `${text}: undefined`
  if (ex.subtype === 'null') return `${text}: null`
  if (ex.description) return `${text}: ${ex.description}`
  if (ex.className) return `${text}: ${ex.className}`
  return text
}

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
  /**
   * An unhandled rejection whose reason is not an Error has no `description`,
   * so this used to fall through to `d.text` — the literal string
   * "Uncaught (in promise)", with nothing about what rejected or where.
   *
   * Five of those failed the daily workflow for two days running and said
   * exactly that, five times. A failure report nobody can act on is barely
   * better than a green run that was wrong, so every part the protocol offers
   * is kept: the reason (an Error's stack, a primitive's value, or at least the
   * constructor name), the throw site, and the top of the stack.
   */
  cdp.on('Runtime.exceptionThrown', (p, sid) => {
    if (sid !== sessionId) return
    const d = p.exceptionDetails
    const ex = d.exception
    const reason = describeRemote(ex, d.text)
    const at = d.url ? `${d.url}:${(d.lineNumber ?? 0) + 1}:${(d.columnNumber ?? 0) + 1}` : null
    const frames = (d.stackTrace?.callFrames ?? [])
      .slice(0, 4)
      .map((f) => `    at ${f.functionName || '<anonymous>'} (${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1})`)
    pageErrors.push([reason, at ? `    thrown at ${at}` : null, ...frames].filter(Boolean).join('\n'))
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

/* ---------------------------------------------------------------------------
 * Negative control — `node scripts/lib/cdp.mjs`
 *
 * BOARD.md: "a gate that can't fail is worthless; run the negative control
 * before believing a pass." Everything below drives a **real** headless Chrome
 * into a **real** hang and asserts the run comes back. Nothing is stubbed,
 * because the bug being guarded against was precisely a clock that looked
 * present and did not bound the thing that actually hung.
 *
 * Three claims, tested separately because they fail separately:
 *
 *   1. `deadline` — a `Runtime.evaluate` Chrome will never answer is rejected,
 *      and the error names the method, the elapsed time and the card.
 *      (`stallMs: 0` here, so the watchdog cannot take the credit.)
 *   2. `stall` — a wedge with **nothing in flight**, which is the one no clock
 *      in this file used to cover: every CDP command has settled and the run is
 *      parked on a promise that will never resolve. This is the reproduction of
 *      the 14-minute hang.
 *   3. `overdue` — a command sent with the documented `{ timeout: 0 }` escape
 *      hatch, i.e. with the clock in `send` switched off on purpose. This is
 *      the watchdog's other branch (something IS in flight) and it is what
 *      makes `timeout: 0` no longer a way to reintroduce the original bug.
 *   4. no leak — after (2), the Chrome it launched and the stand-in dev server
 *      beside it are both gone. A timeout that orphans the processes it was
 *      meant to clean up has only moved the mess. Its profile directory is
 *      gone too, which is PG-25: the processes were always reaped, the profile
 *      directory beside them never was.
 *   5. profile directories (PG-25), the case the wedge does not cover, because
 *      the leak was never about wedging: a run that ends *cleanly* removes its
 *      own profile, a day-old one left by a `kill -9`'d run is swept at the
 *      next launch, and one from a run still in flight is left alone.
 * ------------------------------------------------------------------------ */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { spawnSync } = await import('node:child_process')
  const { freePort } = await import('./port.mjs')
  const mode = process.env.CDP_NEG_MODE

  /** A card name, planted where a real check would put it. */
  const NEVER_SETTLES = `(async () => {
    const card = '09-contenteditable.vue'
    await new Promise(() => {})
    return card
  })()`

  if (mode === 'deadline') {
    const chrome = await launchChrome({ port: await freePort() })
    const cdp = await Cdp.connect(chrome.wsUrl, { timeoutMs: 3_000, stallMs: 0 })
    const page = await newPage(cdp)
    const t0 = Date.now()
    try {
      await page.evaluate(NEVER_SETTLES)
      console.log('NO-DEADLINE — it resolved, which should be impossible')
    } catch (err) {
      console.log(`DEADLINE after ${Date.now() - t0}ms\n${err.message}`)
    }
    cdp.close()
    process.exit(0)
  } else if (mode === 'stall') {
    const chrome = await launchChrome({ port: await freePort() })
    const cdp = await Cdp.connect(chrome.wsUrl)
    const page = await newPage(cdp)
    // One command that *does* settle, so the diagnostic has a card to name.
    await page.evaluate(`(async () => { const card = '09-contenteditable.vue'; return card })()`)
    // Stand-in for the Vite server `interactions.mjs` spawns and this module
    // has no handle on. It has to die with the run all the same.
    const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' })
    console.log(`CHROME_PID=${chrome.proc.pid} SERVER_PID=${server.pid} PROFILE=${chrome.userDataDir}`)
    await new Promise(() => {}) // the hang — outside send(), exactly as observed
  } else if (mode === 'overdue') {
    const chrome = await launchChrome({ port: await freePort() })
    const cdp = await Cdp.connect(chrome.wsUrl)
    const { sessionId } = await newPage(cdp)
    // `{ timeout: 0 }` is documented as "disables the deadline", and before the
    // watchdog that made it a documented way back into the PG-21 hang.
    await cdp.send(
      'Runtime.evaluate',
      { expression: NEVER_SETTLES, awaitPromise: true, returnByValue: true },
      sessionId,
      { timeout: 0 },
    )
    console.log('NO-WATCHDOG — the unbounded command returned, which should be impossible')
    process.exit(0)
  } else if (mode === 'sweep') {
    const { utimesSync, writeFileSync } = await import('node:fs')
    /** A profile directory as a dead run would have left it, aged on demand. */
    const plant = (ageMs) => {
      const dir = mkdtempSync(join(tmpdir(), PROFILE_PREFIX))
      // With a file in it, so that "swept" means the recursive walk ran rather
      // than an `rmdir` of an empty directory succeeding by luck.
      writeFileSync(join(dir, 'Preferences'), '{}')
      const at = (Date.now() - ageMs) / 1000
      utimesSync(dir, at, at) // after the write: writing to it touches the mtime
      return dir
    }
    const stale = plant(25 * 60 * 60 * 1000)
    const fresh = plant(0)
    const chrome = await launchChrome({ port: await freePort() })
    console.log(`STALE=${stale}\nFRESH=${fresh}\nMINE=${chrome.userDataDir}`)
    // Exactly how every runner in scripts/ ends: SIGKILL the browser, exit 0.
    // No wedge, no signal — the ordinary path that leaked 28 directories.
    chrome.proc.kill('SIGKILL')
    process.exit(0)
  } else {
    const run = (m, env) =>
      spawnSync(process.execPath, [process.argv[1]], {
        encoding: 'utf8',
        timeout: 90_000,
        env: { ...process.env, CDP_NEG_MODE: m, ...env },
      })
    const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
    const fails = []

    console.log('1. per-command deadline — Chrome is alive and will never answer\n')
    const d = run('deadline')
    process.stdout.write(`${(d.stdout ?? '').trim()}\n${(d.stderr ?? '').trim()}\n`)
    for (const [what, ok] of [
      ['rejected rather than hung', /DEADLINE after \d+ms/.test(d.stdout ?? '')],
      ['names the method', /CDP Runtime\.evaluate timed out/.test(d.stdout ?? '')],
      ['names the elapsed time', /timed out after \d+ms/.test(d.stdout ?? '')],
      ['names the card in flight', /09-contenteditable\.vue/.test(d.stdout ?? '')],
    ]) {
      console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${what}`)
      if (!ok) fails.push(what)
    }

    console.log('\n2. stall watchdog — nothing in flight, the run is parked forever\n')
    const t0 = Date.now()
    const w = run('stall', { CDP_STALL_MS: '3000' })
    const took = Date.now() - t0
    const pids = /CHROME_PID=(\d+) SERVER_PID=(\d+)/.exec(w.stdout ?? '')
    const wedgedProfile = /PROFILE=(\S+)/.exec(w.stdout ?? '')?.[1]
    process.stdout.write(`${(w.stderr ?? '').trim()}\n`)
    const leaked = pids ? [Number(pids[1]), Number(pids[2])].filter(alive) : ['(no pids reported)']
    for (const [what, ok] of [
      [`gave up (whole child run took ${took}ms, not forever)`, w.status !== null],
      [`exited ${EXIT_WEDGED} = no verdict`, w.status === EXIT_WEDGED],
      ['said CDP STALL', /CDP STALL/.test(w.stderr ?? '')],
      ['named what it was last doing', /09-contenteditable\.vue/.test(w.stderr ?? '')],
      ['left no orphan Chrome or dev server', leaked.length === 0],
      // PG-25. The stall report has always promised "nothing is left holding a
      // port or a profile directory"; only the first half was ever true.
      [
        `left no orphan profile directory (${wedgedProfile ?? 'none reported'})`,
        Boolean(wedgedProfile) && !existsSync(wedgedProfile),
      ],
    ]) {
      console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${what}`)
      if (!ok) fails.push(what)
    }
    for (const pid of leaked) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }

    console.log('\n3. stall watchdog — a command sent with the deadline disabled ({ timeout: 0 })\n')
    const o = run('overdue', { CDP_STALL_MS: '3000' })
    process.stdout.write(`${(o.stderr ?? '').trim()}\n`)
    for (const [what, ok] of [
      [`exited ${EXIT_WEDGED} rather than hanging`, o.status === EXIT_WEDGED],
      ['reported it as the in-flight branch', /outlived their own deadline/.test(o.stderr ?? '')],
      ['flagged the missing deadline', /NO deadline \(timeout: 0\)/.test(o.stderr ?? '')],
      ['named the card in flight', /09-contenteditable\.vue/.test(o.stderr ?? '')],
    ]) {
      console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${what}`)
      if (!ok) fails.push(what)
    }

    console.log('\n4. profile directories — swept when stale, kept when live, removed on a clean exit\n')
    const s = run('sweep')
    process.stdout.write(`${(s.stdout ?? '').trim()}\n${(s.stderr ?? '').trim()}\n`)
    const reported = (key) => new RegExp(`^${key}=(.+)$`, 'm').exec(s.stdout ?? '')?.[1]
    const [stale, fresh, mine] = ['STALE', 'FRESH', 'MINE'].map(reported)
    for (const [what, ok] of [
      // Without this first claim every other one below passes on `undefined`,
      // because `existsSync(undefined)` is false — a gate that cannot fail.
      ['reported all three directories', Boolean(stale && fresh && mine)],
      ['swept the day-old profile at launch', Boolean(stale) && !existsSync(stale)],
      ['left the profile of a live run alone', Boolean(fresh) && existsSync(fresh)],
      ['removed its own profile on a CLEAN exit', Boolean(mine) && !existsSync(mine)],
    ]) {
      console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${what}`)
      if (!ok) fails.push(what)
    }
    const { rmSync } = await import('node:fs')
    for (const dir of [stale, fresh, mine]) if (dir) rmSync(dir, { recursive: true, force: true })

    console.log(
      fails.length
        ? `\nFAIL — ${fails.length} claim(s) unproven: ${fails.join('; ')}`
        : '\nPASS — every wait in this file is bounded, a wedge is reported, and nothing is left behind.',
    )
    process.exit(fails.length ? 1 : 0)
  }
}
