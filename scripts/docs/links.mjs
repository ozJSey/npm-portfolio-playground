/**
 * Every link in a rendered README has to go somewhere.
 *
 * `tickets/DOCS-3`, item 2: *"A 404 in the docs of a published package is
 * public."* For the packages here the README **is** the npm page, so a link
 * that resolves on a developer's disk and not on npm is still a broken link —
 * which is why a relative `./ARCHITECTURE.md` is checked against the package's
 * `files`/tarball separately, in `tarball.mjs`, rather than only against disk.
 *
 * Four kinds, four rules:
 *
 *   `#anchor`      must match a heading in the same file, by GitHub's slug rule
 *   `./thing.md`   must exist on disk, and its `#anchor` must exist in it
 *   the live site   `ozjsey.github.io/npm-portfolio-playground/#<id>` — `<id>`
 *                  must be a playground tab. `_STANDARDS.md` #4 makes this link
 *                  mandatory and near the top; a package with no tab links to
 *                  the site index instead. Since `tickets/DOCS-4` the hash may
 *                  carry a second segment — `#<id>/<card>` — and that card must
 *                  exist too. A card link is the form most likely to rot (the
 *                  tab ids barely move; the cards are added and renamed all the
 *                  time) and it is the form that ships inside tarballs, so a
 *                  dead one is a `DEAD_CARD` error, not an advisory.
 *   anything else  one HTTP request, when the network is allowed
 *
 * Network results are deliberately not fatal on a transport error. A DNS
 * timeout is a fact about the machine running the gate, not about the README,
 * and a gate that goes red on an aeroplane is a gate people learn to skip. A
 * *response* that is 404 or 410 is a different thing and does fail.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { extractReadme } from './extract.mjs'

export const LIVE_SITE = 'https://ozjsey.github.io/npm-portfolio-playground/'

/** Statuses that mean "we would not tell you", not "the page is gone". */
const REFUSED = new Set([401, 403, 429])

const finding = (severity, code, line, message) => ({ severity, code, line, message })

/** Heading slugs of a markdown file on disk, for cross-file `#anchor` links. */
const slugCache = new Map()
function slugsOf(path) {
  if (!slugCache.has(path)) {
    const slugs = new Set()
    if (existsSync(path) && path.endsWith('.md')) {
      for (const heading of extractReadme(readFileSync(path, 'utf8'), { file: path }).headings) {
        slugs.add(heading.slug)
      }
    }
    slugCache.set(path, slugs)
  }
  return slugCache.get(path)
}

/**
 * One HTTP round trip. HEAD first — several of these hosts answer HEAD with 405
 * and the GET is what tells us whether the page is there.
 */
async function probe(url, timeoutMs) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status === 405 || res.status === 501) continue
      return { status: res.status }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }
  return { error: 'HEAD and GET both refused' }
}

/**
 * Checks the links of one README.
 *
 * @param readme  an `extractReadme` result
 * @param ctx     `{ readmePath, libraryId, repoRoot, libraryIds, cards, network, timeoutMs }`
 */
export async function checkLinks(readme, ctx) {
  const findings = []
  const slugs = new Set(readme.headings.map((h) => h.slug))
  const readmeDir = dirname(ctx.readmePath)
  const external = []

  for (const link of readme.links) {
    const { href, line, label } = link

    if (link.malformed) {
      findings.push(
        finding(
          'error',
          'MALFORMED_LINK',
          line,
          `\`[${label}]**(${href}…)\` is not a link — markdown closes the label at \`]\`, so the ` +
            `URL renders as literal text on npm. Write \`**[${label}](${href})**\`.`,
        ),
      )
      continue
    }

    if (href.startsWith('mailto:') || href.startsWith('data:')) continue

    if (href.startsWith('#')) {
      const slug = href.slice(1).toLowerCase()
      if (!slugs.has(slug)) {
        findings.push(
          finding('error', 'DEAD_ANCHOR', line, `\`${href}\` matches no heading in this README.`),
        )
      }
      continue
    }

    if (/^[a-z][\w+.-]*:/i.test(href)) {
      const url = tryUrl(href)
      if (!url) {
        findings.push(finding('error', 'BAD_URL', line, `\`${href}\` is not a URL.`))
        continue
      }
      if (url.href.startsWith(LIVE_SITE) || `${url.origin}${url.pathname}` === LIVE_SITE.slice(0, -1)) {
        findings.push(...checkLiveSiteLink(url, line, ctx))
        // Still worth one request: the site itself has to be deployed.
        external.push({ url: `${url.origin}${url.pathname}`, line, href })
        continue
      }
      external.push({ url: url.href, line, href })
      continue
    }

    // Relative. `#frag` may follow the path.
    const [path, fragment] = href.split('#')
    const target = resolve(readmeDir, path || '.')
    if (!existsSync(target)) {
      findings.push(
        finding(
          'error',
          'DEAD_PATH',
          line,
          `\`${href}\` → ${relativeTo(ctx.repoRoot, target)} does not exist.`,
        ),
      )
      continue
    }
    if (fragment && !slugsOf(target).has(fragment.toLowerCase())) {
      findings.push(
        finding(
          'error',
          'DEAD_ANCHOR',
          line,
          `\`${href}\` → ${relativeTo(ctx.repoRoot, target)} has no heading \`#${fragment}\`.`,
        ),
      )
    }
  }

  findings.push(...checkStandardsLink(readme, ctx))

  if (ctx.network) {
    const seen = new Map()
    for (const { url, line, href } of external) {
      if (!seen.has(url)) seen.set(url, probe(url, ctx.timeoutMs))
      const result = await seen.get(url)
      if (result.error) {
        findings.push(
          finding('warn', 'LINK_UNREACHABLE', line, `\`${href}\` — ${result.error} (not checked).`),
        )
      } else if (result.status === 404 || result.status === 410) {
        findings.push(finding('error', 'DEAD_LINK', line, `\`${href}\` → HTTP ${result.status}.`))
      } else if (REFUSED.has(result.status)) {
        // npmjs.com answers a scripted request with 403 whatever the package.
        // That is a fact about their bot protection, not about the link, and
        // reporting it as a status would train people to skim this section.
        findings.push(
          finding(
            'warn',
            'LINK_UNVERIFIED',
            line,
            `\`${href}\` → HTTP ${result.status}: the host refused the request rather than ` +
              `answering for the page. NOT verified either way.`,
          ),
        )
      } else if (result.status >= 400) {
        findings.push(
          finding('warn', 'LINK_STATUS', line, `\`${href}\` → HTTP ${result.status}.`),
        )
      }
    }
  }

  return { findings, externalCount: external.length }
}

const tryUrl = (href) => {
  try {
    return new URL(href)
  } catch {
    return null
  }
}

const relativeTo = (root, path) => (path.startsWith(root) ? path.slice(root.length + 1) : path)

/**
 * The live-site hash: a playground tab id, optionally followed by `docs` or a
 * card id. A tab that is not there 404s the reader; a card that is not there
 * dumps them at the top of the tab with a banner, which is better but is still
 * not the paragraph they clicked.
 *
 * `ctx.cards` is read out of the running app (`window.__PLAYGROUND_CARDS__`,
 * set by `src/main.ts` from the registry), not re-derived from the filenames
 * here. DOCS-4 hangs on the writer and the router agreeing about what a card id
 * is; a second implementation of the slug rule in this file is precisely how
 * they would stop agreeing, and the gate would go green over it.
 */
function checkLiveSiteLink(url, line, ctx) {
  const [id, sub] = url.hash.replace(/^#/, '').split(/[/#]/).map(decodeURIComponent)
  if (!id) return []
  if (!ctx.libraryIds.includes(id)) {
    return [
      finding(
        'error',
        'DEAD_TAB',
        line,
        `\`${url.hash}\` is not a playground tab — the link lands on the site with nothing ` +
          `selected. Tabs: ${ctx.libraryIds.join(', ')}.`,
      ),
    ]
  }
  if (!sub || sub === 'docs') return []

  const cards = ctx.cards?.[id]
  if (!cards) {
    return [
      finding(
        'warn',
        'CARD_UNVERIFIED',
        line,
        `\`${url.hash}\` names a card, but this run has no card index for \`#${id}\` — the link ` +
          `was NOT checked either way.`,
      ),
    ]
  }
  if (cards.some((card) => card.slug === sub || card.file === sub)) return []
  return [
    finding(
      'error',
      'DEAD_CARD',
      line,
      `\`${url.hash}\` — \`#${id}\` has no card \`${sub}\`, so this link lands on the tab with a ` +
        `"that card is gone" banner instead of on the example this paragraph is about. ` +
        `Cards: ${cards.map((c) => c.slug).join(', ')}.`,
    ),
  ]
}

/**
 * `_STANDARDS.md` #4, checked rather than remembered.
 *
 * > "Every README links to the live site … This goes near the top of the
 * > README, above the install line: for a published package the README is the
 * > npm page, and the demo is the fastest way to understand what the package
 * > does."
 *
 * "Above the install line" is read literally: the first fenced block that runs
 * `npm install`. A package with no tab owes the site index instead of a hash.
 */
function checkStandardsLink(readme, ctx) {
  const siteLinks = readme.links.filter((link) => link.href.startsWith(LIVE_SITE.slice(0, -1)))
  if (!siteLinks.length) {
    return [
      finding(
        'error',
        'NO_LIVE_LINK',
        1,
        `no link to ${LIVE_SITE}${ctx.libraryId ? `#${ctx.libraryId}` : ''} — ` +
          `required near the top of every README by tickets/_STANDARDS.md #4.`,
      ),
    ]
  }

  const findings = []
  const installLine = readme.blocks.find((b) => /\bnpm (install|i) |\bpnpm add |\byarn add /.test(b.code))
  const first = siteLinks[0]
  if (installLine && first.line > installLine.startLine) {
    findings.push(
      finding(
        'warn',
        'LIVE_LINK_PLACEMENT',
        first.line,
        `the live-site link is below the install line (line ${installLine.startLine}). ` +
          `_STANDARDS.md #4 puts it above.`,
      ),
    )
  }

  if (ctx.libraryId) {
    const expected = `${LIVE_SITE}#${ctx.libraryId}`
    if (!siteLinks.some((link) => link.href === expected)) {
      findings.push(
        finding(
          'error',
          'WRONG_LIVE_LINK',
          first.line,
          `links to the live site but not to its own tab. Expected \`${expected}\`, found ` +
            `${siteLinks.map((l) => `\`${l.href}\``).join(', ')}.`,
        ),
      )
    }

    /**
     * DOCS-4. The owner asked for links to the *card* that demonstrates the
     * feature being documented, not one link to the tab and nothing after.
     *
     * Advisory, deliberately. Which sections earn a link is judgement — the
     * ticket is explicit that a link in every heading "reads as noise and gets
     * skipped" — so a count is not something a gate can assert. What a gate
     * *can* say is that a README with a tab full of runnable examples and not
     * one link into them has almost certainly not had that judgement applied.
     */
    const cardLinks = siteLinks.filter((link) => {
      const [, sub] = link.href.slice(LIVE_SITE.length).replace(/^#/, '').split(/[/#]/)
      return sub && sub !== 'docs'
    })
    if (!cardLinks.length) {
      findings.push(
        finding(
          'warn',
          'NO_CARD_LINK',
          first.line,
          `links to \`#${ctx.libraryId}\` but to no card on it. tickets/DOCS-4 asks the sections ` +
            `where watching it run beats reading about it to link the card that runs it — ` +
            `\`${LIVE_SITE}#${ctx.libraryId}/<card>\`.`,
        ),
      )
    }
  }

  return findings
}
