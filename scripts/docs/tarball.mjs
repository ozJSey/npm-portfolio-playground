/**
 * The README this gate checked has to be the README npm ships.
 *
 * `tickets/DOCS-3`, item 5: *"For published packages the README is the npm
 * page. If `files` excludes it, or the tarball's copy differs from the repo's,
 * that is a finding."*
 *
 * npm force-includes `README*` regardless of `files`, but it does **not**
 * override `.npmignore`, and two packages here have one. So this is measured,
 * not reasoned about: `npm pack` really packs, the tarball is really read, and
 * the bytes are really compared. `--dry-run` would answer the `files` question
 * and not the bytes question, and the bytes question is the one that catches a
 * README edited after the last publish.
 *
 * No `prepack` / `prepare` script exists in any of these packages (they build
 * from `prepublishOnly`, which `npm pack` does not run), so packing is a read
 * of the working tree and has no side effects beyond the temp tarball.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const finding = (severity, code, message) => ({ severity, code, message })

/**
 * Packs one package and compares the tarball's README with the one on disk.
 *
 * @returns `{ findings, entries }` — `entries` is the packed file list, so the
 *          caller can say what else did or did not ship.
 */
export function checkTarball(pkgDir, readmePath) {
  const out = mkdtempSync(join(tmpdir(), 'docs-pack-'))
  try {
    const stdout = execFileSync(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', out],
      { cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const [result] = JSON.parse(stdout)
    const entries = (result.files ?? []).map((f) => f.path)
    const findings = []

    const readmeEntry = entries.find((path) => /^README(\.[^/]+)?$/i.test(path))
    if (!readmeEntry) {
      findings.push(
        finding(
          'error',
          'README_NOT_PACKED',
          `the tarball (${result.filename}) contains no README — the npm page for this package ` +
            `would be empty. Files packed: ${entries.join(', ') || '(none)'}`,
        ),
      )
      return { findings, entries }
    }

    const packed = execFileSync('tar', ['-xzOf', join(out, result.filename), `package/${readmeEntry}`], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    const onDisk = readFileSync(readmePath, 'utf8')
    if (packed !== onDisk) {
      findings.push(
        finding(
          'error',
          'README_DIFFERS',
          `the tarball's ${readmeEntry} is not the file this run checked ` +
            `(${packed.length} bytes packed vs ${onDisk.length} on disk).`,
        ),
      )
    }

    return { findings, entries, readmeEntry, tarball: result.filename }
  } catch (err) {
    return {
      findings: [
        finding('warn', 'PACK_FAILED', `npm pack failed: ${String(err.message).split('\n')[0]}`),
      ],
      entries: [],
    }
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

/**
 * Relative links a README makes to files beside it, checked against what
 * actually shipped.
 *
 * `./ARCHITECTURE.md` resolves on a developer's disk and 404s on npm whenever
 * `files` does not list it — which is the majority case in this repo. Reported,
 * not failed: the npm page renders the link as a relative URL on the npm
 * website, and whether that is a defect or a deliberate "read it on GitHub"
 * depends on the package. Naming it is the job.
 */
export function unshippedLinks(readme, entries) {
  const shipped = new Set(entries)
  const missing = new Map()
  for (const link of readme.links) {
    if (link.malformed) continue
    if (/^[a-z][\w+.-]*:/i.test(link.href) || link.href.startsWith('#')) continue
    const path = link.href.split('#')[0].replace(/^\.\//, '')
    // A link that climbs out of the package is a repo link, not a tarball one.
    if (!path || path.startsWith('../') || path.startsWith('/')) continue
    if (shipped.has(path)) continue
    if (!missing.has(path)) missing.set(path, link.line)
  }
  return [...missing].map(([path, line]) =>
    finding('warn', 'LINK_NOT_PACKED', `\`${path}\` (line ${line}) is linked but not in the tarball.`),
  )
}
