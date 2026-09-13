import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const packages = [
  '@ozjsey/bigdecimal-string',
  '@ozjsey/dependency-grouper',
  '@ozjsey/v-copy',
  '@ozjsey/v-dropzone',
  '@ozjsey/v-fit-children',
  '@ozjsey/v-keyboard-navigation',
  '@ozjsey/v-observe',
  '@ozjsey/v-scroll-into-view',
  '@ozjsey/v-select-text',
  '@ozjsey/v-teleport-to',
]

const dir = await mkdtemp(join(tmpdir(), 'npm-portfolio-e2e-'))
try {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  for (const name of packages) {
    await exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `${name}@latest`], { cwd: dir })
    const { stdout } = await exec('npm', ['view', `${name}@latest`, 'name', 'version', '--json'], { cwd: dir })
    const metadata = JSON.parse(stdout)
    if (metadata.name !== name) throw new Error(`${name}: registry returned ${metadata.name}`)
    await exec(
      'node',
      ['--input-type=module', '-e', `const m = await import(${JSON.stringify(name)}); if (!Object.keys(m).length) throw new Error('no public exports')`],
      { cwd: dir },
    )
  }
  console.log(`Fetched and loaded ${packages.length} scoped packages from npm.`)
} finally {
  await rm(dir, { recursive: true, force: true })
}
