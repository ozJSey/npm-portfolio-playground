/**
 * Reads `src/demos/*&#47;manifest.ts` from disk — the denominator every harness
 * script grades itself against.
 *
 * It exists because a runner that counts only what it managed to render cannot
 * tell "everything rendered" from "nothing rendered". `smoke` reported
 * `0 cards, no error` and `interactions` once printed "74/74 passed" while five
 * libraries had never been driven at all. Both numbers were true and both were
 * meaningless, because the script had picked its own denominator.
 *
 * `src/registry.ts` builds the same set with `import.meta.glob`, which Node
 * cannot do — so parse the two fields that matter, and throw loudly on anything
 * that does not parse rather than quietly returning a shorter list.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Strip comments so a commented-out `file:` entry cannot inflate the count. */
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * @returns {{
 *   manifests: { id: string, demos: string[], missing: string[] }[],
 *   manifestlessDirs: string[],
 * }}
 *
 * `manifestlessDirs` are folders under `src/demos/` with no `manifest.ts`.
 * `src/registry.ts` globs `./demos/<dir>/manifest.ts`, so the app renders no tab
 * for these at all — they are a tab that has not been built yet, not a broken
 * one. Reported by the caller rather than thrown: exiting here made the whole
 * command unrunnable for every library the moment someone created an empty
 * folder.
 */
export function readManifests(demosDir) {
  const manifestlessDirs = []
  const dirs = readdirSync(demosDir)
    .filter((d) => statSync(join(demosDir, d)).isDirectory())
    .sort()
  if (!dirs.length) throw new Error(`No demo folders under ${demosDir}`)

  const withManifest = dirs.filter((dir) => {
    if (existsSync(join(demosDir, dir, 'manifest.ts'))) return true
    manifestlessDirs.push(dir)
    return false
  })
  if (!withManifest.length) throw new Error(`No manifest.ts under any folder in ${demosDir}`)

  const manifests = withManifest.map((dir) => {
    const path = join(demosDir, dir, 'manifest.ts')
    const src = decomment(readFileSync(path, 'utf8'))

    const id = src.match(/\bid:\s*'([^']+)'/)?.[1]
    if (!id) throw new Error(`Could not parse \`id\` out of ${dir}/manifest.ts`)
    if (id !== dir) throw new Error(`${dir}/manifest.ts declares id '${id}' — folder and id must match`)

    const demos = [...src.matchAll(/\bfile:\s*'([^']+\.vue)'/g)].map((m) => m[1])
    if (!demos.length) throw new Error(`No \`file:\` entries in ${dir}/manifest.ts`)

    // The app drops manifest entries with no file on disk (`missingDemoFiles`),
    // so those are not cards and must not sit in the denominator. `smoke` is
    // what fails on them; `interactions` only reports them.
    const missing = demos.filter((f) => !existsSync(join(demosDir, dir, f)))
    return { id, demos: demos.filter((f) => !missing.includes(f)), missing }
  })

  return { manifests, manifestlessDirs }
}
