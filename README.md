# Playground

One page, one tab per v-\* library, every feature demoed — and every demo editable in the browser
while it runs. The source and deployment live in the [npm portfolio playground repository](https://github.com/ozJSey/npm-portfolio-playground).

```bash
cd playground
pnpm install
pnpm dev             # http://localhost:5173 — published npm packages
```

Every library is loaded from its published npm package, so a clean checkout exercises the same
artifacts consumers install.

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server using the published npm packages |
| `pnpm smoke` | Boots the server and renders every tab in headless Chrome twice |
| `pnpm interactions` | Drives every card through CDP in a real Chrome and asserts on the resulting UI |
| `pnpm geometry` | Measures the `v-fit-children` rows at three viewports — spill, clipping, over-hiding, and the event against the DOM |
| `pnpm docs:check` | Checks the Documentation view: every package README rendered, its code samples compiled, its links resolved, its tarball packed |
| `pnpm docs:ci` | Builds this repository **alone**, the way GitHub Actions does, and asserts every documentation tab renders the published README and that nothing widens the page at 1280px or 420px — the check DOCS-6 was missing |
| `pnpm markdown` | Renders every README through `src/markdown.ts` in a child process on a deadline: it must terminate, and it must see the same fenced blocks `scripts/docs/extract.mjs` does |
| `pnpm tabs` | Drives both tab strips with real key events — roving tabindex, arrows, Home/End, one tab stop, `aria-controls` wiring |
| `pnpm deeplinks` | Follows every `#<tab>/<card>` deep link in a real browser — all 144 cards, both separator forms, and every card link published in a sibling README |
| `pnpm typecheck` | `vue-tsc` over the playground **and** every demo SFC |
| `pnpm typecheck:libs` | `tsc --noEmit` over each aliased sibling package, with its own tsconfig — ten seconds, no browser |
| `pnpm build` | Static production build into `dist/` |
| `pnpm deps` | Rewrites this package's dependency blocks from `.dep-groups.yaml` (see below) |

> **`smoke` green is not the same as the demo being correct.** Smoke proves the card compiled and
> mounted; it cannot tell a live button from a dead one. Two `v-dropzone` cards once passed smoke
> while every button on them was a silent no-op (a `ref` written inside a template expression is
> unwrapped to `undefined`). `pnpm interactions` is what catches that class of failure — run it
> before calling a card done. Layout-shaped libraries additionally need `pnpm geometry` plus a look
> at a screenshot.

## When the harness fails, what does it say?

Five defects were found in these scripts in one month, and they were one defect wearing five hats:
**the instrument failed in a way that did not say why.** PG-14 (a compiler/runtime mismatch that
silently disabled `updated`), PG-15 (a `dist` alias falling back to source), PG-18 (`smoke`
reporting 0 cards with no error), PG-21 (`cdp.send` hanging forever), PG-22 (one broken package
blanking all ten tabs and naming nothing). The cost was a twenty-minute hang, several
"the run looked contaminated" reports, and two terminated agents.

So the standing question for anything added here is not "does it pass" but **"when this fails, how
does it announce itself"**. What each failure mode now says:

| Failure | What you see |
|---|---|
| A sibling package does not compile | The other nine tabs work. Its tab renders an error card naming the package and the error; a red banner on **every** tab repeats it; `smoke`, `interactions`, `geometry` and `deeplinks` each fail the run by name. `pnpm typecheck:libs` catches the same class in ten seconds, before any browser starts. |
| The page reloads mid-command | `CDP Runtime.evaluate was abandoned after 405ms: the page navigated to … while the command was in flight`. It used to hang forever. `interactions` re-mounts and retries up to three times before failing. |
| A CDP command never answers | `CDP <method> timed out after 30000ms` — `CDP_TIMEOUT_MS` raises it. |
| The render budget is too low | `still 0 cards at 50000ms, so this is not the time budget`, or — when the page never mounted at all — a real debugger is attached and the first page error is printed, or `The page threw nothing at all … Try SMOKE_TIME_BUDGET=50000`. |
| A tab does not render | Named against `src/demos/*/manifest.ts`, not against whatever the page managed to paint. The page is never allowed to choose its own denominator. |
| `geometry` measures fewer cards than the tab has | The run fails: "a viewport that sees fewer cards is not a viewport that passed". |
| The playground did not boot | The first page error and the first console error are printed. "Did not boot" alone reads exactly like "the dev server is slow", and half an hour went into that once. |
| The runner looked before the page finished | `BOOT DID NOT COMPLETE within 30000ms`, said in those words — never as "a package failed". `src/main.ts` publishes one marker, `window.__PLAYGROUND_BOOT__`, after the app mounts; it carries the versions *and* the failure list, so there is a single thing to wait on and it cannot be half-there. Every runner waits on it through `scripts/lib/boot.mjs`. The first cut of this guard read the synchronous versions stamp and the asynchronous failure list in the same breath, raced on a cold module graph, and aborted healthy runs with a message that read like a package failure — which is this table's whole subject, committed by the fix for it. |

**Ports are never hard-coded.** Every runner here — `smoke`, `interactions`, `geometry`, `docs`,
`deeplinks` — asks the OS for a free port (`scripts/lib/port.mjs`). PG-18 filed "smoke defaults to 5199, which collides", and a different
magic number is not the fix — when it was written, 5174, 5199, 5212, 5233, 5241-5244, 5261,
5277-5281, 5311-5333 and 5401-5413 were all in use on this machine by other agents' runs. `PORT=`
still pins one, and is checked before Vite starts, so a collision fails in a second by name instead
of after a thirty-second wait that reads like a slow boot.

**`PLAYGROUND_UNALIAS=<dir>[,<dir>]` resolves a package from `node_modules` instead of its sibling
source, for one run.** Several agents edit sibling packages here at once and every one of them is
aliased live into this app, so a half-finished sibling is the normal condition. Since PG-22 it no
longer takes the app down — but if the package you need is the broken one, name it and keep working.
It is deliberately not the default: a tab quietly reading the last published build instead of the
working tree is exactly the rot the source aliases exist to prevent.

**The instruments prove they can fail.** `pnpm docs:check` runs 19 deliberately broken samples through its
own code paths before it checks anything (see below); `pnpm docs:ci --negative-control`,
`pnpm docs:ci --probe-overflow`, `pnpm markdown --negative-control` and `pnpm tabs --negative-control`
each put their own defect back and require the gate to go red; and `pnpm deeplinks` rejects two
deliberately wrong assertions before it follows a single real link. `geometry` has the same idea as
an env var:

```bash
GEOMETRY_SELFTEST=empty-row      pnpm geometry   # hide every child of the first card's host
GEOMETRY_SELFTEST=over-spill     pnpm geometry   # un-hide them all so the row spills
GEOMETRY_SELFTEST=silent-change  pnpm geometry   # swallow fit-children-updated
```

Each injects that defect into **one** card and then **inverts the verdict** — and it is graded both
ways. The run exits 0 only if the harness went **red on the sabotaged card** *and* stayed **green on
the other ten**, which are sweeping the same widths with real layouts, including the narrowest, where
"nothing fits" is the correct answer. Both halves are load-bearing: the old version PASSED a row with
0 of 9 children visible, and a replacement that cries wolf on legitimate layouts gets muted — which
is the same blindness with an extra step. The empty-row detector earned that rule the hard way, by
flagging `08-decorative` at 120px, where the frame has 99px but a `+N more` badge inside it takes 75
of them.

Other knobs: `SMOKE_TIME_BUDGET` (default 25000ms — 9000 was too low under load and reported nothing),
`SMOKE_CONCURRENCY` (default 3 renders in flight; 4 was enough to get the whole process killed on a
loaded machine, `1` is the safe fallback), `CDP_TIMEOUT_MS`, `GEOMETRY_PROBE_BUDGET_MS`,
`GEOMETRY_NARROW=fail` (gate on the 375px sweep, which is currently the card stage's problem and not
the library's — FIT-1 F8), and `GEOMETRY_DUMP=<card>` (print a card's raw measurements).

## Card deep links — `pnpm deeplinks`

`tickets/DOCS-4`. A README paragraph links to the **card** that demonstrates it, not just to the
tab:

```text
#v-teleport-to                       the tab
#v-teleport-to/docs                  the rendered README
#v-teleport-to/placement-flip        a specific card
#v-teleport-to#placement-flip        the same card — `#` is accepted as a separator too
```

The card segment is the demo filename with its ordering prefix and `.vue` stripped, and
`src/card-link.ts` is the only place that rule exists. **It is a published URL**: these links ship
inside tarballs, so a reader who has installed the package cannot be given a corrected one. The
registry therefore refuses a slug collision the way it refuses an id/folder mismatch — an error
banner, which `smoke` fails on. Renaming the descriptive half of a demo file does break an old link,
deliberately: that rename means the card is about something else now, and an unknown segment
degrades to the tab with a banner naming what it could not find, plus the ids that tab does answer
to.

```bash
pnpm deeplinks                  # sources
pnpm deeplinks:dist             # the built dist entries
ONLY=v-dropzone pnpm deeplinks  # one tab
DEEPLINKS_READMES=0 pnpm deeplinks  # skip the links harvested out of the sibling READMEs
```

Every card is navigated to and read back out of the live DOM: exactly one card marked, the right
one, and its box on screen below the sticky header. **Two negative controls run first** — a card id
that does not exist asserted as if it did, and a real card asserted against the wrong one — and the
run aborts unless both come back red, because a link checker that always says PASS is worse than
none. The card list comes from `window.__PLAYGROUND_CARDS__`, published by `src/main.ts` from the
registry, so this runner and `scripts/docs/links.mjs` compare READMEs against the same list the
router resolves against rather than each re-deriving it.

## The documentation gate — `pnpm docs:check`

> **The colon is load-bearing.** `docs` is a built-in npm/pnpm command — *"Open documentation for a
> package in a web browser"*, alias `home`. So `pnpm docs` never ran this gate: it shelled out to
> the built-in, found no browser to open, and **exited 0 with no output**. It read exactly like a
> pass. Every instruction in this repo that said `pnpm docs` was running nothing, for as long as the
> script was named that. `pnpm run docs` would have worked, but the bare form is what people type.
> A name containing a colon cannot collide with a built-in, which is why this one has one — do not
> rename it back. Measured 2026-09-14 on pnpm 10.23.0.

`tickets/DOCS-3`; owner, 2026-09-13: *"We can treat documentation as smoke test too."* The
Documentation view renders each package's own `README.md`, so it is a rendered artifact like any
card and is checked like one. `node scripts/docs.mjs`, same harness, same Chrome.

```bash
pnpm docs:check                      # sources
pnpm docs:check:dist                 # the built dist entries — what an npm reader would get
ONLY=v-dropzone pnpm docs:check      # one package
DOCS_NET=0 pnpm docs:check           # no outbound HTTP
DOCS_PACK=0 pnpm docs:check          # no `npm pack` (leaves the npm copy UNVERIFIED, and says so)
```

Per package, five things:

| Check | What fails it |
|---|---|
| render | The tab's docs view does not mount, renders empty, or shows code blocks that differ from the file |
| samples | A fenced block declaring a runnable language does not compile |
| links | A dead anchor, a relative path that is not there, a live-site link to a tab **or a card** that does not exist, a 404 |
| tarball | `npm pack` ships no README, or ships one that is not the file this run checked |
| claims | A name documented as API that appears nowhere in the package's source *(advisory)* |

**The samples are compiled in the page**, by `src/doc-sample.ts` through the playground's own
`src/sfc/compile.ts` — the same compiler, the same aliased packages, a real `window`. Nothing is
executed: a README sample is somebody else's application code, and `app.mount('#app')` in a `ts`
block would mount a second Vue app over this one. On top of compiling, three lints reproduce defects
this repo has actually shipped: `fetch(…)` called from a template expression (`_ctx.fetch is not a
function`), `someRef.value` read from a template expression (`Authorization: Bearer undefined`), and
an import of a name the package does not export.

**A block declares what it is with its language word, and there is no second marker.** ` ```vue `
is a Vue SFC and must compile, ` ```ts ` is a TypeScript module and must parse, ` ```text ` /
` ```bash ` / ` ```json ` are prose. An output sample or a directory diagram says so by not claiming
to be Vue. A fence with **no** language is reported, never skipped — "nobody tagged it" and "nobody
checked it" look identical from the outside. (This is forced: `src/markdown.ts` matches a bare
language word only, so a ` ```ts ignore ` fence would stop rendering as code on the very page the
gate protects.)

**A `vue` block with no `<template>` and no `<script>` is a template excerpt** — 42 of the corpus's
100 — and is wrapped in `<template>` so it can compile. The report says so per block. Once a block
has a `<script>` it is claiming to be a whole component and is judged as one.

**The gate proves it can fail, every run.** `scripts/docs/negative-control.mjs` feeds 19 deliberately
broken samples and READMEs through the same code paths *before* any package is checked, and the run
aborts if one of them passes — including a correct sample that must come back clean, so a check that
cried wolf at everything could not sneak through. `pnpm docs:check` cannot print a green summary without
having just demonstrated, in that process and that browser, that it goes red on each defect class it
claims to cover.

Adding a package: nothing. `scripts/docs/packages.mjs` enumerates every non-private sibling with a
`package.json` off disk, and `scripts-status.mjs` reads its `docs view checked` column from the same
function.

## Portfolio packages

The playground documents and exercises the Vue packages in their published scoped form. All but
the last are directives; `vue-write-behind` is a composable, which the registry supports — see
the note on `directiveName: null` in `LIBRARY_SPECS` (`src/libraries.ts`).

| Package | npm | Source repository |
|---|---|---|
| `@ozjsey/v-copy` | [npm](https://www.npmjs.com/package/@ozjsey/v-copy) | [GitHub](https://github.com/ozJSey/v-copy) |
| `@ozjsey/v-dropzone` | [npm](https://www.npmjs.com/package/@ozjsey/v-dropzone) | [GitHub](https://github.com/ozJSey/v-dropzone) |
| `@ozjsey/v-fit-children` | [npm](https://www.npmjs.com/package/@ozjsey/v-fit-children) | [GitHub](https://github.com/ozJSey/vue-fit-children) |
| `@ozjsey/v-keyboard-navigation` | [npm](https://www.npmjs.com/package/@ozjsey/v-keyboard-navigation) | [GitHub](https://github.com/ozJSey/v-keyboard-navigation) |
| `@ozjsey/v-observe` | [npm](https://www.npmjs.com/package/@ozjsey/v-observe) | [GitHub](https://github.com/ozJSey/v-observe) |
| `@ozjsey/v-scroll-into-view` | [npm](https://www.npmjs.com/package/@ozjsey/v-scroll-into-view) | [GitHub](https://github.com/ozJSey/v-scroll-into-view) |
| `@ozjsey/v-select-text` | [npm](https://www.npmjs.com/package/@ozjsey/v-select-text) | [GitHub](https://github.com/ozJSey/v-select-text) |
| `@ozjsey/v-teleport-to` | [npm](https://www.npmjs.com/package/@ozjsey/v-teleport-to) | [GitHub](https://github.com/ozJSey/v-teleport-to) |
| `@ozjsey/vue-write-behind` | [npm](https://www.npmjs.com/package/@ozjsey/vue-write-behind) | [GitHub](https://github.com/ozJSey/vue-write-behind) |

[`@ozjsey/bigdecimal-string`](https://www.npmjs.com/package/@ozjsey/bigdecimal-string) has a tab of its own even though it is not a directive and never touches Vue — see the table below. [`@ozjsey/dependency-grouper`](https://www.npmjs.com/package/@ozjsey/dependency-grouper) keeps the shared dependency definitions coherent and is the one project with no tab: it is a CLI that rewrites `package.json` files on disk. Both are fetched by the daily npm verification job.

## Dependency groups — `.dep-groups.yaml`

`dependency-grouper` has no demo tab: it is a CLI that rewrites `package.json` files on disk, and a
browser tab cannot honestly host that. Its demonstration is that **the playground's own dependency
blocks are generated by it**. That is the card.

`playground/.dep-groups.yaml` sorts all 31 dependencies into four named sets, and
`package.json` names them:

```jsonc
"depGroups": ["portfolio-packages", "vue-runtime", "vue-app-tooling", "live-editor"]
```

| Group | Holds |
|---|---|
| `portfolio-packages` | the 11 published `@ozjsey/*` packages the demo cards import |
| `vue-runtime` | `vue` |
| `vue-app-tooling` | `vite`, `typescript`, `vue-tsc`, `@vitejs/plugin-vue`, `@types/node` |
| `live-editor` | the CodeMirror + Lezer stack and `sucrase`, which power **Edit code** |

Every dependency belongs to exactly one group, which is what keeps the tool's auto-managed
`standalone` bucket empty — an entry appearing there means something was added to `package.json`
without being classified.

**Adding a dependency.** Put it in the right group in `.dep-groups.yaml`, then `pnpm deps` (or just
`pnpm install` — see the hook below) writes it into `package.json`, alphabetised.

**Tailwind: allowed, and declined (DOCS-6, 2026-09-17).** The owner lifted the zero-dependency rule
for the styling pass — *"You can use tailwind too"* — and it was not taken up. One reason decides
it: **this app compiles `.vue` source the user types in the browser.** Tailwind generates its CSS by
scanning source files at build time, and code that does not exist until someone edits a card in the
live editor cannot be scanned. A demo where `class="p-4"` silently does nothing is exactly the class
of quiet failure `src/libraries.ts` and `scripts/` exist to prevent. Behind that: every demo SFC and
every harness script keys on the hand-written `.pg-*` and `.demo__*` classes, so adopting it means
rewriting them or running both systems. The work DOCS-6 actually needed was a spacing scale and a
reading measure — about forty lines in `src/styles.css`. The permission stands for a future pass
that genuinely wants it; this was not that pass.

**Changing a version.** Edit `package.json`, not the group file. `generate` syncs
`package.json` → config *before* it merges config → `package.json`, so a version typed into
`.dep-groups.yaml` is overwritten by the manifest before it is ever applied. The group file owns
*membership*; `package.json` owns *versions*. This is a property of the tool, pinned by its
characterisation suite, not a local convention.

**Comments in `.dep-groups.yaml` are not durable.** The writer re-emits the file from the parsed
object, so the annotations currently in it survive only until the tool next has a reason to rewrite
it. Keep anything load-bearing here in the README instead.

**The `preinstall` hook.** `generate` injects one into every package it manages and offers no way
to opt out. Ours is guarded:

```json
"preinstall": "dependency-grouper generate || exit 0"
```

The `|| exit 0` matters. On a fresh clone the CLI is not installed yet — `preinstall` runs *before*
dependencies do — and the unguarded form the tool writes by default fails the install with code
127. The tool leaves any `preinstall` that already contains the string `dependency-grouper` alone,
which is the only lever available. **Do not drop the `|| exit 0`** — nothing restores it, and the
tool will happily leave the unguarded form in place forever once it is there.

## What is in it

| Tab | Demos | Covers |
|---|---|---|
| `bigdecimal-string` | 11 | **a live REPL contrasting IEEE-754 with BigInt**, the 0.1 + 0.2 family, where scientific notation actually starts, precision past 2^53, the whole formatting surface against `Intl`, all seven `RoundingMode` values, chaining + immutability, comparisons + `compareTo` sorting, the checkout/tax/cart recipes, statics + utilities, parsing — **and the two README claims the live values contradict, flagged on the cards** |
| `v-copy` | 17 | bare/string/history/controller bindings, `.rich` + argument labels, feedback config, callbacks + `copy-result`, the `.once`/`.trim`/`.prevent`/`.stop` modifiers, disabled + custom triggers, a11y, config-form `sink`/`max`/`key`, multi-select rows → one copied context, **`dedupe` + the clipboard-history picker (uses `v-teleport-to`)**, **copying the user's own selection** and scoping it with `within` |
| `v-dropzone` | 13 | drop, validation + reject reasons, click-to-pick, paste, URL upload with real progress + `timeout`/`withCredentials`/`parseResponse`, function upload, `DropzoneApi`, `autoUpload` queue, CSS-only progress, state machine, `enabled` + `v-for` isolation, folder drop |
| `v-fit-children` | 9 | +N badge, `data` → `hiddenData`/`hiddenIndices`, pinned children, `gap` + separate width container, inline badge, dynamic children, `data-fit-children-state` CSS hook |
| `v-keyboard-navigation` | 13 | toolbar/tablist/menu/listbox/radiogroup patterns, **the scroll wedge (200 rows in a 200px box, with the scrollTop trace)**, typeahead, orientation + wrap + RTL, the one-tabbable invariant under mutation, `aria-activedescendant`, a real PageUp/PageDown, the api, events + state attributes, and a manual screen-reader walkthrough |
| `v-observe` | 17 | all five intersect features, all six resize features, all six mutate features, `gateOnIntersect`, and all three modes on one element |
| `v-scroll-into-view` | 16 | edge detection, `v-for`, **every container form plus the mount-time ref trap**, offsets on both axes, `always`, alignment matrix on both axes, composable, state attribute, malformed-input resilience, **the 192-geometry vertical parity sweep and the 36-row direction sweep** |
| `v-select-text` | 16 | **static text: whole element, `match` by string/RegExp, ranges across nested markup**, `whitespace` collapse vs preserve, `trigger: 'click'` / `'always'` / edge (+ the deprecated `condition` alias), inputs + textareas + contenteditable, `useSelectText`, the event, text-less hosts + the `user-select: none` diagnostic |
| `v-teleport-to` | 12 | placement + flip, every sizing knob, boundary + all three `scrollContainer` forms, overflow modes, arrow vars, cross-axis + offsets, autoUpdate, virtual reference, events + state, composable, `strategy: 'absolute'` |
| `vue-write-behind` | 11 | **the cell does not jump — a slow server that echoes UPPERCASED, checked live against what was typed**, coalescing counters, failure + backoff + newest-value retry, `retry: false`, the four store fields, batch vs per-key `allSettled`, `discard()`, `interval` vs `debounce`, `keys`, `equals` + `set()`, `flush()` + the tab-hide hook |

Not covered, deliberately: `dependency-grouper` (a CLI that rewrites `package.json` files on
disk), `vue-provide-seeker` (VS Code extension), `inhouse-agent` (training harness) — none of them
render. `v-trap-focus` was cancelled 2026-08-09 (archived to `../_archive/`) — the focus-trap niche
on npm is already well served.

`bigdecimal-string` was on that list as "pure arithmetic" until 2026-09-13. It is not exempt: a card
showing the exact decimal string beside the IEEE-754 answer is the fastest way to understand the
whole package, and building the tab immediately turned up three README sentences about JavaScript
that were false. Computing the left-hand column instead of quoting it is the entire point of that
tab.

## Editing a demo in the browser

Press **Edit code** on any card. The editor holds the real `.vue` file; typing recompiles it after
~350 ms through `@vue/compiler-sfc` running in the page, so `<script setup>`, `<style scoped>` and
`import { vCopy } from '@ozjsey/v-copy'` all behave exactly as they would in a normal app.

- A **failed compile keeps the last working version on stage** and shows the error — the card never
  goes blank.
- A **runtime throw is caught per card**, so one broken demo cannot take the page down. Press
  **Re-run** after fixing.
- Edits are kept in `localStorage` and survive a reload. **Reset** restores the file on disk; the
  header offers a bulk reset. A card with local edits is marked `edited`, and its entry in the
  right-hand index gets a dot.
- **Re-run** remounts a demo without changing anything — the fastest way to re-watch a mount-time
  effect (`v-select-text` selecting on mount).
- Editing the `.vue` file **on disk** hot-reloads the card too, unless you have unsaved browser
  edits for it, in which case yours win until you Reset.
- `?editors=open` in the URL mounts every card with its editor already open — that is what the
  smoke test's second pass uses.

## CI and GitHub Pages

The `Test npm projects` workflow runs three times daily at 00:00, 08:00, and 16:00 UTC. It installs
each related project, runs `npm audit`, and executes its tests. The Pages workflow builds this
playground on pushes to `main` and publishes `dist/` to GitHub Pages.

## Adding an interaction spec

`scripts/interactions/<library-id>.mjs` default-exports:

```js
export default {
  library: 'v-dropzone',        // tab id = manifest `id` = the folder under src/demos/
  prelude,                      // optional: page-side helpers, installed after every load
  checks,                       // [{ demo, name, fn }] — fn runs IN the browser, returns { pass, detail }
  nativeChecks,                 // optional: [{ demo, name, run(ctx) }] for things a synthetic event cannot do
  cleanup,                      // optional: tear down fixtures
}
```

Each check gets a freshly loaded page, so no card inherits another's state. `checks[].fn` is
stringified and evaluated in the browser — it may only use the runner's `__pg` helpers, the spec's
own prelude, and plain DOM APIs. `nativeChecks[].run` receives `{ page, cdp, sessionId }` and is the
escape hatch for anything that needs Chrome's own input pipeline: `v-dropzone`'s folder walk uses it
to drag a real directory, because a synthetic `DataTransfer` has no filesystem behind it and
`webkitGetAsEntry()` answers `null` for every item on one.

> **Find elements with `__pg.stage(file)`, never `__pg.sec(file)`.** `sec` is the whole
> `<section class="demo">`, and `DemoCard` puts its own chrome — the title, the blurb, the tag chips
> and the Re-run / Reset / Copy / Edit code buttons — in `.demo__head`, *before* `.demo__stage`. A
> section-wide `querySelector('button' | 'p' | 'span')` reaches the card instead of the demo, and the
> check then passes for the wrong reason: `__pg.button(file, 'Copy')` returns the copy-the-source
> button, and `sec(file).querySelector('p')` returns the blurb. `stage()` is the demo's own DOM;
> `sec()` stays available for the rare assertion that is genuinely *about* the card.

> **A check that fails while the page reloaded under it is retried, not recorded.** Vite full-reloads
> whenever an aliased sibling source changes, which — with several agents editing siblings at once —
> happens during most runs. The runner stamps the document after installing the preludes and, *when a
> check does not pass*, asks whether that stamp survived; if it did not, the page is re-mounted and
> the check driven again, up to three times, before it is reported as a failure naming the reloads.
> Only failures are questioned this way: a check that navigates on purpose (v-observe's `roprobe`
> card) must keep its pass. Without this, a reload landing between the prelude and the assertion
> produced `ReferenceError: __obs is not defined` — true, useless, and indistinguishable from a spec
> bug. The footer also prints a warning when the page navigated far more often than once per check,
> because then the results above it are measurements of a moving target.

Every run ends with a **coverage summary counted against `src/demos/*/manifest.ts`**, not against
the specs that happen to exist — otherwise the run picks its own denominator and `74/74 passed`
reads as "verified" while five libraries have never been driven. A library with no spec prints as
`UNCOVERED`; the command exits non-zero when a check fails, or when coverage drops below
`scripts/interactions-coverage.json`. Add a spec, then raise those numbers in the same commit.

## Adding a demo

1. Drop `NN-name.vue` into `src/demos/<library>/`.
2. Add one entry to that folder's `manifest.ts`.

That is all — the registry globs both. A manifest entry with no file, or a file in no manifest, is
reported as a banner at the top of the tab rather than silently ignored.

Adding a whole library is the same shape: publish the package, add it to `package.json` (and to
`.dep-groups.yaml`), create `src/demos/<package>/manifest.ts` with `id` = the folder name and `pkg`
= the npm specifier, add it to `LIBRARIES` in `vite.config.ts`, to `PACKAGES` in
`scripts/typecheck-libs.mjs`, and to `LIBRARY_SPECS` in `src/libraries.ts`. Give that entry an
`install` **only if it exports a directive** — a composable (`vue-write-behind`) or a plain class
(`bigdecimal-string`) has nothing to register (`directiveName: null`, `install: null`), and a fake
entry would have to be special-cased inside the guard that exists to catch a build which failed to
export one.

`src/registry.ts` paints an **error** banner — one that fails `smoke` — if a manifest's `id` is not
its folder name. That pairing is load-bearing in three places at once: the URL hash that published
READMEs link to (`tickets/_STANDARDS.md` fixes the shape as `…/#<folder>`), the orphaned-file
banner, and the coverage denominator in `scripts/interactions.mjs`. When it drifted, all three broke
quietly — every card on the page was reported as "not listed in any manifest" while `smoke` stayed
green, and `pnpm interactions` refused to start at all.

## House rules for demo files

- **One demo, one feature.** The blurb says what to *do* to see it.
- **Real usage only.** No playground-specific helpers or props are injected — a demo should be
  copy-pasteable into an app. Keep local state local and render it in the demo's own markup.
- **No TypeScript syntax inside template expressions.** The in-browser compiler parses the generated
  render function as plain JavaScript, so `dz!.cancel()` or `(e: UploadError) => …` in an attribute
  fails to compile. Put typed handlers in `<script setup>` and reference them by name. This is the
  one difference from a normal Vite app, and `pnpm typecheck` will not catch it — `pnpm smoke`
  will.
- **Use the `.pg-*` utilities** (`pg-row`, `pg-col`, `pg-btn`, `pg-btn--primary`, `pg-input`,
  `pg-select`, `pg-label`, `pg-muted`, `pg-box`, `pg-chip`, `pg-log`, `pg-scroller`, `pg-kv`) for
  scaffolding. A demo's own `<style scoped>` should only contain CSS that is *part of what it
  demonstrates* — the `[data-dropzone="active"]` rules, the `--teleport-arrow-x` positioning.
- **Clean up timers.** Demos remount on every edit; an uncancelled `setInterval` leaks per keystroke.
- **Scroll inside the demo, not the page.** Use `.pg-scroller` or an explicit `container` / `root` so
  results are reproducible wherever the page happens to be scrolled.

## Upload endpoints

The dev server serves three routes for the `v-dropzone` upload demos (see `uploadMockPlugin` in
`vite.config.ts`):

| Route | Behaviour |
|---|---|
| `POST /api/upload` | 200 + JSON `{ ok, bytes, id, at }` after ~700 ms |
| `POST /api/upload-slow` | same, after ~4 s — long enough to exercise `cancel()` and `timeout` |
| `POST /api/upload-fail` | 500 + JSON error after ~400 ms — exercises the sticky `error` state and `retry()` |

XHR upload progress is reported by the browser as the body is sent, so drop a file of a few MB if
you want to watch the bar move rather than jump.

## How it works

```
src/
├── main.ts            boot assertions, then createApp + installLibraries
├── libraries.ts       one dynamic import() per package, the module map, and the failure list
├── registry.ts        globs manifests + raw .vue sources into the tab model
├── sfc-runtime.ts     source text → mountable component (thin entry)
├── sfc/versions.ts    the compiler-vs-runtime assertion, and why it exists
├── sfc/compile.ts     parse → compileScript → strip TS → compileTemplate → compileStyle
├── sfc/esm-runtime.ts import rewriting + evaluation, against the app's own modules
├── storage.ts         localStorage for in-browser edits
├── components/        App shell, DemoCard (compile + error boundary), CodeEditor (CodeMirror 6)
└── demos/<library>/   manifest.ts + the .vue files
```

Four details matter:

- **The compiler is the runtime's own.** Demos are compiled *in the page*, so the version of
  `@vue/compiler-sfc` doing that has to be the version of `vue` mounting the result. Until
  2026-09-06 it was not: `vue3-sfc-loader` bundles compiler 3.4.15 and the app ran 3.5.41, which
  compiles a directive inside a `v-for` to a non-block vnode that is never re-patched — so the
  directive never received `updated` and no option change ever reached it (PG-14). The playground
  now compiles with `vue/compiler-sfc`, which npm pins to the exact version of `vue`, plus
  `sucrase` for the TypeScript strip that esbuild does in a normal Vite app. `src/main.ts` asserts
  the two versions match and refuses to boot otherwise; `smoke` and `interactions` assert it from
  outside the page. Read `src/sfc/versions.ts` before changing any of this.

- **One Vue instance.** `resolve.dedupe` plus an exact `^vue$` alias in `vite.config.ts` force every
  import — playground, npm packages, and dynamically compiled demos — onto the same copy.
  Without that, reactivity silently breaks across the boundary.
- **One CodeMirror instance.** A second copy of `@codemirror/state` breaks the `instanceof` checks
  inside the extension resolver ("Unrecognized extension value in extension set"). The whole
  CodeMirror + Lezer family is pinned as direct deps, listed in `resolve.dedupe`, and prebundled in
  a single `optimizeDeps.include` pass so a late-discovered entry can never pull in its own copy.
  The smoke test's `?editors=open` pass guards this permanently.
- **Global registration, and it must work.** `installLibraries()` uses each package's documented
  plugin (`VCopyPlugin`, `DropzonePlugin`, `ObservePlugin`, `ScrollIntoViewPlugin`,
  `SelectTextPlugin`, `TeleportToPlugin`, `KeyboardNavigationPlugin`; `v-fit-children` ships none by
  design), so the playground is also a check that the install path in each README works. A package
  that loads without a usable directive — or without the plugin it is supposed to export — is a
  **failure**, not a fallback. It used to register the directive directly and boot anyway, which
  meant a broken package could render all 97 cards and report the smoke test green.
- **One `import()` per library, never one barrel (PG-22).** Those imports used to be ten static
  `import * as … from '@ozjsey/…'` at module scope, so a single sibling that did not compile took
  the whole module graph down: every tab blank, and `smoke` saying only "No library tabs rendered".
  Each library now loads inside its own `try`, and a failure is recorded in `libraryFailures`,
  painted on every tab, stamped on `<html data-playground-library-failures>`, published on
  `window.__PLAYGROUND_LIBRARY_FAILURES__`, and failed by all three runners **by name**. The blast
  radius changed; the loudness did not. A compiler/runtime mismatch is still fatal for the whole
  page, because nothing verified after it would count.

## Relationship to the per-package `playground.html` files

Several packages still ship a standalone `playground.html` that some `playground.smoke.test.ts`
suites mirror. Those stay: they are per-package artifacts, and they prove the library works with
nothing but an import map. This project is the cross-package one — broader coverage and live editing
against the published consumer artifacts.
