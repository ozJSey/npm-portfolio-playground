/**
 * What the documentation gate is the gate *for* — computed from disk, never a
 * list somebody remembered to update.
 *
 * Two callers: `scripts/docs.mjs`, which checks each of these, and the repo's
 * `scripts-status.mjs`, whose `docs view checked` column is the count of the
 * packages this file returns with a README. Sharing the enumeration is the
 * point: a column that says "12/12" while the runner knows about nine is the
 * same class of lie as a green smoke over a dead card.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Folders beside the packages that are not packages.
 *
 * `playground` is this app. `_archive` and `_to_delete` are, per `CLAUDE.md`,
 * cancelled work and orphaned `node_modules`. Everything else is included or
 * excluded by what its `package.json` says, below — there is no hand-kept list
 * of package names anywhere in this file.
 */
const NOT_A_PACKAGE = new Set(['playground', 'instructions', 'tickets', 'node_modules'])

/** Strip comments so a commented-out field cannot be read as a live one. */
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Library ids the playground actually renders a tab (and therefore a
 * Documentation view) for.
 *
 * Read the same way `scripts/interactions.mjs` reads them — `src/registry.ts`
 * builds this set with `import.meta.glob`, which Node cannot do. A folder under
 * `src/demos/` with no `manifest.ts` is not a tab: `src/demos/dependency-grouper`
 * is an empty directory, and nothing in the app resolves `#dependency-grouper`.
 */
export function libraryIds(playgroundDir) {
  const demosDir = join(playgroundDir, 'src/demos')
  return readdirSync(demosDir)
    .filter((dir) => statSync(join(demosDir, dir)).isDirectory())
    .filter((dir) => existsSync(join(demosDir, dir, 'manifest.ts')))
    .map((dir) => {
      const src = decomment(readFileSync(join(demosDir, dir, 'manifest.ts'), 'utf8'))
      const id = src.match(/\bid:\s*'([^']+)'/)?.[1]
      if (!id) throw new Error(`Could not parse \`id\` out of src/demos/${dir}/manifest.ts`)
      if (id !== dir) throw new Error(`src/demos/${dir}/manifest.ts declares id '${id}'`)
      return id
    })
    .sort()
}

/**
 * Every sibling package, in tab order then alphabetical.
 *
 * A folder counts as a package when it has a `package.json` that is not
 * `private` — which is exactly npm's own definition of "this is publishable",
 * and keeps `v-copy-test` (a private scratch fixture) and the playground itself
 * out without naming either.
 */
export function docsPackages(repoRoot, playgroundDir) {
  const ids = new Set(libraryIds(playgroundDir))

  return readdirSync(repoRoot)
    .filter((dir) => !dir.startsWith('.') && !dir.startsWith('_') && !NOT_A_PACKAGE.has(dir))
    .filter((dir) => statSync(join(repoRoot, dir)).isDirectory())
    .filter((dir) => existsSync(join(repoRoot, dir, 'package.json')))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'))
      const readme = join(repoRoot, dir, 'README.md')
      return {
        dir,
        name: manifest.name,
        private: manifest.private === true,
        files: manifest.files ?? null,
        npmignore: existsSync(join(repoRoot, dir, '.npmignore')),
        readmePath: existsSync(readme) ? readme : null,
        /** The playground tab — `null` for a package with no Documentation view. */
        libraryId: ids.has(dir) ? dir : null,
      }
    })
    .filter((pkg) => !pkg.private)
    .sort((a, b) => Number(!a.libraryId) - Number(!b.libraryId) || a.dir.localeCompare(b.dir))
}
