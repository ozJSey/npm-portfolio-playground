/**
 * Heading text → the anchor a `#section` link in the same file means.
 *
 * GitHub's rule, and therefore npm's: these READMEs are rendered in three
 * places (npm, GitHub, the Documentation view here) and a table of contents
 * that works on two of them is a table of contents nobody trusts.
 *
 * ## Why this is a second implementation, and what stops it drifting
 *
 * `scripts/docs/extract.mjs` already has `slugify`, and it has to: it is a Node
 * script that reads README files off disk to *check* their `#anchor` links, and
 * it cannot import a browser module from a file Vite has not built. This one is
 * what the renderer puts on the page. So there are two, and the repo's standing
 * rule about two copies of a rule applies — a heading whose id here differs
 * from the slug there is a link `scripts/docs.mjs` calls live and the
 * Documentation view scrolls nowhere for.
 *
 * `pnpm markdown` is the thing that stops it: it renders every README in the
 * corpus through this file and asserts the `id`s it emitted are exactly the
 * slugs `extract.mjs` scanned out of the same bytes — the same agreement it
 * already enforces for fenced code blocks, for the same reason.
 *
 * Duplicate headings are **not** suffixed the way GitHub suffixes them
 * (`#options`, `#options-1`). `extract.mjs` does not either, so the two agree;
 * the day a README needs it, both change together and `pnpm markdown` is what
 * says so.
 */
export function headingSlug(heading: string): string {
  return (
    heading
      .trim()
      // ATX headings may close with their own `#`s. GFM drops them from the
      // text, and `extract.mjs`'s heading regex never captures them.
      .replace(/\s*#*\s*$/, '')
      .toLowerCase()
      // Inline markup is not part of the slug: `**Install**` → `install`.
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[^\w\- ]+/g, '')
      .replace(/ /g, '-')
  )
}
