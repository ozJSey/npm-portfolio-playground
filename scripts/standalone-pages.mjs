/**
 * The standalone `<package>/playground.html` pages — the no-bundler, consumer's
 * view of each built artifact, loaded over an import map with no Vite in front.
 *
 * They are not part of the playground app and nothing else covers them, which
 * is how `v-select-text/playground.html` spent its life demonstrating ~40 lines
 * of directive reimplemented inside the HTML file, under a commented-out
 * import. It rendered. Every "does the page load" check passed it.
 *
 * So the assertion that matters here is not "did it render" but **did the page
 * actually fetch the package's own dist** — a fake cannot pass that, and a
 * stale or renamed artifact fails it by name instead of silently.
 *
 *   node scripts/standalone-pages.mjs            # all of them
 *   node scripts/standalone-pages.mjs v-copy     # one
 *   NEG=1 node scripts/standalone-pages.mjs      # negative control
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs'
import { extname, join, normalize, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Cdp, newPage, sleep, findChrome } from './lib/cdp.mjs'

const REPO = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.cjs': 'text/javascript', '.map': 'application/json', '.css': 'text/css' }

/** Every package that ships a standalone page, discovered rather than listed. */
function pages() {
  return readdirSync(REPO, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'playground' && d.name !== 'node_modules')
    .filter((d) => existsSync(join(REPO, d.name, 'playground.html')))
    .map((d) => d.name)
    .sort()
}

/**
 * `NEG=1` swaps each page's dist import for a generated stub that exports the
 * same names as no-ops. The page then renders, mounts and throws nothing — it
 * simply never loads the real library. That is precisely the shape of the
 * `v-select-text` fake, so if the run still passes under NEG the gate is
 * vacuous and the PASS above means nothing.
 */
function negStub(html) {
  const m = html.match(/import\s*\{([^}]+)\}\s*from\s*['"](\.\/dist\/[^'"]+)['"]/)
  if (!m) return null
  const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean)
  const body = names.map((n) => `export const ${n} = Object.assign(function () {}, { install() {}, mounted() {}, updated() {}, unmounted() {} })`).join('\n')
  // Replace the matched *statement*, not the first occurrence of the path:
  // a page that also names its dist entry in prose (they all do) would
  // otherwise get its documentation rewritten and its import left intact.
  return { real: m[2], html: html.replace(m[0], m[0].replace(m[2], './__neg_stub__.js')), body }
}

function serve(root, neg = false) {
  let stub = null
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    if (neg && url === '/__neg_stub__.js' && stub) {
      res.writeHead(200, { 'content-type': 'text/javascript' })
      return res.end(stub.body)
    }
    const p = normalize(join(root, url))
    if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); return res.end('not found') }
    if (neg && url === '/playground.html') {
      stub = negStub(readFileSync(p, 'utf8'))
      if (stub) {
        res.writeHead(200, { 'content-type': 'text/html' })
        return res.end(stub.html)
      }
    }
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(readFileSync(p))
  })
  return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port })))
}

/**
 * Chrome with `--remote-debugging-port=0` picks its own port and announces it.
 * Polling a port we guessed races any other browser on the box — and this runs
 * happily alongside `smoke`, which is the point.
 */
function launch() {
  const proc = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'standalone-'))}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,1400', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((resolve, reject) => {
    let log = ''
    const to = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`Chrome never announced a DevTools URL in 30s:\n${log}`)) }, 30_000)
    const onData = (c) => {
      log += c
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) { clearTimeout(to); resolve({ proc, wsUrl: m[1] }) }
    }
    proc.stderr.on('data', onData)
    proc.stdout.on('data', onData)
    proc.on('exit', (code) => { clearTimeout(to); reject(new Error(`Chrome exited ${code}:\n${log}`)) })
  })
}

/** The dist entry `package.json` actually points consumers at. */
function distEntry(pkg) {
  const meta = JSON.parse(readFileSync(join(REPO, pkg, 'package.json'), 'utf8'))
  const fromExports = meta.exports?.['.']?.import?.default ?? meta.exports?.['.']?.default
  const rel = (fromExports ?? meta.module ?? meta.main ?? '').replace(/^\.\//, '')
  return rel || null
}

const only = process.argv[2]
const NEG = process.env.NEG === '1'
const targets = pages().filter((p) => !only || p === only)
if (!targets.length) {
  console.error(only ? `No standalone page for '${only}'.` : 'No standalone pages found.')
  process.exit(1)
}

const chrome = await launch()
const cdp = await Cdp.connect(chrome.wsUrl)
const rows = []

for (const pkg of targets) {
  const root = join(REPO, pkg)
  const { server, port } = await serve(root, NEG)
  const entry = distEntry(pkg)
  const failures = []

  const page = await newPage(cdp, 'about:blank')
  /** Which URLs the page actually fetched, and what they returned. */
  const responses = new Map()
  cdp.on('Network.responseReceived', (p, sid) => {
    if (sid === page.sessionId) responses.set(p.response.url, p.response.status)
  })
  await cdp.send('Network.enable', {}, page.sessionId)
  await cdp.send('Browser.grantPermissions', {
    origin: `http://localhost:${port}`,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })

  try {
    await page.navigate(`http://localhost:${port}/playground.html`)
    await sleep(1500)

    // 1. The page fetched the package's own dist. A page that reimplements the
    //    library inline, or points at a renamed artifact, cannot pass this.
    if (!entry) {
      failures.push('package.json names no dist entry (no exports/module/main)')
    } else {
      const want = `http://localhost:${port}/${entry}`
      const status = responses.get(want)
      if (status === undefined) {
        const distFetched = [...responses.keys()].filter((u) => u.includes('/dist/'))
        failures.push(
          `never fetched its own dist entry ${entry}` +
            (distFetched.length ? ` — it fetched ${distFetched.map((u) => u.split('/').pop()).join(', ')} instead` : ' — no dist request at all'),
        )
      } else if (status !== 200) {
        failures.push(`dist entry ${entry} returned HTTP ${status}`)
      }
    }

    // 2. It mounted something.
    const mounted = await page.evaluate(() => {
      const root = document.querySelector('#app')
      return { present: !!root, children: root ? root.children.length : 0, text: root ? root.textContent.trim().length : 0 }
    })
    if (!mounted.present) failures.push('no #app root in the document')
    else if (mounted.children === 0) failures.push('#app mounted nothing — the app threw before render, or the template is empty')
    else if (mounted.text < 50) failures.push(`#app rendered only ${mounted.text} characters of text`)

    // 3. It is not sitting on an unresolved-directive warning, which is exactly
    //    what a page whose import went stale looks like.
    const unresolved = page.consoleWarnings.filter((w) => /Failed to resolve directive|Failed to resolve component/.test(w))
    if (unresolved.length) failures.push(`Vue could not resolve: ${unresolved.join(' | ')}`)

    if (page.pageErrors.length) failures.push(`uncaught: ${page.pageErrors.join(' | ')}`)
    if (page.consoleErrors.length) failures.push(`console.error: ${page.consoleErrors.join(' | ')}`)
  } catch (err) {
    failures.push(err.message)
  }

  rows.push({ pkg, entry, failures })
  server.close()
  await cdp.send('Target.closeTarget', { targetId: page.targetId }).catch(() => {})
}

chrome.proc.kill('SIGKILL')

console.log(`\n  Standalone playground.html pages — real Chrome, real dist, no bundler${NEG ? '  [NEGATIVE CONTROL]' : ''}\n`)
let bad = 0
for (const { pkg, entry, failures } of rows) {
  if (failures.length) {
    bad++
    console.log(`  FAIL  ${pkg}`)
    for (const f of failures) console.log(`          ↳ ${f}`)
  } else {
    console.log(`  PASS  ${pkg.padEnd(24)} fetched ${entry}`)
  }
}
console.log(`\n  ${rows.length - bad}/${rows.length} page(s) healthy, ${bad} failure(s)\n`)
process.exit(bad ? 1 : 0)
