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
 * ## PG-25: it reaped the processes and left 1.5 GB of profiles behind
 *
 * Measured 2026-09-17: 28 orphaned `dz-cdp-*` directories under `$TMPDIR`,
 * 1.5 GB, one per browser-driving run since 2026-09-15 — and not only from the
 * runs that wedged. `launchChrome` hands Chrome a throwaway profile made with
 * `mkdtempSync`, and nothing on any exit path ever removed it: a clean
 * `pnpm deeplinks` that passed 316/316 still left one behind.
 *
 * Killing the process tree and deleting its profile are one job, so they live
 * in one place and in one fixed order — `teardown()` below. The order is not
 * cosmetic: Chrome writes to that directory until it is dead.
 *
 * The one exit no handler here can cover is a `kill -9` of node itself, which
 * is how the PG-21 hang was ended by hand more than once. Nothing inside that
 * process gets to clean up, so the *next* run does it:
 * `sweepStaleProfileDirs` drops anything older than a day. Self-healing and
 * bounded, rather than a README asking someone to `rm -rf` now and then.
 *
 * Per BOARD.md's standing acceptance criteria, a gate that cannot be shown
 * failing is worthless, so:
 *
 *     node scripts/lib/watchdog.mjs        # negative control — proves it fires
 */
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
 * Throwaway Chrome profile directories to delete on the way out.
 *
 * The other half of `registered` above, and PG-25's whole point: a run that
 * kills the browser and leaves the profile behind has not cleaned up, it has
 * leaked something quieter than a process — the 28 found under `$TMPDIR` ran
 * from 8 MB to 166 MB each.
 */
const registeredProfileDirs = new Set()

/** Register a profile directory so the teardown deletes it. Returns `dir`. */
export function registerProfileDir(dir) {
  registeredProfileDirs.add(dir)
  return dir
}

/**
 * Delete a directory tree, best effort, synchronously.
 *
 * `maxRetries` is the Chrome race, not superstition: SIGKILL is delivered
 * asynchronously, so the browser can still flush a file between the recursive
 * walk emptying a directory and the `rmdir` of it, which surfaces as ENOTEMPTY.
 * Retrying is Node's own answer to exactly that. And it never throws, because
 * this also runs inside `process.on('exit')`, where an exception would turn a
 * finished run into a crash over a temp directory.
 */
function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  } catch { /* the startup sweep below collects whatever is left */ }
}

/** Delete every registered profile directory. Ordering matters — see `teardown`. */
export function removeRegisteredProfileDirs() {
  for (const dir of [...registeredProfileDirs]) {
    registeredProfileDirs.delete(dir)
    removeDir(dir)
  }
}

/**
 * Delete leftover profile directories from runs that are long over.
 *
 * A day is the threshold because it cannot plausibly belong to a live run — the
 * longest gate in this repo is minutes — and because `mkdtempSync` stamps the
 * directory at creation, so "old" means "started long ago" even for a profile
 * Chrome stopped writing to immediately. Directories this process registered
 * are skipped outright: they are in use by definition.
 *
 * @param {string} prefix        the `mkdtempSync` prefix that marks them as ours
 * @param {object} [options]
 * @param {number} [options.maxAgeMs]  how old is "long over"
 * @param {string} [options.root]      where to look; the temp dir by default
 * @returns {string[]} the directories removed, so a caller can report them
 */
export function sweepStaleProfileDirs(prefix, { maxAgeMs = 24 * 60 * 60 * 1000, root = tmpdir() } = {}) {
  const cutoff = Date.now() - maxAgeMs
  const swept = []
  let names
  try { names = readdirSync(root) } catch { return swept } // no temp dir: nothing to sweep
  for (const name of names) {
    if (!name.startsWith(prefix)) continue
    const dir = join(root, name)
    if (registeredProfileDirs.has(dir)) continue
    let mtimeMs
    try { mtimeMs = statSync(dir).mtimeMs } catch { continue } // another run got there first
    if (mtimeMs > cutoff) continue
    removeDir(dir)
    swept.push(dir)
  }
  return swept
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

/**
 * The whole teardown, in the only order that is safe.
 *
 * Processes first. Chrome writes to its profile until it is dead, so deleting
 * the directory out from under a live browser races it: files reappear as fast
 * as they are removed and the final `rmdir` fails. Kill, then delete. PG-25.
 *
 * Synchronous throughout, because this runs from `process.on('exit')` too,
 * where nothing asynchronous gets another turn.
 */
export function teardown() {
  reapOwnChildren()
  removeRegisteredProfileDirs()
}

let signalsInstalled = false

/**
 * Run the teardown on every way out — including the ordinary one.
 *
 * Ctrl-C used to leave headless Chrome running, because a `detached` child does
 * not receive the terminal's SIGINT and a non-detached one is merely reparented
 * rather than killed. Handling the signal means we have to re-exit explicitly —
 * installing a handler removes the default "terminate" behaviour.
 *
 * `process.on('exit')` is doing more work than its name suggests, and PG-25 is
 * why it is worth pointing at: it fires on the *clean* finish too, which is the
 * path every green run takes and the path that leaked 28 profile directories.
 * The runners SIGKILL Chrome themselves and exit 0; nobody deleted the profile
 * directory it was sitting on, because nobody was asked to.
 */
export function installExitCleanup() {
  if (signalsInstalled) return
  signalsInstalled = true
  process.on('exit', teardown)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      teardown()
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
    teardown()
    process.exit(EXIT_WEDGED)
  }, tickMs)
  timer.unref?.()
  return { disarm: () => clearInterval(timer) }
}

/* ---------------------------------------------------------------------------
 * Negative control — `node scripts/lib/watchdog.mjs`
 *
 * BOARD.md: "a gate that cannot fail is worthless; run the negative control
 * before believing a pass." Three things are asserted here, because the
 * watchdog has three jobs and they fail independently:
 *
 *   1. it fires, exits `EXIT_WEDGED`, and prints the diagnostic;
 *   2. the child processes are gone afterwards — a timeout that leaks the
 *      processes it was supposed to clean up has only changed the shape of the
 *      mess, not removed it;
 *   3. the registered profile directory is gone too (PG-25). This one was
 *      failing silently for every run, wedged or clean, until 28 directories
 *      and 1.5 GB of them piled up under `$TMPDIR`.
 * ------------------------------------------------------------------------ */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { existsSync, mkdtempSync, rmSync: rmSyncNeg, writeFileSync } = await import('node:fs')
  if (process.env.WATCHDOG_NEG_CHILD) {
    // The wedged run, in miniature: a child that will never exit on its own,
    // and a promise that will never settle. Nothing here has a timeout.
    const victim = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' })
    // A stand-in for Chrome's profile, with a file in it so that "removed"
    // means the recursive walk ran and not just an `rmdir` of an empty dir.
    const profile = registerProfileDir(mkdtempSync(join(tmpdir(), 'dz-cdp-neg-')))
    writeFileSync(join(profile, 'Preferences'), '{}')
    const startedAt = Date.now()
    startWatchdog({
      tickMs: 100,
      diagnose: () =>
        Date.now() - startedAt < 600
          ? null
          : `WEDGED: nothing has made progress for ${Date.now() - startedAt}ms. child pid ${victim.pid}`,
    })
    console.log(`CHILD_PID=${victim.pid} PROFILE_DIR=${profile}`)
    await new Promise(() => {}) // the hang under test
  } else {
    const out = spawnSync(process.execPath, [process.argv[1]], {
      encoding: 'utf8',
      env: { ...process.env, WATCHDOG_NEG_CHILD: '1' },
      timeout: 30_000,
    })
    const pid = Number(/CHILD_PID=(\d+)/.exec(out.stdout ?? '')?.[1])
    const profile = /PROFILE_DIR=(\S+)/.exec(out.stdout ?? '')?.[1]
    const stillAlive = (() => { try { process.kill(pid, 0); return true } catch { return false } })()
    // PG-25. `undefined` would make `existsSync` return false and this claim
    // pass without a directory ever having been made, which is the exact shape
    // of a gate that cannot fail.
    const profileLeft = profile ? existsSync(profile) : true
    const firedOk = out.status === EXIT_WEDGED && /WEDGED: nothing has made progress/.test(out.stderr ?? '')
    console.log(`  exit status ........ ${out.status} (want ${EXIT_WEDGED})`)
    console.log(`  diagnostic ......... ${(out.stderr ?? '').trim().split('\n').pop()}`)
    console.log(`  grandchild ${pid} .. ${stillAlive ? 'STILL ALIVE — leaked' : 'reaped'}`)
    console.log(`  profile dir ........ ${profileLeft ? `STILL THERE — leaked ${profile ?? '(none reported)'}` : `removed (${profile})`}`)
    const ok = firedOk && !stillAlive && !profileLeft
    console.log(ok ? '\nPASS — the watchdog fires and leaves neither a process nor a profile.' : '\nFAIL')
    if (stillAlive) try { process.kill(pid, 'SIGKILL') } catch { /* gone */ }
    if (profile) rmSyncNeg(profile, { recursive: true, force: true })
    process.exit(ok ? 0 : 1)
  }
}
