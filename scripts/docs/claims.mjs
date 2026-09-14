/**
 * DOCS-3 item 4 — *"Where a README states a behaviour, there should be a card
 * or a check that shows it. A claim with neither is a reportable gap."*
 *
 * The general form of that is unbounded, so this takes the tractable slice with
 * the worst track record: **named API**. The option in the options table, the
 * event in the events table, the `data-*` state attribute, the CSS custom
 * property, the `### \`exportName\`` section. Each of those is a noun the README
 * asserts exists, and each is greppable.
 *
 * The defect this is shaped around is real and recent: `v-fit-children`'s brief
 * documented three exports present in neither the source, the dist, nor the
 * published tarball. Nothing caught it because nothing was looking — a reader
 * has to already know the API to notice that a row in a table is fiction.
 *
 * It reports, it does not fail. A name can be absent from the source for an
 * honest reason — a README may document a CSS class the *consumer* writes, or
 * quote a Vue or DOM API. That is why every finding here is an advisory that
 * names the row and the line, and why the row is only collected when it is a
 * lone backticked identifier in the first column of a table: prose is full of
 * nouns, and a gate that cries wolf about prose is one nobody reads.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const finding = (severity, code, message, line) => ({ severity, code, message, line })

/** Directories that are not this package's own source. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.turbo', '.vite'])
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs|vue|css)$/

/**
 * Names that mean something to TypeScript, the DOM or Vue rather than to this
 * package. A README documenting `| \`boolean\` | … |` is describing a type.
 */
const NOT_OURS = new Set([
  'true', 'false', 'null', 'undefined', 'string', 'number', 'boolean', 'object', 'any', 'void',
  'never', 'unknown', 'symbol', 'bigint', 'Array', 'Object', 'Function', 'Promise', 'Map', 'Set',
  'RegExp', 'Error', 'Date', 'JSON', 'default',
])

/**
 * First-column headers that mean "the rest of this column is this package's
 * API". Anything else and the table is not making that claim.
 */
const NAME_COLUMN = new Set([
  'option', 'options', 'event', 'events', 'prop', 'props', 'property', 'properties',
  'attribute', 'attributes', 'name', 'names', 'method', 'methods', 'export', 'exports',
  'field', 'fields', 'key', 'keys', 'variable', 'variables', 'custom property',
  'css variable', 'css custom property', 'state', 'data attribute', 'setting',
])

const isName = (text) => /^[A-Za-z_$][\w$]*$/.test(text)
const isAttribute = (text) => /^data-[a-z][\w-]*$/.test(text)
const isCssVar = (text) => /^--[a-z][\w-]*$/.test(text)
const isEventName = (text) => /^[a-z]+(-[a-z]+)+$/.test(text)

/** Every source byte of a package, plus its playground tab, as one haystack. */
function haystack(dir, extra) {
  let text = ''
  const walk = (path) => {
    let entries
    try {
      entries = readdirSync(path)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
      const full = join(path, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (SOURCE_EXT.test(entry) && stat.size < 2_000_000) text += readFileSync(full, 'utf8')
    }
  }
  walk(dir)
  for (const path of extra) walk(path)
  return text
}

/**
 * The names a README presents as this package's API.
 *
 * Four shapes, each of which only ever appears where a name is being declared:
 * a heading that opens with a code span, a list item whose first token is a
 * bolded code span, an inline options bag (`{ source?, sink?, … }`), and the
 * first cell of a table whose header says that column holds names.
 */
export function documentedNames(readme) {
  const names = new Map()
  const add = (text, line) => {
    const name = text.trim()
    if (NOT_OURS.has(name)) return
    if (!isName(name) && !isAttribute(name) && !isCssVar(name) && !isEventName(name)) return
    if (!names.has(name)) names.set(name, line)
  }

  readme.lines.forEach((line, index) => {
    // `### \`dedupe\`` and `#### \`dedupe\` compares text, not labels` — a
    // heading that opens with a code span is a section *about* that name.
    const heading = line.match(/^#{2,6}\s+`([^`]+)`/)
    if (heading) add(heading[1].replace(/\(.*$/, ''), index + 1)

    // `- **\`discard(key)\`** cannot recall a request that has already left.`
    // The bullet-with-a-bolded-name shape is how vue-write-behind documents its
    // whole controller surface, and there is no table to read it out of.
    const bullet = line.match(/^\s*[-*+]\s+\*\*`([^`]+)`\*\*/)
    if (bullet) add(bullet[1].replace(/\(.*$/, ''), index + 1)

    // `\`{ source?, sink?, max?, dedupe? }\`` — an options bag written inline.
    // v-copy documents its entire config this way and has no `| Option |`
    // table at all, so without this its claims phase checks nothing.
    for (const bag of line.matchAll(/`\{\s*([^`{}]+?)\s*\}`/g)) {
      const keys = bag[1].split(',')
      if (keys.length < 2) continue
      for (const key of keys) {
        const name = key.trim().replace(/\?$/, '')
        if (isName(name)) add(name, index + 1)
      }
    }
  })

  // Table rows — but only from a table that says its first column is a name.
  //
  // This is the difference between a check and a noise generator. v-copy has a
  // "Binding forms" table whose first column is example *values*
  // (`historyArray`), and a "Part of a set" table whose first column is other
  // packages (`v-observe`); both were reported as undocumented API on the first
  // run. A table headed `Option` / `Event` / `Attribute` is making a claim
  // about this package's surface. A table headed anything else is prose in a
  // grid.
  const fenced = new Set()
  for (const block of readme.blocks) {
    for (let line = block.startLine; line <= block.endLine; line++) fenced.add(line)
  }

  let inNameTable = false
  readme.lines.forEach((line, index) => {
    if (fenced.has(index + 1)) return
    const row = line.trim()
    if (!row.startsWith('|')) {
      inNameTable = false
      return
    }
    const cells = row.slice(1).split('|')
    const first = (cells[0] ?? '').trim()

    // A divider row confirms the line before it was the header.
    if (/^:?-{2,}:?$/.test(first.replace(/\s/g, ''))) return
    if (NAME_COLUMN.has(first.replace(/[`*]/g, '').trim().toLowerCase())) {
      inNameTable = true
      return
    }
    if (!inNameTable) return

    const span = first.match(/^`([^`]+)`(\s*\*?\(?default\)?\*?)?$/)
    if (span) add(span[1], index + 1)
  })

  return names
}

export function checkClaims(readme, pkgDir, extraDirs = []) {
  const names = documentedNames(readme)
  const source = haystack(pkgDir, extraDirs)
  const findings = []

  for (const [name, line] of names) {
    if (source.includes(name)) continue
    findings.push(
      finding(
        'warn',
        'UNDEMONSTRATED_CLAIM',
        `documents \`${name}\` as API, and that string appears nowhere in the package's source. ` +
          `Either it does not exist, or it is named differently in the code.`,
        line,
      ),
    )
  }

  return { findings, checked: names.size }
}
