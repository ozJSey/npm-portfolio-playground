/**
 * The Documentation view's content, which is each package's own `README.md`.
 *
 * `tickets/DOCS-1`: *"Docs are rendered from the package README, never
 * hand-authored twice — this repo has repeated, documented README-vs-source
 * drift."* So there is no second copy to maintain and nothing here to keep in
 * sync; the file that ships in the npm tarball is the file on screen.
 *
 * ## DOCS-6: two sources, because this repo is deployed on its own
 *
 * There used to be one glob — `../../*&#47;README.md`, reaching out of the
 * playground into the sibling packages the way `vite.config.ts` aliases their
 * sources. It works locally and matched **nothing** on GitHub Pages: CI checks
 * out the playground repository alone, `../v-copy/` is not on that disk, and so
 * every one of the ten tabs rendered "does not exist, so there is nothing to
 * render" — which is what the owner found on the live site. The banner was
 * right about what it had; it was wrong about why, and it blamed the packages.
 *
 * npm packs `README.md` into every tarball, so the published file is already on
 * disk in CI as `node_modules/@ozjsey/<name>/README.md` — and it is *exactly
 * what npm shows*, which the header above says is the goal. So: prefer the
 * working tree, fall back to the installed package, per library rather than
 * all-or-nothing. Locally you edit a sibling README and the tab updates;
 * deployed, the tab shows what a reader would get from `npm install`.
 *
 * Both patterns are static string literals because Vite requires that — the
 * choice between them is made below, at runtime, over two eagerly-inlined maps.
 * `exhaustive` is what lets the second one see inside `node_modules` at all;
 * Vite excludes it from every glob by default.
 */
const workingTree = import.meta.glob<string>('../../*/README.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const installed = import.meta.glob<string>('../node_modules/@ozjsey/*/README.md', {
  query: '?raw',
  import: 'default',
  eager: true,
  exhaustive: true,
})

/**
 * Both maps are keyed by the folder the README sits in, and for both of them
 * that folder is the library id: the sibling directory is `v-copy/`, and the
 * installed package is `@ozjsey/v-copy`, whose unscoped half is the same word.
 * `vite.config.ts` LIBRARIES keys on the same agreement.
 *
 * pnpm makes `node_modules/@ozjsey/v-copy` a symlink into `.pnpm/`, so the path
 * Vite hands back may be the real one several directories deeper. The folder
 * immediately above the file is `v-copy` either way, which is why this reads
 * the tail of the path rather than trying to match the pattern.
 */
const folderOf = (path: string): string => {
  const parts = path.split('/')
  return parts[parts.length - 2]
}

const byFolder = (glob: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(glob).map(([path, text]) => [folderOf(path), text]))

const fromWorkingTree = byFolder(workingTree)
const fromInstalled = byFolder(installed)

/** Where a rendered README came from, named on screen so the next miss is diagnosable. */
export interface ReadmeSource {
  /** Raw markdown, exactly as the file has it. */
  text: string
  /** The file, as a path relative to `playground/`. */
  path: string
  /** `true` when this is the sibling working tree rather than the packed tarball. */
  local: boolean
}

const siblingPath = (libraryId: string) => `../${libraryId}/README.md`
const installedPath = (libraryId: string) => `node_modules/@ozjsey/${libraryId}/README.md`

/**
 * The README for a library tab, or `null` when neither source has one.
 *
 * `null` is rendered as a stated reason, never as a missing button: a
 * documentation view that silently is not there looks identical to one that
 * failed to load. The reason now names **both** places that were looked in,
 * because DOCS-6 was a banner that named one of them and blamed the package.
 */
export function readmeFor(libraryId: string): ReadmeSource | null {
  const local = fromWorkingTree.get(libraryId)
  if (local !== undefined) return { text: local, path: siblingPath(libraryId), local: true }

  const packed = fromInstalled.get(libraryId)
  if (packed !== undefined) return { text: packed, path: installedPath(libraryId), local: false }

  return null
}

/** The two paths `readmeFor` looked in, for the banner when it found neither. */
export const readmePathsTried = (libraryId: string): string[] => [
  siblingPath(libraryId),
  installedPath(libraryId),
]
