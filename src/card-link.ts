/**
 * The card deep link — `#<library-id>/<card>`.
 *
 * `tickets/DOCS-4`. Published READMEs link to a *card*, not just to a tab, so
 * the reader lands on the thing the paragraph is describing. `App.vue` already
 * split the hash into `[id, sub]` and only ever used `sub` for `'docs'`; a card
 * id goes in that same slot, which is why this is an extension of the existing
 * scheme rather than a second one.
 *
 * ```
 * #v-teleport-to                    the tab
 * #v-teleport-to/docs               the rendered README
 * #v-teleport-to/placement-flip     a specific card        ← this module
 * ```
 *
 * ## Why the segment is a slug, and why that decision is load-bearing
 *
 * These links **ship inside published tarballs**. Once someone has installed
 * `@ozjsey/v-teleport-to@3.0.0`, the README in their `node_modules` is frozen:
 * a link we change later is a dead link in their copy forever. So the segment
 * has to be the form least likely to need changing.
 *
 * The demo files are named `02-placement-flip.vue`. Two parts of that name
 * churn for reasons that have nothing to do with the card's identity:
 *
 *   - the **ordering prefix**, which shifts every time a card is inserted
 *     earlier in the list (adding `03-…` renumbers everything after it);
 *   - the **`.vue` extension**, which is an implementation detail of how the
 *     playground stores a demo and means nothing to a reader.
 *
 * What is left — `placement-flip` — is the part that names the *feature*, and
 * the feature is what a README paragraph is about. So the published segment is
 * the filename with the ordering prefix and the extension removed. It reads
 * well in a README and in an address bar, it survives renumbering, and it is a
 * pure function of the filename, so there is no second table anywhere that can
 * drift out of sync with the files on disk.
 *
 * Two guards keep that promise cheap to hold:
 *
 *   1. **Uniqueness is enforced at registry build time** (`registry.ts`). Two
 *      files in one library whose slugs collide are a loud manifest problem —
 *      an error banner, which `pnpm smoke` fails on — not a link that silently
 *      resolves to whichever card sorted first.
 *   2. **Resolution is lenient inbound, canonical outbound.** `matchesCard`
 *      also accepts the raw filename (`02-placement-flip.vue`) and the filename
 *      without its extension, because the ticket's own worked example uses the
 *      filename form and the owner has shared it that way. Anything this repo
 *      *writes* — the sidebar, the per-card permalink, every README — uses the
 *      slug.
 *
 * Renaming the descriptive half of a demo file therefore does break a published
 * link, and that is the deliberate trade: it is the one rename that means the
 * card is about something else now, at which point pointing the old link at the
 * tab (which is what an unknown segment does) is the honest outcome.
 */

/** `02-placement-flip.vue` → `placement-flip`. The published form. */
export function cardSlug(file: string): string {
  return file.replace(/\.vue$/i, '').replace(/^\d+[-_]/, '')
}

/** The canonical in-app href for a card: `#v-teleport-to/placement-flip`. */
export function cardHref(libraryId: string, file: string): string {
  return `#${libraryId}/${cardSlug(file)}`
}

/**
 * The absolute URL that goes in a README.
 *
 * Kept beside the slug rule on purpose: `tickets/_STANDARDS.md` #4 fixes the
 * origin, and a README link assembled by hand somewhere else is how the origin
 * and the hash rule drift apart.
 */
export const LIVE_SITE = 'https://ozjsey.github.io/npm-portfolio-playground/'
export const cardUrl = (libraryId: string, file: string) => LIVE_SITE + cardHref(libraryId, file)

/**
 * Does `segment` name this file?
 *
 * Lenient inbound — slug, `02-placement-flip.vue`, or `02-placement-flip` — so
 * a link written before this ticket, or copied out of the repo tree, still
 * lands on the right card.
 */
export function matchesCard(file: string, segment: string): boolean {
  const wanted = segment.trim().toLowerCase().replace(/\.vue$/i, '')
  if (!wanted) return false
  return wanted === cardSlug(file).toLowerCase() || wanted === file.replace(/\.vue$/i, '').toLowerCase()
}

/**
 * `#<id>/<sub>` split, accepting `#` as a separator as well as `/`.
 *
 * `#v-teleport-to#placement-flip` is the form the owner wrote by hand and may
 * share, and a link that resolves for him and not for a reader is worse than no
 * link. Both forms mean the same thing; `/` is what this repo writes.
 */
export function parseHash(hash: string): { id: string; sub: string } {
  const [id = '', sub = ''] = hash.replace(/^#/, '').split(/[/#]/)
  return { id: decodeURIComponent(id), sub: decodeURIComponent(sub) }
}
