/**
 * Demo registry — assembled at build time, zero manual wiring.
 *
 * Adding a library:  create `src/demos/<id>/manifest.ts` (default-exporting a
 *                    `LibraryManifest`) and drop `.vue` files beside it.
 * Adding a demo:     create the `.vue` file, add one entry to that manifest.
 *
 * Both globs are eager so a tab switch never waits on a network round-trip.
 */

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
  /** Package name — also the URL hash and the folder name. */
  id: string
  /** One-sentence description of the restriction the library removes. */
  tagline: string
  /** Publish state, mirrored from the root TASKS.md snapshot. */
  status: string
  /** Anything worth knowing before poking at the demos. */
  notes?: string[]
  demos: DemoMeta[]
}

export interface Demo extends DemoMeta {
  /** `<library id>/<file>` — stable identity for storage + style scoping. */
  id: string
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

function buildLibrary(path: string, manifest: LibraryManifest): Library {
  const dir = path.slice(0, path.lastIndexOf('/'))
  const demos: Demo[] = []
  for (const demo of manifest.demos) {
    const source = sources[`${dir}/${demo.file}`]
    if (source === undefined) {
      missingDemoFiles.push(`${manifest.id}/${demo.file}`)
      continue
    }
    demos.push({ ...demo, id: `${manifest.id}/${demo.file}`, source })
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
