/**
 * README.md → the things a gate can check: fenced blocks, links, headings.
 *
 * Deliberately a *parser over the file on disk*, never a table of samples
 * copied into a test. `tickets/DOCS-3`: "Do not hand-copy the samples into the
 * test — extract them from the file, so the check cannot drift from the doc."
 * Everything downstream keeps the 1-based line number the block opened on, so
 * a failure names `v-dropzone/README.md:412` and not "the fourth vue block".
 *
 * The fence scanner mirrors `src/markdown.ts` on purpose — that renderer is
 * what the Documentation view runs, so a block this file sees and that file
 * does not (or the other way round) is itself a defect. The one intentional
 * difference is the info string: `src/markdown.ts` matches ```` ```(\w*) ````
 * and nothing else, so a fence carrying anything beyond a bare language word
 * does not render as code at all. That is why `classify.mjs` puts the
 * declaration *in the language word* rather than inventing a suffix syntax.
 */

/** ```` ```lang ```` — the opener. GFM allows any info string; we record it whole. */
const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** GitHub's heading→anchor rule, which is what `#section` links in these files mean. */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    // Inline markup is not part of the slug: `**Install**` → `install`.
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^\w\- ]+/g, '')
    .replace(/ /g, '-')
}

/**
 * Splits a README into fenced blocks and the prose between them.
 *
 * Links are only ever read out of the prose: a `[label](url)` inside a code
 * sample is code, and reporting it as a broken link would train people to
 * ignore this gate.
 */
export function extractReadme(text, { file }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  const headings = []
  /** Prose lines, with fenced regions blanked so line numbers still line up. */
  const prose = []

  let i = 0
  while (i < lines.length) {
    const open = lines[i].match(FENCE_OPEN)
    if (open) {
      const [, indent, marker, rawInfo] = open
      const info = rawInfo.trim()
      const startLine = i + 1
      const body = []
      i++
      const close = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`)
      let closed = false
      while (i < lines.length) {
        if (close.test(lines[i])) {
          closed = true
          break
        }
        body.push(lines[i].slice(0, indent.length) === indent ? lines[i].slice(indent.length) : lines[i])
        prose.push('')
        i++
      }
      prose[startLine - 1] = ''
      prose.push('')
      i++
      blocks.push({
        file,
        index: blocks.length,
        startLine,
        endLine: i,
        info,
        /** First word of the info string — the language, per GFM and per npm. */
        lang: info.split(/\s+/)[0] ?? '',
        code: body.join('\n'),
        unterminated: !closed,
      })
      continue
    }

    const heading = lines[i].match(HEADING)
    if (heading) headings.push({ line: i + 1, depth: heading[1].length, text: heading[2], slug: slugify(heading[2]) })
    prose.push(lines[i])
    i++
  }

  // `prose` is padded inside the fence loop so index === line - 1 throughout.
  while (prose.length < lines.length) prose.push('')

  return { file, lines, blocks, headings, links: extractLinks(prose.join('\n'), file), text }
}

/**
 * Inline links and images, plus the `<https://…>` autolink form.
 *
 * Scanned over the prose as one string rather than line by line, because a
 * markdown link may wrap: `v-observe`'s README opens the label on line 3 and
 * closes the URL on line 4, and a per-line scan reported it as having no
 * live-site link at all — a false failure against `_STANDARDS.md` #4, which is
 * worse than no check. Line numbers come back from the match offset.
 *
 * Code spans are blanked first: `` `[a](b)` `` is a literal, not a link — and
 * three READMEs here document a markdown snippet inside one.
 */
export function extractLinks(proseText, file) {
  const text = proseText.replace(/`[^`]*`/g, (m) => m.replace(/[^\n]/g, ' '))
  const lineAt = (offset) => {
    let line = 1
    for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++
    return line
  }

  const links = []
  for (const m of text.matchAll(/(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
    links.push({
      file,
      line: lineAt(m.index),
      label: m[2].replace(/\s+/g, ' ').trim(),
      href: m[3],
      image: m[1] === '!',
    })
  }
  for (const m of text.matchAll(/<(https?:\/\/[^>\s]+)>/g)) {
    links.push({ file, line: lineAt(m.index), label: m[1], href: m[1], image: false })
  }
  /**
   * `**[label]**(url)` and `[label]**(url)` are not links — markdown closes the
   * label at `]`, and the `(` that follows is then plain text. It renders as
   * visible punctuation on npm and reaches nobody's browser as a link, so it is
   * worth naming rather than quietly not collecting.
   */
  for (const m of text.matchAll(/\[([^\]]*)\]\*+\(\s*([^)\s]+)/g)) {
    links.push({
      file,
      line: lineAt(m.index),
      label: m[1].replace(/\s+/g, ' ').trim(),
      href: m[2],
      image: false,
      malformed: true,
    })
  }
  return links.sort((a, b) => a.line - b.line)
}
