/**
 * Demo registry — assembled at build time, zero manual wiring.
 *
 * Adding a library:  create `src/demos/<id>/manifest.ts` (default-exporting a
 *                    `LibraryManifest`) and drop `.vue` files beside it.
 * Adding a demo:     create the `.vue` file, add one entry to that manifest.
 *
 * Both globs are eager so a tab switch never waits on a network round-trip.
 */
import { cardSlug } from './card-link'

export interface DemoMeta {
  /** File name inside the library folder, e.g. `01-bare.vue`. */
  file: string
  /** Short title shown on the demo card. */
  title: string
  /** One line: which feature this pins, and what to *do* to see it. */
  blurb: string
  /** API surface exercised — rendered as chips, and searchable. */
  tags: string[]
  /**
   * Other packages this card also uses. A cross-library card lives in the tab
   * of the library whose feature it proves; everything else it touches is
   * listed here — rendered as a distinct chip, searchable, and used by the
   * editor hint to name every path an import can resolve to.
   */
  uses?: string[]
}

export interface LibraryManifest {
  /**
   * The folder name under `src/demos/` — and therefore the URL hash, the tab
   * label, and the name of the interactions spec that drives this tab.
   *
   * It is deliberately NOT the npm specifier. `tickets/_STANDARDS.md` fixes the
   * canonical README link as
   * `https://ozjsey.github.io/npm-portfolio-playground/#<library-id>`, and every
   * published README already points at a bare folder name. Putting `@ozjsey/…`
   * here once broke three things at once, silently: `orphanedDemoFiles` matched
   * nothing so every card on the page was reported as unlisted, the hash stopped
   * resolving, and `scripts/interactions.mjs` refused to start. `pkg` is where
   * the npm name goes.
   */
  id: string
  /**
   * The npm specifier a demo `import`s — `@ozjsey/v-copy`. Shown in the tab
   * header, and the prefix `src/libraries.ts` and `vite.config.ts` key on.
   */
  pkg: string
  /** One-sentence description of the restriction the library removes. */
  tagline: string
  /**
   * There is deliberately no `status` field (DOCS-6).
   *
   * There was one, printed as a pill under the tagline, carrying release
   * bookkeeping mirrored by hand from the root `TASKS.md`: which version is on
   * npm, when somebody last checked the registry, what is built locally and not
   * published. Measured against `npm view <pkg> version` on 2026-09-17, nine of
   * the ten disagreed with the registry, and one advertised `v2.1.0` of a
   * package whose registry has only 1.0.0 and 1.0.1. This page is read by
   * strangers, for whom "2.3.1 built locally, not yet published" advertises
   * something they cannot install — and the README rendered beside it already
   * carries npm version badges that update themselves. A version number this
   * app has to keep true is a maintenance burden that has already failed once;
   * do not add it back.
   */
  /** Anything worth knowing before poking at the demos. */
  notes?: string[]
  demos: DemoMeta[]
}

export interface Demo extends DemoMeta {
  /** `<library id>/<file>` — stable identity for storage + style scoping. */
  id: string
  /**
   * The published deep-link segment — `02-placement-flip.vue` → `placement-flip`.
   * See `card-link.ts` for why it is the slug and not the filename.
   */
  slug: string
  /** Raw `.vue` source as it exists on disk. */
  source: string
}

export interface Library extends Omit<LibraryManifest, 'demos'> {
  demos: Demo[]
}

const manifests = import.meta.glob<{ default: LibraryManifest }>('./demos/*/manifest.ts', {
  eager: true,
})

const sources = import.meta.glob<string>('./demos/*/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Manifest entries with no file on disk — surfaced in the UI, never fatal. */
export const missingDemoFiles: string[] = []

/**
 * Manifests whose `id` is not their folder name. Rendered as an ERROR banner,
 * not a warning, so `smoke` fails on it: an id that disagrees with the folder
 * takes the hash, the orphan check and the interactions runner down with it,
 * and all three failures are quiet.
 */
export const manifestProblems: string[] = []

function buildLibrary(path: string, manifest: LibraryManifest): Library {
  const dir = path.slice(0, path.lastIndexOf('/'))
  const folder = dir.slice(dir.lastIndexOf('/') + 1)
  if (manifest.id !== folder) {
    manifestProblems.push(
      `src/demos/${folder}/manifest.ts declares id '${manifest.id}' — it must be '${folder}', ` +
        `the folder name. The npm specifier belongs in \`pkg\`.`,
    )
  }
  const demos: Demo[] = []
  /** slug → the file that claimed it, for the collision check below. */
  const claimed = new Map<string, string>()
  for (const demo of manifest.demos) {
    const source = sources[`${dir}/${demo.file}`]
    if (source === undefined) {
      missingDemoFiles.push(`${manifest.id}/${demo.file}`)
      continue
    }
    const slug = cardSlug(demo.file)
    /**
     * DOCS-4. The slug is a published URL segment — it goes inside tarballs a
     * reader cannot be asked to update. Two files that slug to the same thing
     * (`02-flip.vue` and `12-flip.vue`) would make one of those URLs resolve to
     * whichever card the manifest happened to list first, and nothing would say
     * so. Reported as a *problem*, which renders as an error banner and fails
     * `pnpm smoke`, for the same reason an id/folder mismatch is.
     */
    const other = claimed.get(slug)
    if (other !== undefined) {
      manifestProblems.push(
        `src/demos/${folder}/${demo.file} and ${other} both deep-link as ` +
          `#${manifest.id}/${slug}. The card slug is the filename without its ordering prefix ` +
          `and extension (src/card-link.ts), it ships inside published READMEs, and it must be ` +
          `unique within a tab — rename one of the two files.`,
      )
    }
    claimed.set(slug, demo.file)
    demos.push({ ...demo, id: `${manifest.id}/${demo.file}`, slug, source })
  }
  return { ...manifest, demos }
}

export const libraries: Library[] = Object.entries(manifests)
  .map(([path, mod]) => buildLibrary(path, mod.default))
  .sort((a, b) => a.id.localeCompare(b.id))

export const demoCount = libraries.reduce((n, lib) => n + lib.demos.length, 0)

/** Files present on disk but missing from a manifest — surfaced in the UI. */
export const orphanedDemoFiles = Object.keys(sources).filter((path) => {
  const [, , libId, file] = path.split('/')
  return !libraries.some((lib) => lib.id === libId && lib.demos.some((d) => d.file === file))
})

/**
 * The deep-link index: every tab, and every card id a published README is
 * allowed to point at.
 *
 * Published on `window.__PLAYGROUND_CARDS__` by `src/main.ts` so the harness
 * reads the card list **out of the running app** instead of re-deriving it from
 * the filenames. DOCS-4 links ship in tarballs, so "is this a real card?" has
 * to be answered by the same code that resolves the hash — a second
 * implementation in a `.mjs` script is exactly the drift that would let a
 * README link pass the gate and 404 the reader.
 */
export interface CardIndexEntry {
  /** The published segment — what goes after `#<library-id>/`. */
  slug: string
  /** The file on disk, still accepted as a segment for links written earlier. */
  file: string
  title: string
}

export const cardIndex: Record<string, CardIndexEntry[]> = Object.fromEntries(
  libraries.map((lib) => [
    lib.id,
    lib.demos.map(({ slug, file, title }) => ({ slug, file, title })),
  ]),
)
