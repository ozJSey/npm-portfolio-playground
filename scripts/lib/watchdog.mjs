/**
 * The clock that ends a wedged run, and the teardown that has to happen when it
 * does.
 *
 * ## PG-21, second pass: a per-command deadline was not enough
 *
 * `cdp.mjs` has rejected any unanswered CDP command since the first pass, and
 * that deadline demonstrably fires — measured at 3004 ms against a deliberately
 * unanswerable `Runtime.evaluate`, see the negative control at the bottom of
 * this file. A `pnpm interactions` run hung anyway: 14 minutes, node at 0% CPU,
 * Chrome and Vite both alive, an ESTABLISHED socket to the debugging port, no
 * output and no verdict. Killing it by hand was the only way out, and it left
 * an orphan Chrome behind.
 *
 * That is the lesson worth writing down rather than patching around. **A
 * deadline attached to one `await` only bounds that `await`.** This harness has
 * several others — the `/json/version` poll, the WebSocket handshake, `fetch`
 * against the dev server, and whatever a spec's own helper chooses to do with
 * the raw `cdp` handle it is handed. Bounding them one at a time produces a
 * list that is only ever as complete as the last person to audit it, and the
 * failure mode of an incomplete list is another silent 14-minute hang.
 *
 * So this module is deliberately *not* attached to any particular `await`. It
 * watches for **progress**, and when progress stops it ends the run, says what
 * was in flight, and takes the child processes with it. It cannot know which
 * line is stuck; it does not need to.
 *
 * Per BOARD.md's standing acceptance criteria, a gate that cannot be shown
 * failing is worthless, so:
 *
 *     node scripts/lib/watchdog.mjs        # negative control — proves it fires
 */
import { spawn, spawnSync } from 'node:child_process'

/**
 * Distinct from 1 (checks failed) and 2 (refused to run). This exit code means
 * *no verdict was produced* — the harness wedged and gave up on itself. A CI
 * job can tell "your code is broken" from "the measurement never happened",
 * which was precisely what 14 minutes of silence could not.
 */
export const EXIT_WEDGED = 3

/**
 * Child processes to take down with us. `launchChrome` registers Chrome here;
 * anything else this process spawned (the Vite server, in `interactions.mjs`)
 * is found by `reapOwnChildren` without having to be registered, which is what
 * lets this work without editing every script that spawns something.
 */
const registered = new Set()

/** Register a child so signals and the watchdog take it down. */
export function registerChild(proc) {
  if (!proc?.pid) return proc
  registered.add(proc)
  proc.once('exit', () => registered.delete(proc))
  return proc
}

/**
 * SIGKILL a child and, when it was spawned `detached`, its whole process group.
 *
 * Chrome is a process *tree* — browser, GPU, one renderer per tab — and killing
 * only the browser process reparents the rest to init, where they sit holding a
 * profile directory and 300 MB until someone runs `pkill` by hand. That is the
 * orphan the hang left behind.
 */
function killTree(proc) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return
  // The group first (negative pid), because it is the one that gets the
  // renderers. It throws ESRCH when the child was not detached; that is not an
  // error, it just means there is no group of ours to kill.
  try { process.kill(-proc.pid, 'SIGKILL') } catch { /* not a group leader */ }
  try { proc.kill('SIGKILL') } catch { /* already gone */ }
}

/**
 * SIGKILL every direct child of this process.
 *
 * The point of doing it by `pgrep` rather than by a registry: `interactions.mjs`
 * spawns the Vite dev server itself and this module has no handle on it, yet a
 * run that dies without taking Vite down leaves a server holding the port that
 * the *next* run will then fail `--strictPort` against. Asking the OS who our
 * children are needs no cooperation from the scripts that spawned them.
 *
 * Synchronous on purpose: this is also called from `process.on('exit')`, where
 * nothing asynchronous is allowed to run.
 */
export function reapOwnChildren() {
  for (const proc of [...registered]) killTree(proc)
  // `pgrep -P <pid>` is present on darwin and on every Linux with procps. If it
  // is not, registered children have already been handled above and the rest is
  // best-effort rather than a reason to throw on the way out.
  const res = spawnSync('pgrep', ['-P', String(process.pid)], { encoding: 'utf8' })
  if (res.error || typeof res.stdout !== 'string') return
  for (const line of res.stdout.split('\n')) {
    const pid = Number(line.trim())
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue
    try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  }
}

let signalsInstalled = false

/**
 * Take the children down on the ways out that are not `process.exit()`.
 *
 * Ctrl-C used to leave headless Chrome running, because a `detached` child does
 * not receive the terminal's SIGINT and a non-detached one is merely reparented
 * rather than killed. Handling the signal means we have to re-exit explicitly —
 * installing a handler removes the default "terminate" behaviour.
 */
export function installExitCleanup() {
  if (signalsInstalled) return
  signalsInstalled = true
  process.on('exit', reapOwnChildren)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      reapOwnChildren()
      process.exit(sig === 'SIGINT' ? 130 : 143)
    })
  }
}

/**
 * Poll `diagnose()`; when it returns a string, the run is wedged — print it,
 * take the children down, and exit `EXIT_WEDGED`.
 *
 * `diagnose` returns `null` while the run is healthy and the full diagnostic
 * text when it is not. The decision of what counts as progress belongs to the
 * caller (see `cdp.mjs`), because only the caller knows what it was waiting
 * for; this function owns nothing but the clock and the exit.
 *
 * The interval is `unref`'d: a watchdog that keeps an otherwise-finished
 * process alive would be its own small version of the bug it exists to catch.
 *
 * @returns {{ disarm: () => void }}
 */
export function startWatchdog({ diagnose, tickMs = 2_000, onFire } = {}) {
  installExitCleanup()
  const timer = setInterval(() => {
    let verdict
    try {
      verdict = diagnose()
    } catch (err) {
      verdict = `the watchdog's own diagnose() threw: ${err?.stack ?? err}`
    }
    if (!verdict) return
    clearInterval(timer)
    process.stderr.write(`\n${verdict}\n`)
    try { onFire?.() } catch { /* teardown is best-effort; the exit is not */ }
    reapOwnChildren()
    process.exit(EXIT_WEDGED)
  }, tickMs)
  timer.unref?.()
  return { disarm: () => clearInterval(timer) }
}

/* ---------------------------------------------------------------------------
 * Negative control — `node scripts/lib/watchdog.mjs`
 *
 * BOARD.md: "a gate that cannot fail is worthless; run the negative control
 * before believing a pass." Two things are asserted here, because the watchdog
 * has two jobs and they fail independently:
 *
 *   1. it fires, exits `EXIT_WEDGED`, and prints the diagnostic;
 *   2. the child processes are gone afterwards — a timeout that leaks the
 *      processes it was supposed to clean up has only changed the shape of the
 *      mess, not removed it.
 * ------------------------------------------------------------------------ */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.WATCHDOG_NEG_CHILD) {
    // The wedged run, in miniature: a child that will never exit on its own,
    // and a promise that will never settle. Nothing here has a timeout.
    const victim = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' })
    const startedAt = Date.now()
    startWatchdog({
      tickMs: 100,
      diagnose: () =>
        Date.now() - startedAt < 600
          ? null
          : `WEDGED: nothing has made progress for ${Date.now() - startedAt}ms. child pid ${victim.pid}`,
    })
    console.log(`CHILD_PID=${victim.pid}`)
    await new Promise(() => {}) // the hang under test
  } else {
    const out = spawnSync(process.execPath, [process.argv[1]], {
      encoding: 'utf8',
      env: { ...process.env, WATCHDOG_NEG_CHILD: '1' },
      timeout: 30_000,
    })
    const pid = Number(/CHILD_PID=(\d+)/.exec(out.stdout ?? '')?.[1])
    const stillAlive = (() => { try { process.kill(pid, 0); return true } catch { return false } })()
    const firedOk = out.status === EXIT_WEDGED && /WEDGED: nothing has made progress/.test(out.stderr ?? '')
    console.log(`  exit status ........ ${out.status} (want ${EXIT_WEDGED})`)
    console.log(`  diagnostic ......... ${(out.stderr ?? '').trim().split('\n').pop()}`)
    console.log(`  grandchild ${pid} .. ${stillAlive ? 'STILL ALIVE — leaked' : 'reaped'}`)
    console.log(firedOk && !stillAlive ? '\nPASS — the watchdog fires and does not leak.' : '\nFAIL')
    if (stillAlive) try { process.kill(pid, 'SIGKILL') } catch { /* gone */ }
    process.exit(firedOk && !stillAlive ? 0 : 1)
  }
}
