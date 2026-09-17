/**
 * "Does this link point back at the page the reader is already on?"
 *
 * One rule, one file, because it is asked in two places with different
 * information: `src/markdown.ts` asks it while rendering a README, and
 * `scripts/docs-ci.mjs` asks it of the rendered DOM afterwards. A second copy
 * of the rule is how a gate ends up agreeing with the bug it is guarding.
 *
 * ## The defect this exists for
 *
 * Every published README opens with a link to the live playground —
 * `_STANDARDS.md` #4 makes it mandatory — and the Documentation view renders
 * those same READMEs **on the playground**. `@ozjsey/vue-write-behind`'s first
 * paragraph therefore read *"See in action: npm portfolio playground"* and, on
 * a page that already was the npm portfolio playground, opened a second browser
 * tab to it. 136 links in the installed corpus do that, and the owner's note
 * was three words long: "Redirecting to the same website? :)"
 *
 * Nothing in the README is wrong. On npm — the other audience, and the one the
 * file is packed for — an absolute URL in a new tab is exactly right. So the
 * *rendering* is what changes: `src/docs.ts` is explicit that the README is the
 * single source and there is no second copy to edit.
 *
 * ## How "this same app" is decided, and why it is these two
 *
 * A link is in-app when its **origin and path** equal either:
 *
 *   1. `LIVE_SITE` — the address the READMEs are written against, and the same
 *      constant `src/card-link.ts` builds those URLs from. This is what makes
 *      the rule work on a dev server: `http://localhost:5173` is a different
 *      origin from the deployed site, but a README still says
 *      `https://ozjsey.github.io/npm-portfolio-playground/#v-copy`, and that
 *      link addresses *this* app whichever origin is serving it. The routes are
 *      hash routes, so they resolve identically anywhere.
 *
 *   2. This document's own origin and path. Nothing in the corpus is written
 *      this way, and that is the point: it is the clause that makes the promise
 *      unconditional. A preview deploy, a fork, a README that hardcodes
 *      `http://localhost:5173/#v-copy`, or `docs:ci`'s own
 *      `http://127.0.0.1:<port>/npm-portfolio-playground/` all land here. A
 *      same-origin link can never open a second copy of the app, whatever
 *      origin the app happens to be on.
 *
 * **The path is compared, not just the origin**, and on GitHub Pages that is
 * load-bearing rather than fussy: `ozjsey.github.io` is a user site, so every
 * one of the owner's projects shares that origin and only the first path
 * segment tells them apart. Origin-only matching would swallow
 * `ozjsey.github.io/some-other-project/` as internal and render it as a hash
 * route that resolves to nothing.
 *
 * Sibling **repository** links are untouched by construction: they live on
 * `github.com`, and `github.com` is not `ozjsey.github.io`. Same for
 * `npmjs.com`. Neither is a near miss under this rule — they fail on the
 * origin, before the path is even looked at.
 *
 * ## Rendering in Node
 *
 * `scripts/markdown.mjs` renders every README in a child process with a hard
 * deadline, where there is no `location`. That is a real, exercised state, not
 * a defensive branch: with no document to compare against, clause 2 simply has
 * nothing to say and clause 1 answers on its own.
 */
import { LIVE_SITE } from './card-link'

/**
 * `origin + path`, normalised so the three spellings of one address compare
 * equal: with and without a trailing slash, and with or without `index.html`
 * (which is what a static file server resolves a directory to, and therefore
 * what `location.pathname` can say on a deployed build).
 */
function homeOf(url: URL): string {
  const path = url.pathname.replace(/index\.html$/i, '')
  return `${url.origin}${path.endsWith('/') ? path : `${path}/`}`
}

/** Clause 1: the published address, from the constant the READMEs are written against. */
const PUBLISHED_HOME = homeOf(new URL(LIVE_SITE))

/** Clause 2: wherever this document is being served from, or `null` under Node. */
function servedHome(): string | null {
  const href = globalThis.location?.href
  return href === undefined ? null : homeOf(new URL(href))
}

/** A link that addresses this app, resolved to the form the router understands. */
export interface InAppLink {
  /**
   * The same-tab href. A fragment — `#v-copy/history-picker` — so following it
   * is a hash change the router already handles, and `#` alone for a link to
   * the site root, which is the page the reader is on.
   */
  href: string
  /** What it addresses, without the `#`: `v-copy/history-picker`, or `''` for the root. */
  route: string
}

/**
 * The in-app form of `href`, or `null` when the link is genuinely elsewhere.
 *
 * Only absolute `http(s)` URLs are considered. A relative path
 * (`./CHANGELOG.md`) is a file in the package repository, not a route here, and
 * a bare `#anchor` is a heading in the README being read — `src/markdown.ts`
 * handles that one separately, because it is a different destination with a
 * different correct behaviour.
 */
export function inAppLink(href: string): InAppLink | null {
  const trimmed = href.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null

  // A README is hand-written prose; `scripts/docs/links.mjs` reports a
  // malformed URL as BAD_URL, and rendering one is not this function's job.
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const home = homeOf(url)
  if (home !== PUBLISHED_HOME && home !== servedHome()) return null

  // The search is carried through rather than dropped: `?editors=open` is a
  // real parameter of this app, and silently losing it would make the in-app
  // link mean something the README did not say.
  return { href: `${url.search}${url.hash || '#'}`, route: url.hash.replace(/^#/, '') }
}
