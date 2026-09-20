/**
 * The harness's own tests. `pnpm harness`.
 *
 * Every other suite here drives the demos. This one drives the thing that
 * reports on them, because a reporter that loses the failure is worse than a
 * missing check: the run still goes red, so nobody suspects the instrument,
 * and the message sends you looking in the wrong place.
 *
 * It exists because of a real two-day outage. `Runtime.exceptionThrown` was
 * read as `d.exception?.description ?? d.text`, and an unhandled rejection
 * whose reason is not an Error has no `description` — so five failures in the
 * daily workflow all rendered as the literal string "Uncaught (in promise)",
 * with nothing about what rejected or where. Five identical, unactionable
 * lines, twice a day.
 *
 * These cases are driven through a real Chrome rather than by calling the
 * describer with hand-written protocol objects. The bug was a wrong belief
 * about what Chrome actually sends for each shape, and a unit test built on
 * the same wrong belief would have passed.
 */
import { test, before, after } from 'node:test'
import { rmSync } from 'node:fs'
import assert from 'node:assert/strict'
import { Cdp, launchChrome, newPage } from './lib/cdp.mjs'
import { freePort } from './lib/port.mjs'

let chrome
let cdp
let page

before(async () => {
  chrome = await launchChrome({ port: await freePort() })
  cdp = await Cdp.connect(chrome.wsUrl)
  page = await newPage(cdp, 'about:blank')
})

after(async () => {
  // Three separate things, and the first version got two of them wrong.
  //
  // `cdp.close()` disarms the stall watchdog, which otherwise fires once the
  // tests stop issuing commands and takes the process down with exit 3 ("no
  // verdict") after every subtest has already passed.
  //
  // `launchChrome` returns { proc, wsUrl, port, userDataDir } and no `kill`,
  // so the obvious `chrome?.kill?.()` is an optional-chaining no-op: it looks
  // like teardown, silently does nothing, and leaves Chrome holding the event
  // loop open forever.
  //
  // And the profile directory is ours to remove. `mkdtemp` profiles left
  // behind by these harnesses had reached 19 orphans and 567 MB.
  cdp?.close()

  // Wait for Chrome to actually be gone before touching its profile.
  //
  // SIGKILL returns immediately; the process does not. Deleting the directory
  // in the same tick races Chrome's still-open handles and rmSync throws
  // ENOTEMPTY from somewhere deep in Cache_Data — which fails the hook, and
  // therefore the job, while every test in the file has passed. That is the
  // worst shape of red: the suite is fine and the cleanup is what broke.
  const proc = chrome?.proc
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    proc.kill('SIGKILL')
    await new Promise((resolve) => {
      const done = () => resolve()
      proc.once('exit', done)
      // Never hang the suite on a process that will not die; the retries below
      // are the second line of defence.
      setTimeout(done, 3000).unref?.()
    })
  }

  // Best effort, and NEVER fatal.
  //
  // This is hygiene, not an assertion. The suite tests the CDP reporter; it
  // does not test the filesystem, and a run whose five checks all passed must
  // not go red because a temp directory would not delete. That is exactly what
  // happened twice: `ENOTEMPTY ... /Default/Cache/Cache_Data/index-dir`, hook
  // failed, tests all green — a failure pointing at the thing it is least
  // about.
  //
  // Waiting for the parent to exit is not sufficient on Linux either: Chrome's
  // zygote and renderer children outlive it by a moment and keep handles open
  // under the profile. Retries help and cannot guarantee. A leaked directory on
  // an ephemeral runner costs nothing; a false red costs an afternoon.
  if (chrome?.userDataDir) {
    try {
      rmSync(chrome.userDataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    } catch (err) {
      console.warn(
        `[harness] could not remove the Chrome profile ${chrome.userDataDir}: ${err.code ?? err.message}. ` +
          `Not failing the run — this is cleanup, not a check.`,
      )
    }
  }
})

/** Reject with `expr`, then return the single page error it produced. */
const rejectionFrom = async (expr) => {
  page.pageErrors.length = 0
  await page.evaluate(`Promise.reject(${expr}); 'queued'`)
  for (let i = 0; i < 40 && page.pageErrors.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 50))
  }
  assert.equal(page.pageErrors.length, 1, `expected exactly one page error for ${expr}`)
  return page.pageErrors[0]
}

test('a rejection with a string reason reports the string', async () => {
  const err = await rejectionFrom(`'a bare string'`)
  assert.match(err, /a bare string/)
})

test('a rejection with undefined reports "undefined", not just the bare text', async () => {
  const err = await rejectionFrom('undefined')
  assert.match(err, /undefined/)
  // The regression this file exists for: the whole report collapsing to this.
  assert.notEqual(err.split('\n')[0].trim(), 'Uncaught (in promise)')
})

test('a rejection with a plain object reports its properties', async () => {
  const err = await rejectionFrom(`{ code: 'EWEIRD', detail: 'no stack here' }`)
  assert.match(err, /EWEIRD/)
  assert.match(err, /no stack here/)
  // `description` is the string "Object" for a plain object — present, and
  // useless. Reporting it would look like success.
  assert.notEqual(err.split('\n')[0].trim(), 'Object')
})

test('a rejection with a real Error keeps its stack', async () => {
  const err = await rejectionFrom(`new TypeError('the case that already worked')`)
  assert.match(err, /TypeError: the case that already worked/)
})

test('every reported error carries a location', async () => {
  const err = await rejectionFrom(`'located'`)
  assert.match(err, /\n\s+at /, `no stack frame in:\n${err}`)
})
