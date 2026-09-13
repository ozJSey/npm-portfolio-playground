# Playground

One page, one tab per v-\* library, every feature demoed — and every demo editable in the browser
while it runs.

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
| `pnpm typecheck` | `vue-tsc` over the playground **and** every demo SFC |
| `pnpm build` | Static production build into `dist/` |

> **`smoke` green is not the same as the demo being correct.** Smoke proves the card compiled and
> mounted; it cannot tell a live button from a dead one. Two `v-dropzone` cards once passed smoke
> while every button on them was a silent no-op (a `ref` written inside a template expression is
> unwrapped to `undefined`). `pnpm interactions` is what catches that class of failure — run it
> before calling a card done. Layout-shaped libraries additionally need `pnpm geometry` plus a look
> at a screenshot.

## What is in it

| Tab | Demos | Covers |
|---|---|---|
| `v-copy` | 13 | bare/string/history/controller bindings, `.rich` + argument labels, feedback config, callbacks + `copy-result`, all four modifiers, disabled + custom triggers, a11y, config-form `sink`/`max`/`key`, multi-select rows → one copied context, **`dedupe` + the clipboard-history picker (uses `v-teleport-to`)** |
| `v-dropzone` | 12 | drop, validation + reject reasons, click-to-pick, paste, URL upload with real progress + `timeout`/`withCredentials`/`parseResponse`, function upload, `DropzoneApi`, `autoUpload` queue, CSS-only progress, state machine, `enabled` + `v-for` isolation, folder drop |
| `v-fit-children` | 9 | +N badge, `data` → `hiddenData`/`hiddenIndices`, pinned children, `gap` + separate width container, inline badge, dynamic children, `data-fit-children-state` CSS hook |
| `v-keyboard-navigation` | 13 | toolbar/tablist/menu/listbox/radiogroup patterns, **the scroll wedge (200 rows in a 200px box, with the scrollTop trace)**, typeahead, orientation + wrap + RTL, the one-tabbable invariant under mutation, `aria-activedescendant`, a real PageUp/PageDown, the api, events + state attributes, and a manual screen-reader walkthrough |
| `v-observe` | 17 | all five intersect features, all six resize features, all six mutate features, `gateOnIntersect`, and all three modes on one element |
| `v-scroll-into-view` | 9 | edge detection, `v-for`, container forms, offsets on both axes, `always`, alignment matrix, composable, state attribute, malformed-input resilience |
| `v-select-text` | 12 | **static text: whole element, `match` by string/RegExp, ranges across nested markup**, `whitespace` collapse vs preserve, `trigger: 'click'` / `'always'` / edge (+ the deprecated `condition` alias), inputs + textareas + contenteditable, `useSelectText`, the event, text-less hosts + the `user-select: none` diagnostic |
| `v-teleport-to` | 12 | placement + flip, every sizing knob, boundary + all three `scrollContainer` forms, overflow modes, arrow vars, cross-axis + offsets, autoUpdate, virtual reference, events + state, composable, `strategy: 'absolute'` |

Not covered, deliberately: `bigdecimal-string` (pure arithmetic), `dependency-grouper` (CLI over
the filesystem), `vue-provide-seeker` (VS Code extension), `inhouse-agent` (training harness) —
none of them render. `v-trap-focus` was cancelled 2026-08-09 (archived to `../_archive/`) — the
focus-trap niche on npm is already well served.

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
  library: 'v-dropzone',       // tab id — also the manifest folder name
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

Adding a whole library is the same shape: publish the package, add it to `package.json`, create
`src/demos/<package>/manifest.ts`, and add it to `LIBRARIES` in `vite.config.ts`,
`LIBRARY_MODULES` + the `INSTALLS` list in `src/libraries.ts`.

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
├── libraries.ts       the alias → module map, shared by the app and the SFC compiler
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
  **boot failure**, not a fallback. It used to register the directive directly and boot anyway,
  which meant a broken package could render all 97 cards and report the smoke test green.

## Relationship to the per-package `playground.html` files

Several packages still ship a standalone `playground.html` that some `playground.smoke.test.ts`
suites mirror. Those stay: they are per-package artifacts, and they prove the library works with
nothing but an import map. This project is the cross-package one — broader coverage and live editing
against the published consumer artifacts.
