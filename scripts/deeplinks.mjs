#!/usr/bin/env node
/**
 * Card deep links, followed in a real browser — `tickets/DOCS-4`.
 *
 * Every published README now links a paragraph to the *card* that demonstrates
 * it, not just to the tab: `…/#v-teleport-to/placement-flip`. Those strings ship
 * inside tarballs, so once someone has installed the package they cannot be
 * corrected for that reader. That makes "does this link land on the right card"
 * a gate, not a spot check.
 *
 *   pnpm deeplinks                 # sources (picks a free port; PORT= pins one)
 *   pnpm deeplinks:dist            # the built dist entries
 *   ONLY=v-dropzone pnpm deeplinks # one tab
 *   DEEPLINKS_READMES=0            # skip the links harvested from the READMEs
 *
 * Three passes:
 *
 *   1. **every card** in `window.__PLAYGROUND_CARDS__` — navigate to its
 *      canonical link, assert that card and only that card is marked, and that
 *      it is on screen below the sticky header;
 *   2. **the separator and alias forms** — `#<id>#<card>` (the form the owner
 *      writes by hand) and the raw `NN-name.vue` filename must resolve to the
 *      same card as the slug;
 *   3. **the links that are actually published** — every card link harvested
 *      out of every sibling `README.md`, driven verbatim. A README link that
 *      does not resolve is the whole defect this ticket exists to prevent, and
 *      nothing else in the repo would notice it.
 *
 * ## The negative control, and why it runs first
 *
 * A link checker that always says PASS is worse than none, and this one is easy
 * to write that way by accident: forget to compare the marked card's id and
 * every navigation "passes". So before anything real is checked, the same
 * assertion routine is pointed at things it must reject —
 *
 *   - a card id that does not exist anywhere;
 *   - a card id that exists, asserted against the *wrong* expected card;
 *
 * — and the run aborts unless both come back red. The stale-link fallback is
 * checked in the same pass: an unknown card must degrade to the tab *visibly*,
 * with every card still rendered and a banner naming the segment it could not
 * find, because a blank page is the one outcome worse than the link not
 * existing at all.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { Cdp, launchChrome, newPage } from './lib/cdp.mjs'
import { waitForBoot } from './lib/boot.mjs'
import { freePort, resolvePort } from './lib/port.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const REPO = resolve(ROOT, '..')
const PORT = await resolvePort('Pass a different PORT, or unset it to get a free one automatically.')
const BASE = `http://localhost:${PORT}`
const TARGET = process.env.PLAYGROUND_TARGET === 'dist' ? 'dist' : 'source'
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null
const READMES = process.env.DEEPLINKS_READMES !== '0'
const LIVE_SITE = 'https://ozjsey.github.io/npm-portfolio-playground/'

/**
 * Read back out of the live DOM after a navigation.
 *
 * Everything an assertion needs comes from one round trip, so a card cannot be
 * marked in one snapshot and measured in another after the page moved on.
 */
const READ_STATE = `(() => {
  const fatal = document.querySelector('.pg-fatal')
  if (fatal) return { fatal: fatal.textContent.slice(0, 400) }
  const tab = [...document.querySelectorAll('.tab')].find((b) => b.getAttribute('aria-selected') === 'true')
  const marked = [...document.querySelectorAll('.demo[data-deep-linked]')]
  const banner = document.querySelector('.pg-unknown-card')
  const header = document.querySelector('.app-header')
  const target = marked[0]
  const rect = target ? target.getBoundingClientRect() : null
  return {
    href: location.href,
    tab: tab ? tab.textContent.replace(/\\d+$/, '').trim() : null,
    docsView: !!document.querySelector('.docs'),
    cardsRendered: document.querySelectorAll('.demo[data-card]').length,
    marked: marked.map((el) => el.dataset.card),
    unknownCard: banner ? banner.getAttribute('data-unknown-card') : null,
    headerBottom: header ? header.getBoundingClientRect().bottom : 0,
    viewport: window.innerHeight,
    rect: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null,
  }
})()`

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * One deep link, followed and judged.
 *
 * `expect.card` is the slug that must end up marked; `expect.card === null`
 * means the link is deliberately stale and must degrade to the tab instead.
 *
 * ## Two ways to arrive, and both are real
 *
 * `cold: true` loads the document with the hash already in the URL — the path a
 * reader takes from a README, resolved by `syncFromHash` on mount. It costs a
 * full app boot, so it is spent on the links that are actually published.
 *
 * The default is a `hashchange`: `location.hash = …` on the page already open,
 * which is the path the in-app sidebar and permalinks take, and is instant.
 * *That distinction is not a micro-optimisation.* A hash-only navigation fires
 * no load event, so driving 142 of them through `page.navigate` sat out the
 * 20-second "did the page come up?" budget on every single one — the first run
 * of this script managed 28 cards in ten minutes before it was killed.
 *
 * Polls rather than sleeping a fixed amount: the cards above the target compile
 * asynchronously and `App.vue` keeps re-anchoring until the page stops growing,
 * so the honest question is "does this become true within a few seconds", and a
 * fixed sleep either wastes minutes across 150 links or flakes.
 */
async function follow(page, url, expect, { budgetMs = 6000, cold = false } = {}) {
  if (cold) {
    // A fresh document, so the hash is resolved on mount exactly as it is for
    // someone clicking the link in a README. Via `about:blank` because a
    // same-document hash change fires no load event for `navigate` to wait on.
    await page.navigate('about:blank')
    await page.navigate(url)
  } else {
    await page.evaluate(`location.href = ${JSON.stringify(url)}`)
  }
  const deadline = Date.now() + budgetMs
  let state
  let problems
  for (;;) {
    state = await page.evaluate(READ_STATE)
    problems = judge(state, expect)
    if (!problems.length || Date.now() > deadline) break
    await sleep(150)
  }
  return { url, state, problems }
}

function judge(state, expect) {
  const problems = []
  if (state.fatal) return [`the app painted a fatal error: ${state.fatal}`]

  if (state.tab !== expect.tab) {
    problems.push(`the selected tab is ${state.tab ?? '(none)'}, expected ${expect.tab}`)
  }
  if (state.docsView) problems.push('the Documentation view is showing, not the cards')

  if (expect.card === null) {
    // A stale link. It must degrade to the tab, and say so.
    if (state.marked.length) problems.push(`marked ${state.marked.join(', ')} — nothing should match`)
    if (state.unknownCard !== expect.unknownCard) {
      problems.push(
        `the fallback banner reports ${JSON.stringify(state.unknownCard)}, expected ` +
          `${JSON.stringify(expect.unknownCard)} — a stale link must name what it could not find`,
      )
    }
    if (!state.cardsRendered) {
      problems.push('no cards rendered at all — a stale link degraded to a blank page, not to the tab')
    }
    return problems
  }

  if (state.unknownCard) problems.push(`the fallback banner fired for ${JSON.stringify(state.unknownCard)}`)
  if (state.marked.length !== 1 || state.marked[0] !== expect.card) {
    problems.push(
      `marked ${state.marked.length ? state.marked.join(', ') : '(nothing)'}, expected exactly ` +
        `${expect.card}`,
    )
    return problems
  }

  // In view — and in view *usably*. `scroll-margin-top` on `.demo` is there so
  // the card clears the sticky header; a card anchored underneath it is on
  // screen by the numbers and invisible to the reader.
  const { rect, viewport, headerBottom } = state
  if (!rect) {
    problems.push('the marked card has no box — it is not laid out')
  } else if (rect.top >= viewport) {
    problems.push(`the card is ${Math.round(rect.top - viewport)}px below the fold — it was not scrolled to`)
  } else if (rect.bottom <= 0) {
    problems.push(`the card is ${Math.round(-rect.bottom)}px above the fold — it was not scrolled to`)
  } else if (rect.top < headerBottom - 4) {
    problems.push(
      `the card's header sits ${Math.round(headerBottom - rect.top)}px under the sticky app header ` +
        `— scroll-margin-top on .demo is not being honoured`,
    )
  }
  return problems
}

// ---------------------------------------------------------------------------
// The links the READMEs actually publish
// ---------------------------------------------------------------------------

/** Every `…/#<tab>/<card>` link written in a sibling package README. */
function publishedCardLinks() {
  const out = []
  for (const dir of readdirSync(REPO)) {
    if (dir.startsWith('.') || dir.startsWith('_') || dir === 'playground') continue
    const path = join(REPO, dir, 'README.md')
    if (!statSync(join(REPO, dir)).isDirectory() || !existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    for (const m of text.matchAll(/https:\/\/ozjsey\.github\.io\/npm-portfolio-playground\/#([^)\s"'>]+)/g)) {
      const [tab, sub] = decodeURIComponent(m[1]).split(/[/#]/)
      if (!sub || sub === 'docs') continue
      const line = text.slice(0, m.index).split('\n').length
      out.push({ from: `${dir}/README.md:${line}`, tab, sub, url: LIVE_SITE + `#${m[1]}` })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const viteBin = join(ROOT, 'node_modules/.bin/vite')
const server = spawn(existsSync(viteBin) ? viteBin : 'vite', ['--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (c) => (serverLog += c))
server.stderr.on('data', (c) => (serverLog += c))

const failures = []
let checked = 0
let chrome
let cdp

try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {
      /* not up yet */
    }
    await sleep(500)
    if (i === 79) throw new Error(`Dev server never came up:\n${serverLog}`)
  }

  chrome = await launchChrome({
    port: process.env.CDP_PORT ? Number(process.env.CDP_PORT) : await freePort(),
  })
  cdp = await Cdp.connect(chrome.wsUrl)
  const page = await newPage(cdp, BASE)
  await sleep(2000)

  // PG-22. `__PLAYGROUND_LIBRARY_FAILURES__` lands after ten dynamic `import()`s
  // settle, so reading it once after a fixed sleep races on a cold module graph
  // — and reported "the playground did not boot" for a playground that was
  // simply still booting. `waitForBoot` waits for the one marker that cannot be
  // half-there, and names which of the two conditions it actually found.
  const failed = (await waitForBoot(page, { serverLog })).libraryFailures
  if (failed.length) {
    throw new Error(
      `${failed.length} package(s) failed to load, so their cards are not rendered and every deep ` +
        `link into them would fail for a reason that has nothing to do with this ticket: ` +
        failed.map((f) => f.specifier).join(', '),
    )
  }

  const cards = await page.evaluate('window.__PLAYGROUND_CARDS__ ?? null')
  if (!cards) {
    throw new Error(
      'window.__PLAYGROUND_CARDS__ is unset — src/main.ts publishes it from src/registry.ts. ' +
        'Without it this runner has no list of cards and would have nothing to check.',
    )
  }
  const tabs = Object.keys(cards).filter((id) => !ONLY || ONLY.test(id))
  if (!tabs.length) throw new Error(`No tab matched ONLY=${process.env.ONLY}.`)

  console.log(`\nCard deep links — ${TARGET} target, ${BASE}`)
  console.log(`${tabs.length} tab(s), ${tabs.reduce((n, id) => n + cards[id].length, 0)} card(s)\n`)

  // --- 0. the control, before anything is trusted -------------------------
  const controlTab = tabs[0]
  const controlCard = cards[controlTab][0]
  const controls = [
    {
      name: 'a card id that does not exist, asserted as if it did',
      result: await follow(page, `${BASE}/#${controlTab}/no-such-card-anywhere`, {
        tab: controlTab,
        card: 'no-such-card-anywhere',
      }, { budgetMs: 1500, cold: true }),
    },
    {
      name: 'a real card, asserted against the wrong one',
      result: await follow(page, `${BASE}/#${controlTab}/${controlCard.slug}`, {
        tab: controlTab,
        card: `${controlCard.slug}-but-not-really`,
      }, { budgetMs: 1500, cold: true }),
    },
  ]
  for (const control of controls) {
    if (control.result.problems.length) continue
    throw new Error(
      `Negative control FAILED — "${control.name}" was reported as passing. This runner cannot ` +
        `tell a good deep link from a bad one, so nothing below means anything.`,
    )
  }

  // The stale-link fallback, which is a requirement in its own right.
  const stale = await follow(
    page,
    `${BASE}/#${controlTab}/no-such-card-anywhere`,
    { tab: controlTab, card: null, unknownCard: 'no-such-card-anywhere' },
    { cold: true },
  )
  if (stale.problems.length) {
    throw new Error(
      `An unknown card id does not degrade to the tab as it must:\n` +
        stale.problems.map((p) => `  • ${p}`).join('\n'),
    )
  }
  console.log(
    `Negative control: ${controls.length}/${controls.length} — both deliberately wrong assertions ` +
      `were rejected, and an unknown card degraded to the tab with ${stale.state.cardsRendered} ` +
      `cards still rendered\n`,
  )

  // --- 1. every card, by its canonical link -------------------------------
  // The first card of each tab is loaded cold — a fresh document with the hash
  // already in the URL, which is the reader's path — and the rest arrive by
  // hashchange, which is the sidebar's. Both resolve through `syncFromHash`;
  // only the cold one also proves the mount-time call is wired up.
  for (const tab of tabs) {
    const results = []
    for (const [i, card] of cards[tab].entries()) {
      checked++
      const r = await follow(page, `${BASE}/#${tab}/${card.slug}`, { tab, card: card.slug }, { cold: i === 0 })
      results.push(r)
      if (r.problems.length) failures.push({ where: `#${tab}/${card.slug}`, problems: r.problems })
    }
    const bad = results.filter((r) => r.problems.length).length
    console.log(
      `${bad ? 'FAIL' : 'PASS'}  ${tab.padEnd(24)} ${results.length - bad}/${results.length} cards reached`,
    )
  }

  // --- 2. the other two accepted forms ------------------------------------
  console.log('')
  for (const tab of tabs) {
    const card = cards[tab][Math.min(1, cards[tab].length - 1)]
    for (const [label, url] of [
      ['# separator', `${BASE}/#${tab}#${card.slug}`],
      ['filename', `${BASE}/#${tab}/${card.file}`],
    ]) {
      checked++
      const r = await follow(page, url, { tab, card: card.slug }, { cold: true })
      if (r.problems.length) failures.push({ where: `${url.slice(BASE.length)} (${label})`, problems: r.problems })
    }
  }
  const aliasFails = failures.filter((f) => f.where.includes('(')).length
  console.log(
    `${aliasFails ? 'FAIL' : 'PASS'}  ${'alias forms'.padEnd(24)} ` +
      `${tabs.length * 2 - aliasFails}/${tabs.length * 2} — \`#<tab>#<card>\` and the raw filename ` +
      `resolve to the same card as the slug`,
  )

  // --- 3. the links the READMEs actually ship -----------------------------
  if (READMES) {
    const links = publishedCardLinks().filter((l) => !ONLY || ONLY.test(l.tab))
    let bad = 0
    for (const link of links) {
      checked++
      const card = cards[link.tab]?.find((c) => c.slug === link.sub || c.file === link.sub)
      const r = await follow(
        page,
        `${BASE}/#${link.tab}/${link.sub}`,
        { tab: link.tab, card: card?.slug ?? 'a card that exists' },
        { cold: true },
      )
      if (r.problems.length) {
        bad++
        failures.push({ where: `${link.from} → ${link.url}`, problems: r.problems })
      }
    }
    console.log(
      `${bad ? 'FAIL' : 'PASS'}  ${'published README links'.padEnd(24)} ${links.length - bad}/` +
        `${links.length} links written in a sibling README land on their card`,
    )
  } else {
    console.log('SKIP  published README links     DEEPLINKS_READMES=0')
  }

  for (const err of page.pageErrors) failures.push({ where: '(page)', problems: [err.split('\n')[0]] })
} catch (err) {
  failures.push({ where: '(runner)', problems: [err instanceof Error ? err.message : String(err)] })
} finally {
  cdp?.close()
  chrome?.proc.kill('SIGKILL')
  server.kill('SIGTERM')
}

console.log(`\n${'═'.repeat(92)}`)
for (const failure of failures) {
  console.log(`  FAIL ${failure.where}`)
  for (const p of failure.problems) console.log(`       • ${p}`)
}
console.log(`  ${checked} deep link(s) followed, ${failures.length} failure(s)`)
if (ONLY) console.log(`  Filtered run (ONLY=${process.env.ONLY}); the counts above are partial.`)
console.log('═'.repeat(92))

process.exit(failures.length ? 1 : 0)
