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
  // The capture used to end at the OPENING quote and `[^\n]+` then ate the rest
  // of the line — the closing quote included — so `$1${version}` wrote
  // `"@ozjsey/v-copy": "1.2.0` and left every value unterminated. The file is
  // read by `dependency-grouper generate` behind `|| exit 0`, so it failed
  // silently on every install and the groups froze at whatever they said the
  // day it broke. Match the quotes explicitly and write both back.
  const key = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  groups = groups.replace(
    new RegExp(`(\\s+["']?${key}["']?:\\s*)(["'])[^"'\\n]*\\2`),
    `$1$2${version}$2`,
  )
}
await writeFile(groupsPath, groups)
