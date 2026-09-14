/**
 * The Documentation view's content, which is each package's own `README.md`.
 *
 * `tickets/DOCS-1`: *"Docs are rendered from the package README, never
 * hand-authored twice — this repo has repeated, documented README-vs-source
 * drift."* So there is no second copy to maintain and nothing here to keep in
 * sync; the file that ships in the npm tarball is the file on screen.
 *
 * The glob reaches out of the playground into the sibling packages, the same
 * way `vite.config.ts` aliases their sources. It is eager and raw, so the
 * READMEs are inlined as strings at build time (~290 KB across the whole
 * repository, and only the library folders are ever looked up).
 */
const readmes = import.meta.glob<string>('../../*/README.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** folder name → raw README text. `'v-copy'` → the text of `../v-copy/README.md`. */
const folderOf = (path: string): string => {
  const parts = path.split('/')
  return parts[parts.length - 2]
}

const byFolder = new Map<string, string>(
  Object.entries(readmes).map(([path, text]) => [folderOf(path), text]),
)

/**
 * The README for a library tab, or `null` when that package has none.
 *
 * `null` is rendered as a stated reason, never as a missing button: a
 * documentation view that silently is not there looks identical to one that
 * failed to load.
 */
export function readmeFor(libraryId: string): string | null {
  return byFolder.get(libraryId) ?? null
}

/** Where the rendered file lives, for the "source" line under the heading. */
export const readmePath = (libraryId: string) => `../${libraryId}/README.md`
