/**
 * The gate, pointed at documentation that is known to be wrong.
 *
 * `tickets/DOCS-3`: *"The check fails when a README claims something false —
 * **prove it with a negative control**, by reintroducing one of the five
 * defects above and confirming the gate goes red."* And, from the same ticket's
 * standing rule: a documentation gate you cannot demonstrate failing is
 * decoration.
 *
 * So this is not a one-off experiment somebody ran once and wrote up. It runs
 * **before every real check, on every invocation of `scripts/docs.mjs`**, and
 * the run aborts if any control fails to trip. `pnpm docs:check` cannot print a green
 * summary without having just demonstrated, in that same process and that same
 * browser, that it reports each defect class it claims to cover.
 *
 * Every sample below is a *reconstruction of a defect this repository actually
 * shipped*, named in the ticket:
 *
 *   1  v-dropzone recipe 3   `Authorization: Bearer undefined` — a setup ref
 *                            read with `.value` inside a template expression.
 *   2  v-dropzone recipe 4   `_ctx.fetch is not a function` — a browser global
 *                            called from a template expression.
 *   3  v-fit-children brief  three documented exports that exist nowhere.
 *   4  v-keyboard-navigation a `<script setup>` beside bare markup, which Vue
 *                            reads as a custom block and renders as nothing.
 *
 * …plus the structural classes the same ticket asks for: a fence nobody tagged,
 * a link that goes nowhere, a live-site link to a tab that does not exist, and
 * an option documented in a table that the source has never heard of — and,
 * since `tickets/DOCS-4`, a live-site link to a *card* that does not exist, in
 * both of the separator forms that resolve.
 *
 * The last control is the one that keeps the rest honest: a **correct** sample,
 * which must produce no error at all. Without it, a check that returned
 * "broken" for every input would pass all of the above.
 */
import { extractReadme } from './extract.mjs'
import { classifyBlock } from './classify.mjs'
import { checkLinks } from './links.mjs'
import { checkClaims } from './claims.mjs'

/**
 * Compiled in the page, through the same `window.__PLAYGROUND_DOC_SAMPLE__`
 * every README block goes through.
 *
 * `expect` is the finding code that must come back at `error` severity;
 * `expect: null` means the sample must come back clean.
 */
const SAMPLE_CONTROLS = [
  {
    name: 'DZ-5 recipe 3 — Bearer undefined',
    expect: 'TEMPLATE_REF_UNWRAP',
    lang: 'vue',
    code: `<script setup lang="ts">
import { ref } from 'vue'
import { vDropzone } from '@ozjsey/v-dropzone'
const token = ref('abc')
</script>

<template>
  <div v-dropzone="{ upload: { url: '/api/upload', headers: { Authorization: 'Bearer ' + token.value } } }" />
</template>`,
  },
  {
    name: 'DZ-5 recipe 4 — _ctx.fetch is not a function',
    expect: 'TEMPLATE_GLOBAL',
    lang: 'vue',
    code: `<script setup lang="ts">
import { vDropzone } from '@ozjsey/v-dropzone'
</script>

<template>
  <div v-dropzone="{ upload: (file) => fetch('/api/upload', { method: 'POST', body: file }) }" />
</template>`,
  },
  {
    name: 'v-fit-children brief — an export that does not exist',
    expect: 'MISSING_EXPORT',
    lang: 'vue',
    code: `<script setup lang="ts">
import { useFitChildren } from '@ozjsey/v-fit-children'
const fit = useFitChildren()
</script>

<template>
  <div>{{ fit }}</div>
</template>`,
  },
  {
    name: 'a <script setup> beside bare markup',
    expect: 'STRAY_ELEMENT',
    lang: 'vue',
    code: `<script setup lang="ts">
const options = {}
</script>

<ul v-keyboard-navigation="options">…</ul>`,
  },
  {
    name: 'a directive nothing registers',
    expect: 'UNKNOWN_DIRECTIVE',
    lang: 'vue',
    code: `<script setup lang="ts">
const tags = []
</script>

<template>
  <div v-fit-childrens="{}">{{ tags }}</div>
</template>`,
  },
  {
    name: 'markup that does not close',
    expect: 'COMPILE',
    lang: 'vue',
    code: `<div v-copy="'hello'">`,
  },
  {
    name: 'TypeScript that does not parse',
    expect: 'PARSE',
    lang: 'ts',
    code: `upload: {
  url: '/api/upload',
}`,
  },
  {
    // A type imported without the `type` keyword: elided by esbuild, a build
    // error under `verbatimModuleSyntax`, which @vue/tsconfig turns on.
    name: 'a type import written as a value import',
    expect: 'UNTYPED_TYPE_IMPORT',
    severity: 'warn',
    lang: 'ts',
    code: `import { FitChildrenOptions } from '@ozjsey/v-fit-children'

function use(options: FitChildrenOptions) {
  return options
}`,
  },
  {
    name: 'a correct sample (the control on the controls)',
    expect: null,
    lang: 'vue',
    code: `<script setup lang="ts">
import { ref } from 'vue'
import { vCopy } from '@ozjsey/v-copy'
const history = ref<string[]>([])
</script>

<template>
  <p v-copy="{ sink: history }">Copy me</p>
  <span>{{ history.length }}</span>
</template>`,
  },
]

/** Synthetic READMEs for the checks that never reach the browser. */
const README_CONTROLS = [
  {
    name: 'a fence nobody tagged',
    expect: 'UNDECLARED_BLOCK',
    run: () => {
      const readme = extractReadme('# x\n\n```\nsome output\n```\n', { file: 'control' })
      return readme.blocks.flatMap((block) => classifyBlock(block).findings)
    },
  },
  {
    name: 'a fence whose language is a typo',
    expect: 'UNKNOWN_LANGUAGE',
    run: () => {
      const readme = extractReadme('# x\n\n```typscript\nconst a = 1\n```\n', { file: 'control' })
      return readme.blocks.flatMap((block) => classifyBlock(block).findings)
    },
  },
  {
    name: 'a relative link to a file that is not there',
    expect: 'DEAD_PATH',
    expectsLinks: true,
    markdown:
      '# x\n\nSee [the site](https://ozjsey.github.io/npm-portfolio-playground/#v-copy) and\n' +
      '[the architecture](./NO-SUCH-FILE.md).\n',
  },
  {
    name: 'a live-site link to a tab that does not exist',
    expect: 'DEAD_TAB',
    expectsLinks: true,
    markdown: '# x\n\n[playground](https://ozjsey.github.io/npm-portfolio-playground/#v-nonexistent)\n',
  },
  {
    // DOCS-4. The card half of the hash rots far faster than the tab half, and
    // these links ship inside tarballs, so the gate has to be shown catching a
    // card id that is not there — with both separators, because both resolve.
    name: 'a live-site link to a card that does not exist',
    expect: 'DEAD_CARD',
    expectsLinks: true,
    markdown:
      '# x\n\n[the card](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/no-such-card)\n',
  },
  {
    name: 'the same dead card written with the # separator',
    expect: 'DEAD_CARD',
    expectsLinks: true,
    markdown:
      '# x\n\n[the card](https://ozjsey.github.io/npm-portfolio-playground/#v-copy#no-such-card)\n',
  },
  {
    name: 'an anchor to a heading that is not there',
    expect: 'DEAD_ANCHOR',
    expectsLinks: true,
    markdown:
      '# x\n\n[the site](https://ozjsey.github.io/npm-portfolio-playground/#v-copy)\n\n[jump](#nowhere)\n',
  },
  {
    name: 'a README with no live-site link at all',
    expect: 'NO_LIVE_LINK',
    expectsLinks: true,
    markdown: '# x\n\nNothing here points at the playground.\n',
  },
  {
    // Advisory by design — a name can be absent for an honest reason. The
    // control asserts the severity it is supposed to have, not `error`, so
    // nobody can quietly demote a check and still pass here.
    name: 'an option documented that the source has never heard of',
    expect: 'UNDEMONSTRATED_CLAIM',
    severity: 'warn',
    run: (ctx) => {
      const readme = extractReadme(
        '# x\n\n## Options\n\n| Option | Type |\n|---|---|\n| `nosuchoptionanywhere` | `boolean` |\n',
        { file: 'control' },
      )
      // An empty haystack on purpose: `ctx.pkgDir` points at a directory that
      // does not exist, so the only way this control can pass is the check
      // noticing the name is absent. Pointing it at real source would have the
      // control pass because *this file* contains the string.
      return checkClaims(readme, ctx.pkgDir).findings
    },
  },
  {
    // Carries a *real* card link as well as the tab link, so "the checker is
    // not simply calling every card dead" is proven in the same breath.
    name: 'a correct README (the control on the controls)',
    expect: null,
    expectsLinks: true,
    markdown: (ctx) =>
      '# x\n\n[playground](https://ozjsey.github.io/npm-portfolio-playground/#v-copy)\n\n' +
      `[the bare binding](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/${ctx.cards['v-copy'][0].slug})\n\n` +
      '## Install\n\n```bash\nnpm install @ozjsey/v-copy\n```\n\n[jump](#install)\n',
  },
]

/**
 * Runs every control and returns what failed to behave as advertised.
 *
 * @param page  a CDP page handle on the booted playground
 * @param ctx   `{ repoRoot, playgroundDir, libraryIds, cards, pkgDir }`
 * @returns `{ ran, failures }` — `failures` empty means the gate has just
 *          demonstrated it can go red for each class below.
 */
export async function runNegativeControl(page, ctx) {
  const failures = []
  let ran = 0

  for (const control of SAMPLE_CONTROLS) {
    ran++
    let report
    try {
      report = await page.evaluate(
        `JSON.parse(JSON.stringify(window.__PLAYGROUND_DOC_SAMPLE__(${JSON.stringify({
          code: control.code,
          lang: control.lang,
          id: `negative-control/${control.expect ?? 'clean'}`,
        })})))`,
      )
    } catch (err) {
      failures.push(`${control.name}: the page threw — ${err.message.split('\n')[0]}`)
      continue
    }
    failures.push(...verdict(control, report.findings))
  }

  for (const control of README_CONTROLS) {
    ran++
    let findings
    try {
      findings = control.expectsLinks
        ? (
            await checkLinks(
              extractReadme(
                typeof control.markdown === 'function' ? control.markdown(ctx) : control.markdown,
                { file: 'control' },
              ),
              {
                readmePath: `${ctx.repoRoot}/negative-control/README.md`,
                libraryId: null,
                repoRoot: ctx.repoRoot,
                libraryIds: ctx.libraryIds,
                cards: ctx.cards,
                // Never the network: a control has to be deterministic, and a
                // 404 that depends on somebody's DNS is not a control.
                network: false,
                timeoutMs: 1,
              },
            )
          ).findings
        : control.run(ctx)
    } catch (err) {
      failures.push(`${control.name}: the check threw — ${err.message.split('\n')[0]}`)
      continue
    }
    failures.push(...verdict(control, findings))
  }

  return { ran, failures }
}

function verdict(control, findings) {
  if (control.expect === null) {
    const errors = findings.filter((f) => f.severity === 'error')
    return errors.length
      ? [
          `${control.name}: expected a clean result, got ${errors
            .map((f) => f.code)
            .join(', ')} — the check reports a defect for correct input, so every PASS it ` +
            `gives is worthless.`,
        ]
      : []
  }
  const severity = control.severity ?? 'error'
  if (findings.some((f) => f.code === control.expect && f.severity === severity)) return []
  return [
    `${control.name}: expected ${severity} ${control.expect}, got ` +
      `${findings.map((f) => `${f.severity}:${f.code}`).join(', ') || 'nothing at all'} — ` +
      `this gate can no longer detect that defect.`,
  ]
}
