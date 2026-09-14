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
 */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Only http(s) and anchors — a `javascript:` href in a README is a mistake. */
const safeHref = (href: string): string =>
  /^(https?:\/\/|#|\.\/|\.\.\/|\/)/i.test(href.trim()) ? escapeHtml(href.trim()) : '#'

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
      `<a class="md-a" href="${safeHref(href)}" target="_blank" rel="noreferrer noopener">${label}</a>`,
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

/** Anything that starts a new block, and therefore ends the one being read. */
const BLOCK_OPENER = /^(#{1,6}\s|\s*```|>|\s*[-*+]\s|\s*\d+[.)]\s|(-{3,}|\*{3,}|_{3,})\s*$)/

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
    const fence = line.match(/^(\s*)```(\w*)\s*$/)
    if (fence) {
      closeList()
      const indent = fence[1]
      const language = fence[2]
      const body: string[] = []
      index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
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
      out.push(`<h${level} class="md-h md-h${level}">${inline(escapeHtml(heading[2]))}</h${level}>`)
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

    // Paragraph: everything up to the next blank line or block-level opener.
    closeList()
    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !BLOCK_OPENER.test(lines[index])) {
      paragraph.push(lines[index])
      index++
    }
    if (paragraph.length) out.push(`<p class="md-p">${inline(escapeHtml(paragraph.join('\n')))}</p>`)
  }

  closeList()
  return out.join('\n')
}
