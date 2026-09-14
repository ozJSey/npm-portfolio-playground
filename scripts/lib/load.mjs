#!/usr/bin/env node
/**
 * Is this machine quiet enough to time anything on it? (PG-24)
 *
 * The same 330-check `interactions` suite, same commit, twice: 196/330 with
 * three `npm test` suites and two `vue-tsc` runs overlapping, 330/330 with the
 * machine to itself. Every one of the 134 failures was timing-shaped — "the
 * fixed window keeps saving while the debounced key waits", "flush() sends
 * immediately". None was a geometry or state assertion.
 *
 * A false red costs more than a false green: 134 failures is too many to read,
 * so the one real regression hiding among them is never found. Same discipline
 * as PG-18/21/22 — a gate that cannot trust its own result says so instead of
 * printing a number.
 *
 *   node scripts/lib/load.mjs          # print what this box is doing right now
 *   NEG=1 node scripts/lib/load.mjs    # negative control: saturate, must refuse
 *
 * ## Why utilization, and not the two signals you would reach for first
 *
 * Measured on this machine (10 cores, darwin 24.6), idle vs. 20 spinning
 * processes:
 *
 * | signal                                  | idle   | saturated | usable |
 * |-----------------------------------------|--------|-----------|--------|
 * | `os.cpus()` idle-tick delta             | 0.13   | 1.00      | yes    |
 * | `os.loadavg()[0] / cores`               | 1.52   | 1.65      | NO     |
 * | median `setTimeout(20)` overshoot, node | 1.12ms | 1.15ms    | NO     |
 *
 * `loadavg` is doubly wrong here: darwin counts blocked threads, so an idle box
 * reads 1.5-2.0 per core and a gate built on it would refuse to start on a
 * quiet machine — and it is a one-minute exponential average, so it barely
 * moves in the seconds after another agent kicks off a build. Node-side timer
 * jitter is wrong for a subtler reason: the darwin scheduler keeps a
 * mostly-idle process responsive, so the runner's own timers stay accurate
 * while the *renderer* it is driving starves. The contention bites in Chrome,
 * not here, which is exactly why the failures were page-side.
 *
 * That leaves the tick delta: instantaneous, machine-independent, 0..1.
 */
import os from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

/** Refuse to start above this. The box's own idle floor here is ~0.15. */
const DEFAULT_MAX = Number(process.env.BUSY_MAX_CPU ?? 0.5)
/** Sampled *during* a run, where the run is itself most of the load. */
const DEFAULT_SATURATED = Number(process.env.BUSY_SATURATED_CPU ?? 0.9)

const ticks = () =>
  os.cpus().reduce(
    (a, c) => {
      a.idle += c.times.idle
      a.total += Object.values(c.times).reduce((x, y) => x + y, 0)
      return a
    },
    { idle: 0, total: 0 },
  )

/**
 * Fraction of all cores busy over `windowMs`, as the kernel counted it.
 * 0 = nothing running, 1 = every core pinned.
 */
export async function cpuUtilization(windowMs = 500) {
  const a = ticks()
  await sleep(windowMs)
  const b = ticks()
  const total = b.total - a.total
  return total > 0 ? Math.min(1, Math.max(0, 1 - (b.idle - a.idle) / total)) : 0
}

/**
 * Keeps sampling in the background at ~2s so a run that starts on a quiet box
 * and is joined by someone else's build at check 140 still says so. Unref'd:
 * it never holds the process open.
 */
export function watchCpu({ everyMs = 2000, saturated = DEFAULT_SATURATED } = {}) {
  const samples = []
  let last = ticks()
  const timer = setInterval(() => {
    const now = ticks()
    const total = now.total - last.total
    if (total > 0) samples.push(Math.min(1, Math.max(0, 1 - (now.idle - last.idle) / total)))
    last = now
  }, everyMs)
  timer.unref()
  return {
    stop() {
      clearInterval(timer)
      const peak = samples.length ? Math.max(...samples) : 0
      const hot = samples.filter((s) => s >= saturated).length
      return { samples: samples.length, peak, hot, saturated, hotFraction: samples.length ? hot / samples.length : 0 }
    },
  }
}

/**
 * The gate. Returns the measurement when the box is quiet; exits 2 when it is
 * not, unless `ALLOW_BUSY=1` — in which case it returns with `degraded: true`
 * and the caller is expected to stamp every number it prints afterwards.
 */
export async function assertQuietEnough(command, { max = DEFAULT_MAX } = {}) {
  const utilization = await cpuUtilization()
  const pct = (n) => `${Math.round(n * 100)}%`

  /**
   * CI is the one place where a busy box is not a reason to stop.
   *
   * `.github/workflows/daily.yml` runs `pnpm interactions` on a 2-core
   * ubuntu-latest runner that is dedicated to this job — so high utilization
   * there means *our own* Vite and Chrome working, not a neighbour's build
   * stealing the renderer. Refusing would turn a green scheduled job red for
   * the very condition it is supposed to operate under, which is the
   * false-failure this gate exists to prevent, inverted.
   *
   * So: measure, say the number out loud, and carry on. The in-run watcher
   * still samples, so a genuinely pathological runner still gets reported at
   * the end rather than silently producing numbers nobody questions.
   */
  if (process.env.CI) {
    console.log(
      `  CI: ${os.cpus().length} cores, ${pct(utilization)} busy at start. ` +
        `The load gate does not refuse on a dedicated runner (PG-24); results are still stamped if it saturates.`,
    )
    return { utilization, max, degraded: false, ci: true }
  }

  if (utilization < max) return { utilization, max, degraded: false }

  const lines = [
    '',
    `REFUSING TO START — this machine is ${pct(utilization)} busy across ${os.cpus().length} cores.`,
    '',
    `  ${command} times debounce windows, in-flight writes and flush ordering in a real`,
    '  renderer. Under contention it produces failures that are not defects: the last run',
    '  made under load reported 134 failures against a commit that passes 330/330 alone.',
    '  A run you cannot trust is worse than no run — the real regression hides in the noise.',
    '',
    '  Wait for the other builds/tests to finish and re-run, or:',
    `    ALLOW_BUSY=1 ${command}     # run anyway; every result is stamped as suspect`,
    `    BUSY_MAX_CPU=0.8 ${command} # raise the bar deliberately (current: ${max})`,
    '',
    '  See BOARD.md → PG-24.',
    '',
  ]
  if (process.env.ALLOW_BUSY === '1') {
    console.error(
      `\n  ⚠ ALLOW_BUSY=1 — starting on a box that is ${pct(utilization)} busy. ` +
        `Treat every failure below as unproven until it reproduces on a quiet machine (PG-24).\n`,
    )
    return { utilization, max, degraded: true }
  }
  console.error(lines.join('\n'))
  process.exit(2)
}

/** One line for the end of a run's summary, or '' when there is nothing to say. */
export function loadVerdict(preflight, watched) {
  const pct = (n) => `${Math.round(n * 100)}%`
  if (preflight?.degraded) {
    return `  ⚠ RUN MADE UNDER LOAD (started at ${pct(preflight.utilization)} CPU, peak ${pct(watched.peak)}). Failures above are SUSPECT — re-run alone before filing. PG-24.`
  }
  if (watched.hot > 0) {
    return `  ⚠ The box was saturated (≥${pct(watched.saturated)} CPU) for ${watched.hot} of ${watched.samples} samples during this run, peak ${pct(watched.peak)}. Something else started while it ran; re-check any failure alone. PG-24.`
  }
  return ''
}

// --- Runnable directly, so the gate can be proven to fire. -------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.NEG === '1') {
    const { spawn } = await import('node:child_process')
    const burn = 'let x = 0; for (;;) { x = (x + Math.sqrt(x + 1)) % 1e9 }'
    const kids = Array.from({ length: os.cpus().length * 2 }, () =>
      spawn(process.execPath, ['-e', burn], { stdio: 'ignore' }),
    )
    await sleep(1500)
    const util = await cpuUtilization()
    for (const k of kids) k.kill('SIGKILL')
    const refused = util >= DEFAULT_MAX
    console.log(
      `\n  [NEGATIVE CONTROL] ${os.cpus().length * 2} spinning processes → ${Math.round(util * 100)}% CPU ` +
        `(threshold ${Math.round(DEFAULT_MAX * 100)}%): gate ${refused ? 'FIRES — not vacuous' : 'DID NOT FIRE — the gate is useless'}\n`,
    )
    process.exit(refused ? 0 : 1)
  }
  const util = await cpuUtilization()
  console.log(
    `\n  ${os.cpus().length} cores, ${Math.round(util * 100)}% busy right now ` +
      `(refusal threshold ${Math.round(DEFAULT_MAX * 100)}%) → ${util < DEFAULT_MAX ? 'quiet enough to time things on' : 'TOO BUSY — timing results would be noise'}\n`,
  )
}
