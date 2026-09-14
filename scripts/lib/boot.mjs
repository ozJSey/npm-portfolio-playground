/**
 * "Has the playground finished booting, and how did it go?" — one question, one
 * answer, waited on rather than sampled.
 *
 * `src/main.ts` publishes `window.__PLAYGROUND_BOOT__` once, after the app has
 * mounted. Before that marker exists the page is *not yet* booted, which is a
 * different and retryable condition from *failed to boot* — and the first cut of
 * this guard conflated them, aborting healthy runs with a message that read like
 * a package failure. That is the exact defect class these scripts are being
 * hardened against, so the two are named separately here, once, for everyone.
 */

/** Page-side poller. Returns the boot record, or null if it never arrived. */
const WAIT = (budgetMs) => `(async () => {
  const end = Date.now() + ${budgetMs}
  for (;;) {
    if (window.__PLAYGROUND_BOOT__) return window.__PLAYGROUND_BOOT__
    if (Date.now() > end) return null
    await new Promise((r) => setTimeout(r, 120))
  }
})()`

/**
 * @returns the boot record.
 * @throws  naming which of the two things went wrong — never both.
 */
export async function waitForBoot(page, { budgetMs = 30_000, serverLog = '' } = {}) {
  // The page-side poll runs for `budgetMs`, so the command must be allowed to
  // outlive it — otherwise the CDP deadline (PG-21) fires first and reports a
  // timeout where the honest answer is "boot did not complete".
  const boot = await page.evaluateWithin(budgetMs + 10_000, WAIT(budgetMs))
  if (boot) return boot

  const why = page.pageErrors[0] ?? page.consoleErrors[0]
  throw new Error(
    `BOOT DID NOT COMPLETE within ${budgetMs}ms — window.__PLAYGROUND_BOOT__ never appeared.\n` +
      `This is "the page has not finished booting", NOT "a package failed": a package that fails ` +
      `still boots, and reports itself in boot.libraryFailures.\n` +
      (why ? `First error the page threw: ${why.split('\n')[0]}\n` : 'The page threw nothing at all, so this is the dev server, the browser, or a budget.\n') +
      serverLog.slice(-1200),
  )
}
