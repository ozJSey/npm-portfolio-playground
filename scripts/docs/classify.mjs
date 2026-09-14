/**
 * What a fenced block declares itself to be.
 *
 * **The language word on the fence is the declaration, and there is no second
 * marker.** ```` ```vue ```` is a Vue SFC and must compile; ```` ```ts ```` is a
 * TypeScript module and must parse; ```` ```text ````, ```` ```bash ````,
 * ```` ```json ```` are prose that happens to be monospaced. An output sample, a
 * directory diagram or a log excerpt says so by not claiming to be Vue.
 *
 * That choice is forced by `src/markdown.ts`, which renders these same fences in
 * the Documentation view and matches a **bare language word only** — a fence
 * carrying ```` ```ts ignore ```` would stop rendering as code at all, on the very
 * page this gate exists to protect. Anything encoded after the language is
 * therefore itself reported (`FENCE_INFO_STRING`).
 *
 * Two things are never silently skipped, because `tickets/DOCS-3` is explicit
 * that silent skipping is how a gate stops gating:
 *
 *   `UNDECLARED_BLOCK`  no language word at all. "Nobody tagged it" and "nobody
 *                       checked it" are the same state, and the second one is
 *                       invisible.
 *   `UNKNOWN_LANGUAGE`  a word that is neither runnable nor known prose — a
 *                       typo'd ```` ```typscript ```` is a sample that quietly
 *                       stopped being compiled.
 */

/** Prose. Rendered monospaced, never executed, never compiled. */
export const PROSE_LANGS = new Set([
  'bash', 'sh', 'shell', 'console', 'zsh',
  'text', 'txt', 'plain', 'output', 'diff',
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini',
  'html', 'xml', 'svg', 'css', 'scss',
  'md', 'markdown', 'sql', 'python', 'go', 'rust',
])

/**
 * Code. Must compile through `src/doc-sample.ts`.
 *
 * Kept in step with that module's own sets by the boot probe in `docs.mjs`:
 * the page is asked to compile a language this list does not have, and must
 * answer `unsupported`.
 */
export const RUNNABLE_LANGS = new Set(['vue', 'ts', 'typescript', 'js', 'javascript', 'mjs', 'tsx', 'jsx'])

const finding = (severity, code, message, line) => ({ severity, code, message, line })

/**
 * @returns `{ runnable, findings }` — `runnable` means "hand this to the page".
 */
export function classifyBlock(block) {
  const findings = []

  if (block.unterminated) {
    return {
      runnable: false,
      findings: [
        finding(
          'error',
          'UNTERMINATED_FENCE',
          'fenced block is never closed — everything below it renders as code.',
          block.startLine,
        ),
      ],
    }
  }

  if (!block.code.trim()) {
    return {
      runnable: false,
      findings: [finding('warn', 'EMPTY_BLOCK', 'empty fenced block.', block.startLine)],
    }
  }

  if (!block.lang) {
    return {
      runnable: false,
      findings: [
        finding(
          'error',
          'UNDECLARED_BLOCK',
          `fenced block declares no language, so nothing can decide whether it should compile. ` +
            `Tag it — \`text\` for an output sample or a diagram, \`vue\`/\`ts\` for code that ` +
            `must compile. First line: ${JSON.stringify(block.code.split('\n')[0].slice(0, 72))}`,
          block.startLine,
        ),
      ],
    }
  }

  if (!RUNNABLE_LANGS.has(block.lang)) {
    if (!PROSE_LANGS.has(block.lang)) {
      findings.push(
        finding(
          'error',
          'UNKNOWN_LANGUAGE',
          `fence says \`${block.info}\`, which is neither a language this gate compiles ` +
            `(${[...RUNNABLE_LANGS].join(', ')}) nor one it knows to be prose. A typo here is a ` +
            `sample that silently stops being checked.`,
          block.startLine,
        ),
      )
    }
    return { runnable: false, findings }
  }

  if (block.info !== block.lang) {
    findings.push(
      finding(
        'error',
        'FENCE_INFO_STRING',
        `fence says \`${block.info}\`. src/markdown.ts only matches a bare language word, so ` +
          `this block does not render as code in the Documentation view at all.`,
        block.startLine,
      ),
    )
  }

  return { runnable: true, findings }
}
