/**
 * A very small Markdown renderer — enough for the README files in this
 * repository, and nothing more.
 *
 * Why not a dependency: `tickets/DOCS-1` lifts the playground's zero-dependency
 * rule for exactly this, and picking `marked` or `markdown-it` would be a
 * defensible call. This is ~150 lines against a known, fixed corpus — the
 * sibling READMEs, which this repo writes — and keeping it here means the
 * Documentation view has no install step, no lockfile churn, and no supply
 * chain. Swap it for a library the moment the corpus stops being ours.
 *
 * What it supports, because that is what the corpus uses: ATX headings, fenced
 * code blocks, GFM pipe tables, blockquotes, ordered and unordered lists,
 * horizontal rules, paragraphs, and the inline set (code spans, bold, italic,
 * links, images).
 *
 * Everything is HTML-escaped first and only generated tags are emitted, so a
 * README containing `<script>` renders as text rather than running. Inline code
 * is extracted before any other inline rule so that `**` inside a code span
 * stays literal.
 *
 * ## Links, and the one thing this renderer knows about its own page
 *
 * A README is written for npm, where every link is somewhere else and a new tab
 * is the right answer. The Documentation view renders those same READMEs **on
 * the site half of them link to**, so the same `target="_blank"` that is
 * correct on npm opens a second copy of the page the reader is already reading.
 *
 * Two destinations are therefore rendered as in-page navigation instead, and
 * both of them are *this document*:
 *
 *   - a URL that resolves to this app (`src/in-app-link.ts` owns that rule) —
 *     rendered as the hash route it names, so it switches tab or lands on a
 *     card;
 *   - a bare `#anchor`, which is a heading in the README being read — marked
 *     `data-md-anchor`, and matched by the `id` this file puts on every
 *     heading. `Documentation.vue` scrolls to it without touching the route,
 *     because the hash belongs to the router here and a section link must not
 *     spend it.
 *
 * Everything else keeps `target="_blank" rel="noreferrer noopener"`.
 */
import { inAppLink } from './in-app-link'
import { headingSlug } from './heading-slug'

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * The four entities `escapeHtml` writes, read back.
 *
 * `inline` runs over already-escaped text, so a captured href arrives escaped —
 * `?a=1&b=2` reaches these rules as `?a=1&amp;b=2`. That has to be undone
 * before the URL is parsed, or `in-app-link.ts` is handed a string that is not
 * the link the author wrote. It is undone before `safeHref` too, which then
 * escapes exactly once instead of turning `&amp;` into `&amp;amp;` — a href
 * that is a different URL from the one in the file. No link in today's corpus
 * contains an entity, so this changes no byte on screen; it is the pipeline
 * being right rather than lucky.
 *
 * `&amp;` is undone last, which is what keeps a literal `&amp;lt;` literal.
 */
const unescapeHtml = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')

/** Only http(s) and anchors — a `javascript:` href in a README is a mistake. */
const safeHref = (href: string): string =>
  /^(https?:\/\/|#|\.\/|\.\.\/|\/)/i.test(href.trim()) ? escapeHtml(href.trim()) : '#'

/**
 * One rendered `[label](href)`.
 *
 * Three destinations, three behaviours — see this file's header. The class is
 * part of the contract, not decoration: `src/styles.css` marks an in-page link
 * so the reader can see before clicking that it will not leave, and
 * `scripts/docs-ci.mjs` reads `target`/`rel`/`href` back out of the live DOM.
 */
function renderLink(label: string, rawHref: string): string {
  const href = unescapeHtml(rawHref)

  const internal = inAppLink(href)
  if (internal !== null) {
    const where = internal.route ? `the ${internal.route} view of this page` : 'the top of this page'
    return (
      `<a class="md-a md-a--in-app" href="${escapeHtml(internal.href)}"` +
      ` data-in-app="${escapeHtml(internal.route)}"` +
      ` title="Stays on this page — goes to ${escapeHtml(where)}">${label}</a>`
    )
  }

  if (href.startsWith('#')) {
    const slug = headingSlug(href.slice(1))
    return (
      `<a class="md-a md-a--anchor" href="#${escapeHtml(slug)}" data-md-anchor="${escapeHtml(slug)}"` +
      ` title="Stays on this page — scrolls to this README's “${escapeHtml(slug)}” section">${label}</a>`
    )
  }

  return `<a class="md-a" href="${safeHref(href)}" target="_blank" rel="noreferrer noopener">${label}</a>`
}

/**
 * Inline rules, applied to already-escaped text.
 *
 * Code spans come out first and go back in last: their content must survive
 * every other rule, and `**` or `_` inside one is not emphasis.
 */
function inline(escaped: string): string {
  const codeSpans: string[] = []
  let text = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code)
    return `\u0000${codeSpans.length - 1}\u0000`
  })

  text = text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, alt: string, src: string) =>
      `<img class="md-img" src="${safeHref(src)}" alt="${alt}" loading="lazy">`,
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, label: string, href: string) =>
      renderLink(label, href),
    )
    // `[\s\S]+?` rather than `[^*]+`: bold legitimately wraps italic —
    // `**absent *and* on it rejecting**` appears in v-copy's README — and a
    // character class that excludes `*` cannot span the inner pair.
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')

  return text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => `<code>${codeSpans[Number(index)]}</code>`)
}

const cell = (raw: string) => inline(escapeHtml(raw.trim()))

/**
 * `| a | b |` → the cells, with the leading and trailing pipes dropped.
 *
 * A `\|` is a literal pipe and does not split — GFM's rule, and the only way to
 * put one in a cell. It is load-bearing here: `v-teleport-to`'s options table
 * writes `\|\|` inside a code span, and splitting on those cut the span in half,
 * which surfaced as an inverted `</code>…<code>` and an orphaned `**` halfway
 * down the table. An unescaped pipe still splits even inside a code span, also
 * per GFM, so this view breaks exactly where npm would.
 */
const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/\\\|/g, '\u0001')
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((part) => part.replace(/\u0001/g, '|'))

/**
 * Anything that starts a new block, and therefore ends the one being read.
 *
 * The fence alternative must stay in step with the opener matched in
 * `renderMarkdown` — a line this calls a new block while that calls it prose is
 * a line no branch consumes, which is the hang DOCS-6 found.
 */
const BLOCK_OPENER = /^(#{1,6}\s|\s*[`~]{3}|>|\s*[-*+]\s|\s*\d+[.)]\s|(-{3,}|\*{3,}|_{3,})\s*$)/

const isTableDivider = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let index = 0

  /** Open list state: the tag currently awaiting a close. */
  let openList: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (openList) {
      out.push(`</${openList}>`)
      openList = null
    }
  }

  while (index < lines.length) {
    const line = lines[index]

    // Fenced code. The fence language becomes a class; the body is verbatim.
    //
    // The leading-whitespace group is load-bearing. A fence indented inside a
    // list item is still a fence — GFM, npm and GitHub all render it as code —
    // and matching only at column 0 silently turned `vue-write-behind`'s two
    // in-list samples into paragraphs with visible backticks. Found by
    // `scripts/docs.mjs`, which compares the blocks on screen with the blocks in
    // the file. The same indent is stripped from the body, so the code is not
    // rendered two spaces to the right of every other block.
    //
    // The opener is whatever GFM calls one — three or more backticks or tildes,
    // any info string — and the language is the info string's first word. This
    // used to be `(\w*)` followed by end-of-line, so ```` ```ts twoslash ````
    // and ```` ```` ```` matched nothing here; being block openers, they were
    // then claimed by no rule at all and **hung the browser** (see the paragraph
    // branch below). Closing against the opener's own marker and length is what
    // lets a four-backtick fence contain three backticks.
    //
    // `scripts/docs/extract.mjs` scans fences with the same rule, which is the
    // point: a block it sees and this file does not renders as prose with
    // visible backticks on a page nobody diffed.
    const fence = line.match(/^(\s*)([`~]{3,})(.*)$/)
    if (fence) {
      closeList()
      const indent = fence[1]
      const language = fence[3].trim().split(/\s+/)[0]
      const closer = new RegExp(`^\\s*${fence[2][0]}{${fence[2].length},}\\s*$`)
      const body: string[] = []
      index++
      while (index < lines.length && !closer.test(lines[index])) {
        body.push(lines[index].startsWith(indent) ? lines[index].slice(indent.length) : lines[index])
        index++
      }
      index++
      out.push(
        `<pre class="md-pre"${language ? ` data-lang="${escapeHtml(language)}"` : ''}>` +
          `<code>${escapeHtml(body.join('\n'))}</code></pre>`,
      )
      continue
    }

    if (!line.trim()) {
      closeList()
      index++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList()
      out.push('<hr class="md-hr">')
      index++
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      // The id is what a `#section` link in the same README lands on, and
      // `headingSlug` is GitHub's rule so it is the *same* id npm resolves. The
      // closing `#`s of a setext-style ATX heading are not part of the slug
      // (GFM), but they are left in the visible label, which is what this
      // renderer has always shown.
      const slug = headingSlug(heading[2])
      out.push(
        `<h${level} class="md-h md-h${level}" id="${escapeHtml(slug)}">` +
          `${inline(escapeHtml(heading[2]))}</h${level}>`,
      )
      index++
      continue
    }

    // GFM pipe table: a header row, a divider row, then body rows.
    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      closeList()
      const head = splitRow(line).map((c) => `<th>${cell(c)}</th>`)
      index += 2
      const body: string[] = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        body.push(`<tr>${splitRow(lines[index]).map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`)
        index++
      }
      out.push(
        `<div class="md-table-wrap"><table class="md-table">` +
          `<thead><tr>${head.join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`,
      )
      continue
    }

    // Blockquote: consume the whole run, strip the markers, render recursively.
    if (/^>\s?/.test(line)) {
      closeList()
      const quoted: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ''))
        index++
      }
      out.push(`<blockquote class="md-quote">${renderMarkdown(quoted.join('\n'))}</blockquote>`)
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const item = bullet ?? line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (item) {
      const wanted = bullet ? 'ul' : 'ol'
      if (openList !== wanted) {
        closeList()
        out.push(`<${wanted} class="md-list">`)
        openList = wanted
      }
      // Lazy continuation. A wrapped list item is one item, and rendering each
      // physical line separately splits any inline span that crosses the wrap —
      // three READMEs here open `**` on one line and close it on the next.
      const parts = [item[1]]
      index++
      while (index < lines.length && lines[index].trim() && !BLOCK_OPENER.test(lines[index])) {
        parts.push(lines[index].trim())
        index++
      }
      out.push(`<li>${inline(escapeHtml(parts.join(' ')))}</li>`)
      continue
    }

    // Paragraph: this line, plus everything up to the next blank line or
    // block-level opener.
    //
    // **The first line is taken unconditionally, and that is what guarantees
    // this loop terminates.** Every other branch above consumes at least one
    // line; this one used to consume none whenever `line` was itself a block
    // opener that no branch above had claimed — `BLOCK_OPENER` stopped the loop
    // on its first test, nothing was pushed, `index` never moved, and the tab
    // froze with a pegged CPU. The only shape that reached it was a fence the
    // opener regex did not match, which the branch above now fixes; leaving the
    // guarantee to that agreement is how it comes back. A renderer that hangs
    // is worse than one that renders a line wrongly, so it cannot depend on two
    // regexes staying in step.
    closeList()
    const paragraph: string[] = [line]
    index++
    while (index < lines.length && lines[index].trim() && !BLOCK_OPENER.test(lines[index])) {
      paragraph.push(lines[index])
      index++
    }
    out.push(`<p class="md-p">${inline(escapeHtml(paragraph.join('\n')))}</p>`)
  }

  closeList()
  return out.join('\n')
}
