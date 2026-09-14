import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const packagePath = new URL('../package.json', import.meta.url)
const groupsPath = new URL('../.dep-groups.yaml', import.meta.url)
const packageJson = JSON.parse(await readFile(packagePath))
const dependencies = Object.keys(packageJson.dependencies)

for (const name of dependencies) {
  let version
  try {
    const { stdout } = await exec('npm', ['view', name, 'dist-tags.latest', '--json'])
    version = JSON.parse(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${name} is not published on npm or has no latest version: ${message}`)
  }
  if (typeof version !== 'string') {
    throw new Error(`${name} is not published on npm or has no latest version`)
  }
  packageJson.dependencies[name] = version
  console.log(`${name}@${version}`)
}

await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

let groups = await readFile(groupsPath, 'utf8')
for (const [name, version] of Object.entries(packageJson.dependencies)) {
  groups = groups.replace(new RegExp(`(\\s+["']?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?:\\s*")[^\\n]+`), `$1${version}`)
}
await writeFile(groupsPath, groups)
