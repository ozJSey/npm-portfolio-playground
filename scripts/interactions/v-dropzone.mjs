/**
 * v-dropzone interaction spec.
 *
 * Every card on the tab is driven the way a person would drive it, then the
 * rendered output and `data-dropzone` are read back. This is the only place
 * the library's browser-only paths are exercised: jsdom has no layout, no
 * FileSystem Entry API, and no real XHR, so the unit suite can only
 * approximate a drop, a paste, an upload or a folder walk.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/** Where the runner serves the playground — needed to grant clipboard access. */
const BASE_ORIGIN = `http://localhost:${Number(process.env.PORT ?? 5212)}`

/**
 * Dropzone-specific page helpers, layered over the runner's `__pg` base so a
 * check can call either through the same object. Every lookup is scoped to
 * `__pg.stage(file)` rather than the whole card — see the note on `stage` in
 * `scripts/interactions.mjs`.
 */
const PRELUDE = `
window.__dz = Object.assign(Object.create(window.__pg), {
  // Every card's host carries .dz; data-dropzone is removed entirely when the
  // directive detaches (enabled: false), so selecting on it would lose the host.
  zones(file) {
    const s = this.stage(file)
    const byClass = [...s.querySelectorAll('.dz')]
    return byClass.length ? byClass : [...s.querySelectorAll('[data-dropzone]')]
  },
  zone(file, i = 0) {
    const z = this.zones(file)[i]
    if (!z) throw new Error('no dropzone #' + i + ' in ' + file)
    return z
  },
  dt(files) {
    const d = new DataTransfer()
    for (const f of files) d.items.add(f)
    return d
  },
  fire(el, type, dataTransfer) {
    return el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
  },
  drop(el, files) {
    const d = this.dt(files)
    this.fire(el, 'dragenter', d)
    this.fire(el, 'dragover', d)
    this.fire(el, 'drop', d)
  },
  paste(target, files) {
    const d = this.dt(files)
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: d }))
  },
})
'ready'
`

/**
 * A real directory on disk. A synthetic `DataTransfer` cannot carry one:
 * Chromium answers `null` from `webkitGetAsEntry()` for any item with no
 * filesystem backing, so the folder walk needs `Input.dispatchDragEvent`,
 * which hands the browser a genuine path.
 */
let fixture = null
function fixtureTree() {
  if (fixture) return fixture
  const root = mkdtempSync(join(tmpdir(), 'dz-fixture-'))
  const album = join(root, 'album')
  const nested = join(album, 'nested')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(album, 'top.png'), Buffer.alloc(1200))
  writeFileSync(join(album, 'notes.txt'), 'plain text — rejected when accept is image/*')
  writeFileSync(join(nested, 'deep.png'), Buffer.alloc(2400))
  fixture = { root, album }
  return fixture
}

/** Drag a real path onto a card's host through Chrome's own input pipeline. */
async function dragPathOnto({ page, cdp, sessionId }, demo, path) {
  const box = await page.evaluate(`(() => {
    const z = __dz.zone('${demo}')
    z.scrollIntoView({ block: 'center' })
    const r = z.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  const data = { items: [], files: [path], dragOperationsMask: 1 }
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await cdp.send('Input.dispatchDragEvent', { type, x: box.x, y: box.y, data }, sessionId)
    await sleep(120)
  }
}

const CHECKS = [
  {
    demo: '01-drop-basic.vue',
    name: 'dragenter marks the zone active',
    fn: async () => {
      const z = __dz.zone('01-drop-basic.vue')
      const before = z.getAttribute('data-dropzone')
      __dz.fire(z, 'dragenter', __dz.dt([__dz.file('a.png', 'image/png')]))
      return { pass: before === 'idle' && z.getAttribute('data-dropzone') === 'active', detail: `${before} -> ${z.getAttribute('data-dropzone')}` }
    },
  },
  {
    demo: '01-drop-basic.vue',
    name: 'moving across children does NOT flip back to idle (the counter bug)',
    fn: async () => {
      const z = __dz.zone('01-drop-basic.vue')
      const child = z.querySelector('span') || z.firstElementChild
      const d = __dz.dt([__dz.file('a.png', 'image/png')])
      __dz.fire(z, 'dragenter', d)
      const afterZone = z.getAttribute('data-dropzone')
      __dz.fire(child, 'dragenter', d)
      __dz.fire(child, 'dragleave', d)
      const afterChild = z.getAttribute('data-dropzone')
      __dz.fire(z, 'dragleave', d)
      const afterLeave = z.getAttribute('data-dropzone')
      return {
        pass: afterZone === 'active' && afterChild === 'active' && afterLeave === 'idle',
        detail: `enter=${afterZone} child-traverse=${afterChild} leave=${afterLeave}`,
      }
    },
  },
  {
    demo: '01-drop-basic.vue',
    name: 'drop delivers the files to the handler',
    fn: async () => {
      const s = __dz.stage('01-drop-basic.vue')
      __dz.drop(__dz.zone('01-drop-basic.vue'), [__dz.file('report.pdf', 'application/pdf', 4096), __dz.file('shot.png', 'image/png', 1024)])
      const list = await __dz.until(() => s.querySelector('.files'))
      const t = __dz.txt(list)
      return { pass: !!list && t.includes('report.pdf') && t.includes('shot.png'), detail: t || 'no list rendered' }
    },
  },
  {
    demo: '01-drop-basic.vue',
    name: 'dragover is preventDefault-ed (without it drop never fires)',
    fn: async () => {
      const z = __dz.zone('01-drop-basic.vue')
      const d = __dz.dt([__dz.file('a.png', 'image/png')])
      const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: d })
      z.dispatchEvent(ev)
      return { pass: ev.defaultPrevented, detail: `defaultPrevented=${ev.defaultPrevented}` }
    },
  },
  {
    demo: '02-validation.vue',
    name: 'per-file accept: the image survives, the .txt rejects with [type]',
    fn: async () => {
      const s = __dz.stage('02-validation.vue')
      __dz.drop(__dz.zone('02-validation.vue'), [__dz.file('ok.png', 'image/png'), __dz.file('no.txt', 'text/plain')])
      await __dz.until(() => s.querySelector('.ok') || s.querySelector('.bad'))
      await __dz.sleep(150)
      const ok = __dz.txt(s.querySelector('.ok'))
      const bad = __dz.txt(s.querySelector('.bad'))
      return {
        pass: ok.includes('ok.png') && !ok.includes('no.txt') && bad.includes('type') && bad.includes('no.txt'),
        detail: `accepted="${ok}" rejected="${bad}"`,
      }
    },
  },
  {
    demo: '02-validation.vue',
    name: 'maxCount rejects the whole drop with [count]',
    fn: async () => {
      const s = __dz.stage('02-validation.vue')
      const files = [1, 2, 3, 4, 5].map((n) => __dz.file(`p${n}.png`, 'image/png'))
      __dz.drop(__dz.zone('02-validation.vue'), files)
      await __dz.until(() => __dz.txt(s.querySelector('.bad')).includes('count'))
      const bad = __dz.txt(s.querySelector('.bad'))
      const ok = __dz.txt(s.querySelector('.ok'))
      return { pass: bad.includes('count') && !ok, detail: `rejected="${bad}" accepted="${ok}"` }
    },
  },
  {
    demo: '02-validation.vue',
    name: 'maxSize rejects the oversized file with [size]',
    fn: async () => {
      const s = __dz.stage('02-validation.vue')
      // maxSize defaults to 500 KB in this card.
      __dz.drop(__dz.zone('02-validation.vue'), [__dz.file('huge.png', 'image/png', 900 * 1024), __dz.file('small.png', 'image/png', 1024)])
      await __dz.until(() => __dz.txt(s.querySelector('.bad')).includes('size'))
      const bad = __dz.txt(s.querySelector('.bad'))
      const ok = __dz.txt(s.querySelector('.ok'))
      return { pass: bad.includes('size') && bad.includes('huge.png') && ok.includes('small.png'), detail: `rejected="${bad}" accepted="${ok}"` }
    },
  },
  {
    demo: '02-validation.vue',
    name: 'multiple:false rejects a multi-file drop with [count]',
    fn: async () => {
      const s = __dz.stage('02-validation.vue')
      const box = __dz.label('02-validation.vue', 'multiple').querySelector('input[type=checkbox]')
      __dz.set(box, false)
      await __dz.sleep(120)
      __dz.drop(__dz.zone('02-validation.vue'), [__dz.file('a.png', 'image/png'), __dz.file('b.png', 'image/png')])
      await __dz.until(() => __dz.txt(s.querySelector('.bad')).includes('count'))
      const bad = __dz.txt(s.querySelector('.bad'))
      __dz.set(box, true)
      return { pass: bad.includes('count'), detail: `rejected="${bad}"` }
    },
  },
  {
    demo: '02-validation.vue',
    name: 'data-dropzone flips to "rejected" then auto-clears to "idle"',
    fn: async () => {
      const z = __dz.zone('02-validation.vue')
      __dz.drop(z, [__dz.file('no.txt', 'text/plain')])
      const rejected = await __dz.until(() => z.getAttribute('data-dropzone') === 'rejected', 2000)
      const cleared = await __dz.until(() => z.getAttribute('data-dropzone') === 'idle', 4000)
      return { pass: !!rejected && !!cleared, detail: `rejected=${!!rejected} auto-cleared=${!!cleared}` }
    },
  },
  {
    demo: '03-click-to-pick.vue',
    name: 'clicking the zone opens the hidden file input',
    fn: async () => {
      const z = __dz.zone('03-click-to-pick.vue')
      let opened = 0
      const real = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () { if (this.type === 'file') opened++; else real.call(this) }
      try {
        z.click()
        await __dz.sleep(120)
      } finally { HTMLInputElement.prototype.click = real }
      return { pass: opened === 1, detail: `file-input .click() calls = ${opened}` }
    },
  },
  {
    demo: '03-click-to-pick.vue',
    name: 'clicking a real <button> inside keeps its own semantics (no picker)',
    fn: async () => {
      const s = __dz.stage('03-click-to-pick.vue')
      const btn = [...s.querySelectorAll('button')].find((b) => __dz.txt(b).includes('a real button'))
      let opened = 0
      const real = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () { if (this.type === 'file') opened++; else real.call(this) }
      const before = __dz.txt(btn)
      try {
        btn.click()
        await __dz.sleep(150)
      } finally { HTMLInputElement.prototype.click = real }
      const after = __dz.txt(btn)
      return { pass: opened === 0 && before !== after, detail: `picker opens=${opened}; button text "${before}" -> "${after}"` }
    },
  },
  {
    demo: '03-click-to-pick.vue',
    name: 'the hidden input mirrors accept/multiple and is CLIPPED, not display:none',
    fn: async () => {
      const z = __dz.zone('03-click-to-pick.vue')
      z.click()
      await __dz.sleep(120)
      // Scoped to this card's stage, not the document: with clickToPick on by
      // default every zone on the tab owns a picker input, and a document-wide
      // lookup returns 01-drop-basic's instead of this card's.
      const input = __dz.stage('03-click-to-pick.vue').querySelector('input[type=file]')
      if (!input) return { pass: false, detail: 'no hidden file input on the card' }
      const style = getComputedStyle(input)
      // PG-17: this asserted `display: none` until DZ-1b/c replaced it with the
      // clip recipe — and `position: absolute` blockifies the computed display,
      // so the old assertion was unsatisfiable by construction. `display: none`
      // is the thing that must NOT be true: it would take the input out of the
      // tab order and out of the accessibility tree, which is the whole reason
      // the recipe clips instead.
      const box = input.getBoundingClientRect()
      const clipped = style.clipPath === 'inset(50%)' && Math.round(box.width) === 1 && Math.round(box.height) === 1
      return {
        pass:
          input.accept === 'image/*' &&
          input.multiple === true &&
          style.display !== 'none' &&
          style.position === 'absolute' &&
          clipped,
        detail: `accept="${input.accept}" multiple=${input.multiple} display=${style.display} position=${style.position} clipPath=${style.clipPath} box=${Math.round(box.width)}x${Math.round(box.height)}`,
      }
    },
  },
  {
    demo: '03-click-to-pick.vue',
    name: 'the picker input contributes nothing to layout (remove it, nothing moves)',
    fn: async () => {
      const z = __dz.zone('03-click-to-pick.vue')
      const input = __dz.stage('03-click-to-pick.vue').querySelector('input[type=file]')
      if (!input) return { pass: false, detail: 'no hidden file input on the card' }
      const read = () => ({
        doc: document.documentElement.scrollHeight,
        zoneH: Math.round(z.getBoundingClientRect().height),
        zoneW: Math.round(z.getBoundingClientRect().width),
      })
      const withInput = read()
      const parent = input.parentElement
      const next = input.nextSibling
      parent.removeChild(input)
      const without = read()
      parent.insertBefore(input, next)
      const restored = read()
      const same = (a, b) => a.doc === b.doc && a.zoneH === b.zoneH && a.zoneW === b.zoneW
      return {
        pass: same(withInput, without) && same(withInput, restored),
        detail: `with=${JSON.stringify(withInput)} without=${JSON.stringify(without)} restored=${JSON.stringify(restored)}`,
      }
    },
  },
  {
    demo: '03-click-to-pick.vue',
    name: 'DZ-3: the picker input sits INSIDE its own zone, not at the initial containing block',
    fn: async () => {
      const z = __dz.zone('03-click-to-pick.vue')
      const input = __dz.stage('03-click-to-pick.vue').querySelector('input[type=file]')
      if (!input) return { pass: false, detail: 'no hidden file input on the card' }
      const zr = z.getBoundingClientRect()
      const ir = input.getBoundingClientRect()
      const inside = ir.top >= zr.top - 1 && ir.bottom <= zr.bottom + 1 && ir.left >= zr.left - 1 && ir.right <= zr.right + 1
      // The mechanism, not just the outcome: the offsets only resolve against
      // the zone because the host is the input's containing block.
      const anchored = input.offsetParent === z && getComputedStyle(z).position !== 'static'
      return {
        pass: inside && anchored,
        detail: `zone(top=${Math.round(zr.top)},left=${Math.round(zr.left)}) input(top=${Math.round(ir.top)},left=${Math.round(ir.left)}) inside=${inside} offsetParent=${input.offsetParent === z ? 'the zone' : (input.offsetParent && input.offsetParent.tagName)} hostPosition=${getComputedStyle(z).position}`,
      }
    },
  },
  {
    demo: '04-paste.vue',
    name: "pasteOn:'document' catches a paste fired outside the zone",
    fn: async () => {
      const s = __dz.stage('04-paste.vue')
      __dz.paste(document.body, [__dz.file('screenshot.png', 'image/png', 4096)])
      const shots = await __dz.until(() => s.querySelector('.shots img'))
      return { pass: !!shots, detail: shots ? `preview rendered (${s.querySelectorAll('.shots img').length} img)` : 'no preview appeared' }
    },
  },
  {
    demo: '04-paste.vue',
    name: 'a non-file paste is ignored',
    fn: async () => {
      const s = __dz.stage('04-paste.vue')
      const before = s.querySelectorAll('.shots img').length
      const d = new DataTransfer()
      d.setData('text/plain', 'just some text')
      document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: d }))
      await __dz.sleep(250)
      const after = s.querySelectorAll('.shots img').length
      return { pass: before === after, detail: `previews ${before} -> ${after}` }
    },
  },
  {
    demo: '04-paste.vue',
    name: 'paste runs the same validation pipeline (non-image rejects)',
    fn: async () => {
      const z = __dz.zone('04-paste.vue')
      __dz.paste(document.body, [__dz.file('notes.txt', 'text/plain')])
      const rejected = await __dz.until(() => z.getAttribute('data-dropzone') === 'rejected', 2500)
      return { pass: !!rejected, detail: `state after non-image paste = ${z.getAttribute('data-dropzone')}` }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'drop uploads for real: uploading -> success, progress + response logged',
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const z = __dz.zone('05-url-upload.vue')
      __dz.drop(z, [__dz.file('payload.bin', 'application/octet-stream', 512 * 1024)])
      const uploading = await __dz.until(() => z.getAttribute('data-dropzone') === 'uploading', 3000)
      const success = await __dz.until(() => z.getAttribute('data-dropzone') === 'success', 10000)
      const log = __dz.txt(s.querySelector('.pg-log'))
      const bars = __dz.txt(s.querySelector('.bars'))
      return {
        pass: !!uploading && !!success && log.includes('✓ payload.bin') && log.includes('"ok":true'),
        detail: `uploading=${!!uploading} success=${!!success} bars="${bars}" log="${log.slice(0, 120)}"`,
      }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'a 500 response drives the sticky "error" state and logs the status',
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const z = __dz.zone('05-url-upload.vue')
      const sel = s.querySelector('select')
      __dz.set(sel, '/api/upload-fail')
      await __dz.sleep(150)
      __dz.drop(z, [__dz.file('doomed.bin', 'application/octet-stream', 2048)])
      const err = await __dz.until(() => z.getAttribute('data-dropzone') === 'error', 8000)
      await __dz.sleep(2200) // well past successDuration — error must NOT auto-clear
      const stillError = z.getAttribute('data-dropzone') === 'error'
      const log = __dz.txt(s.querySelector('.pg-log'))
      __dz.set(sel, '/api/upload')
      return {
        pass: !!err && stillError && log.includes('✗ doomed.bin') && log.includes('500'),
        detail: `error=${!!err} sticky=${stillError} log="${log.slice(0, 120)}"`,
      }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'timeout surfaces [timedOut] against the slow endpoint',
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const sel = s.querySelector('select')
      const timeout = [...s.querySelectorAll('input[type=number]')][0]
      __dz.set(sel, '/api/upload-slow')
      __dz.set(timeout, 800)
      await __dz.sleep(150)
      __dz.drop(__dz.zone('05-url-upload.vue'), [__dz.file('slow.bin', 'application/octet-stream', 2048)])
      const hit = await __dz.until(() => __dz.txt(s.querySelector('.pg-log')).includes('timedOut'), 9000)
      const log = __dz.txt(s.querySelector('.pg-log'))
      __dz.set(sel, '/api/upload')
      __dz.set(timeout, 0)
      return { pass: !!hit, detail: `log="${log.slice(0, 140)}"` }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'batched:true sends one request for the whole drop',
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const box = __dz.label('05-url-upload.vue', 'batched').querySelector('input[type=checkbox]')
      let calls = 0
      const realOpen = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (...a) { if (String(a[1]).includes('/api/upload')) calls++; return realOpen.apply(this, a) }
      __dz.set(box, true)
      await __dz.sleep(150)
      try {
        __dz.drop(__dz.zone('05-url-upload.vue'), [__dz.file('b1.bin', 'application/octet-stream'), __dz.file('b2.bin', 'application/octet-stream'), __dz.file('b3.bin', 'application/octet-stream')])
        await __dz.until(() => __dz.zone('05-url-upload.vue').getAttribute('data-dropzone') === 'success', 9000)
      } finally { XMLHttpRequest.prototype.open = realOpen }
      __dz.set(box, false)
      return { pass: calls === 1, detail: `3 files -> ${calls} XHR(s)` }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'custom parseResponse replaces the default JSON parsing',
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const box = __dz.label('05-url-upload.vue', 'parseResponse').querySelector('input[type=checkbox]')
      __dz.set(box, true)
      await __dz.sleep(150)
      __dz.drop(__dz.zone('05-url-upload.vue'), [__dz.file('parsed.bin', 'application/octet-stream')])
      const hit = await __dz.until(() => __dz.txt(s.querySelector('.pg-log')).includes('raw:'), 9000)
      const log = __dz.txt(s.querySelector('.pg-log'))
      __dz.set(box, false)
      return { pass: !!hit, detail: `log="${log.slice(0, 120)}"` }
    },
  },
  {
    demo: '06-fn-upload.vue',
    name: 'the custom transport runs and its resolved value reaches onUploaded',
    fn: async () => {
      const s = __dz.stage('06-fn-upload.vue')
      __dz.drop(__dz.zone('06-fn-upload.vue'), [__dz.file('asset.png', 'image/png')])
      const done = await __dz.until(() => __dz.txt(s.querySelector('.pg-log')).includes('✓ asset.png'), 12000)
      const log = __dz.txt(s.querySelector('.pg-log'))
      const chip = __dz.txt(s.querySelector('.pg-chip'))
      return { pass: !!done && log.includes('uploads/asset.png') && log.includes('etag'), detail: `chip=${chip} log="${log.slice(0, 130)}"` }
    },
  },
  {
    demo: '06-fn-upload.vue',
    name: 'a thrown Error becomes onError(file, { message })',
    fn: async () => {
      const s = __dz.stage('06-fn-upload.vue')
      const box = __dz.label('06-fn-upload.vue', 'throw').querySelector('input[type=checkbox]')
      __dz.set(box, true)
      await __dz.sleep(120)
      __dz.drop(__dz.zone('06-fn-upload.vue'), [__dz.file('bad.png', 'image/png')])
      const failed = await __dz.until(() => __dz.txt(s.querySelector('.pg-log')).includes('✗ bad.png'), 12000)
      const log = __dz.txt(s.querySelector('.pg-log'))
      __dz.set(box, false)
      return { pass: !!failed && log.includes('presigned URL expired'), detail: `log="${log.slice(0, 130)}"` }
    },
  },
  {
    demo: '07-api.vue',
    name: 'api.open() opens the picker with no clickToPick',
    fn: async () => {
      let opened = 0
      const real = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () { if (this.type === 'file') opened++; else real.call(this) }
      try {
        __dz.button('07-api.vue', 'open()').click()
        await __dz.sleep(150)
      } finally { HTMLInputElement.prototype.click = real }
      return { pass: opened === 1, detail: `picker opens = ${opened}` }
    },
  },
  {
    demo: '07-api.vue',
    name: 'api.cancel() aborts an in-flight upload and empties api.uploading',
    fn: async () => {
      const s = __dz.stage('07-api.vue')
      __dz.set(s.querySelector('select'), '/api/upload-slow')
      await __dz.sleep(150)
      __dz.drop(__dz.zone('07-api.vue'), [__dz.file('slow.bin', 'application/octet-stream', 4096)])
      const inFlight = await __dz.until(() => __dz.button('07-api.vue', 'cancel()') && !__dz.button('07-api.vue', 'cancel()').disabled, 5000)
      if (!inFlight) return { pass: false, detail: 'cancel() never became enabled — upload not tracked as in-flight' }
      const kv = () => __dz.txt(s.querySelector('.kv'))
      const during = kv()
      __dz.button('07-api.vue', 'cancel()').click()
      const cleared = await __dz.until(() => __dz.button('07-api.vue', 'cancel()').disabled, 5000)
      return { pass: !!cleared && during.includes('slow.bin'), detail: `during="${during}" after="${kv()}"` }
    },
  },
  {
    demo: '07-api.vue',
    name: 'a failed upload populates api.failed; retry() re-runs it; dismissError() clears',
    fn: async () => {
      const s = __dz.stage('07-api.vue')
      __dz.set(s.querySelector('select'), '/api/upload-fail')
      await __dz.sleep(150)
      __dz.drop(__dz.zone('07-api.vue'), [__dz.file('flaky.bin', 'application/octet-stream', 2048)])
      const failed = await __dz.until(() => !__dz.button('07-api.vue', 'retry()').disabled, 8000)
      if (!failed) return { pass: false, detail: `retry() never enabled; kv="${__dz.txt(s.querySelector('.kv'))}"` }
      const kvFailed = __dz.txt(s.querySelector('.kv'))
      const zone = __dz.zone('07-api.vue')
      const isError = zone.getAttribute('data-dropzone') === 'error'

      // Retry against the same failing endpoint must go uploading -> error again,
      // which is what proves it actually re-ran rather than leaving the old record.
      __dz.button('07-api.vue', 'retry()').click()
      const wentBack = await __dz.until(() => __dz.zone('07-api.vue').getAttribute('data-dropzone') === 'uploading', 5000)
      const retried = await __dz.until(() => __dz.zone('07-api.vue').getAttribute('data-dropzone') === 'error', 9000)

      const dismiss = __dz.button('07-api.vue', 'dismissError()')
      const dismissable = await __dz.until(() => !__dz.button('07-api.vue', 'dismissError()').disabled, 3000)
      dismiss.click()
      const cleared = await __dz.until(() => __dz.zone('07-api.vue').getAttribute('data-dropzone') === 'idle', 4000)
      __dz.set(s.querySelector('select'), '/api/upload')
      return {
        pass: isError && kvFailed.includes('flaky.bin') && !!wentBack && !!retried && !!dismissable && !!cleared,
        detail: `error-state=${isError} failed-listed=${kvFailed.includes('flaky.bin')} re-uploaded=${!!wentBack} failed-again=${!!retried} dismissable=${!!dismissable} dismissed=${!!cleared}`,
      }
    },
  },
  {
    demo: '08-auto-upload-queue.vue',
    name: 'autoUpload:false queues in api.pending instead of uploading',
    fn: async () => {
      const s = __dz.stage('08-auto-upload-queue.vue')
      let calls = 0
      const realOpen = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (...a) { if (String(a[1]).includes('/api/upload')) calls++; return realOpen.apply(this, a) }
      try {
        __dz.drop(__dz.zone('08-auto-upload-queue.vue'), [__dz.file('q1.bin', 'application/octet-stream'), __dz.file('q2.bin', 'application/octet-stream')])
        await __dz.until(() => s.querySelector('.queue li'), 4000)
        await __dz.sleep(600)
      } finally { XMLHttpRequest.prototype.open = realOpen }
      const items = [...s.querySelectorAll('.queue li')].map((li) => __dz.txt(li.querySelector('.name')))
      return { pass: items.length === 2 && calls === 0, detail: `pending=[${items}] xhr-calls=${calls}` }
    },
  },
  {
    demo: '08-auto-upload-queue.vue',
    name: 'upload(file) flushes just that one; upload() flushes the rest',
    fn: async () => {
      const s = __dz.stage('08-auto-upload-queue.vue')
      __dz.drop(__dz.zone('08-auto-upload-queue.vue'), [__dz.file('q1.bin', 'application/octet-stream'), __dz.file('q2.bin', 'application/octet-stream')])
      await __dz.until(() => s.querySelectorAll('.queue li').length === 2, 5000)
      const one = [...s.querySelectorAll('.queue li button')][0]
      if (!one) return { pass: false, detail: 'files never queued into api.pending' }
      one.click()
      const firstDone = await __dz.until(() => __dz.txt(s.querySelector('.pg-chip')).includes('q1.bin'), 9000)
      const remaining = s.querySelectorAll('.queue li').length
      const all = __dz.button('08-auto-upload-queue.vue', 'Upload all')
      all.click()
      const allDone = await __dz.until(() => __dz.txt(s.querySelector('.pg-chip')).includes('q2.bin'), 9000)
      return { pass: !!firstDone && remaining === 1 && !!allDone, detail: `after upload(file): chip="${__dz.txt(s.querySelector('.pg-chip'))}", queue left=${remaining}` }
    },
  },
  {
    demo: '09-css-progress.vue',
    name: '--dropzone-progress and --dropzone-files-pending are written, then cleared',
    fn: async () => {
      const z = __dz.zone('09-css-progress.vue')
      __dz.drop(z, [__dz.file('c1.bin', 'application/octet-stream', 256 * 1024), __dz.file('c2.bin', 'application/octet-stream', 256 * 1024)])
      const seen = await __dz.until(() => {
        const pending = z.style.getPropertyValue('--dropzone-files-pending')
        return pending && Number(pending) > 0 ? { pending, progress: z.style.getPropertyValue('--dropzone-progress') } : null
      }, 6000)
      if (!seen) return { pass: false, detail: `vars never appeared; inline style="${z.getAttribute('style') || ''}"` }
      const cleared = await __dz.until(() => !z.style.getPropertyValue('--dropzone-files-pending'), 12000)
      return {
        pass: Number(seen.pending) === 2 && seen.progress !== '' && !!cleared,
        detail: `during: pending=${seen.pending} progress=${seen.progress}; cleared-after=${!!cleared}`,
      }
    },
  },
  {
    demo: '10-state-machine.vue',
    name: 'a rejected drop records "rejected" then returns to idle',
    fn: async () => {
      const s = __dz.stage('10-state-machine.vue')
      __dz.drop(__dz.zone('10-state-machine.vue'), [__dz.file('nope.txt', 'text/plain')])
      const sawRejected = await __dz.until(() => __dz.txt(s).includes('rejected'), 3000)
      const back = await __dz.until(() => __dz.txt(s.querySelector('.dz strong')) === 'idle', 5000)
      const trail = __dz.txt([...s.querySelectorAll('.pg-kv')].find((p) => __dz.txt(p).startsWith('trail')))
      return { pass: !!sawRejected && !!back && trail.includes('rejected'), detail: trail }
    },
  },
  {
    demo: '10-state-machine.vue',
    name: 'a successful upload walks active -> uploading -> success -> idle',
    fn: async () => {
      const s = __dz.stage('10-state-machine.vue')
      __dz.drop(__dz.zone('10-state-machine.vue'), [__dz.file('good.png', 'image/png', 128 * 1024)])
      await __dz.until(() => __dz.txt(s.querySelector('.dz strong')) === 'success', 12000)
      const back = await __dz.until(() => __dz.txt(s.querySelector('.dz strong')) === 'idle', 6000)
      const trail = __dz.txt([...s.querySelectorAll('.pg-kv')].find((p) => __dz.txt(p).startsWith('trail')))
      const order = ['idle', 'success', 'uploading'].every((st) => trail.includes(st))
      return { pass: !!back && order, detail: trail }
    },
  },
  {
    demo: '10-state-machine.vue',
    name: 'starting a new drag cancels a pending rejected auto-clear',
    fn: async () => {
      const z = __dz.zone('10-state-machine.vue')
      __dz.drop(z, [__dz.file('nope.txt', 'text/plain')])
      await __dz.until(() => z.getAttribute('data-dropzone') === 'rejected', 3000)
      __dz.fire(z, 'dragenter', __dz.dt([__dz.file('x.png', 'image/png')]))
      const active = z.getAttribute('data-dropzone')
      // Hold past rejectDuration while the drag is still over the zone.
      await __dz.sleep(2000)
      const held = z.getAttribute('data-dropzone')
      __dz.fire(z, 'dragleave', __dz.dt([]))
      return { pass: active === 'active' && held === 'active', detail: `on-drag=${active}, after 2s still=${held}` }
    },
  },
  {
    demo: '11-enabled.vue',
    name: 'three v-for zones stay isolated — a drop lands in exactly one',
    fn: async () => {
      const s = __dz.stage('11-enabled.vue')
      const zones = __dz.zones('11-enabled.vue')
      __dz.drop(zones[0], [__dz.file('face.png', 'image/png')])
      await __dz.until(() => __dz.txt(zones[0].querySelector('ul')).includes('face.png'), 4000)
      const lists = zones.map((z) => __dz.txt(z.querySelector('ul')))
      return { pass: lists[0].includes('face.png') && !lists[1] && !lists[2], detail: `[${lists.map((l) => l || '∅').join(' | ')}]` }
    },
  },
  {
    demo: '11-enabled.vue',
    name: 'each zone applies its own accept',
    fn: async () => {
      const zones = __dz.zones('11-enabled.vue')
      // zone 1 accepts .pdf,.docx,.txt — an image must be rejected there
      __dz.drop(zones[1], [__dz.file('photo.png', 'image/png')])
      const rejected = await __dz.until(() => zones[1].getAttribute('data-dropzone') === 'rejected', 3000)
      const listed = __dz.txt(zones[1].querySelector('ul'))
      return { pass: !!rejected && !listed.includes('photo.png'), detail: `documents-zone state=${zones[1].getAttribute('data-dropzone')} list="${listed}"` }
    },
  },
  {
    demo: '11-enabled.vue',
    name: 'enabled:false detaches the listeners entirely (drag does nothing)',
    fn: async () => {
      const zones = __dz.zones('11-enabled.vue')
      const box = __dz.label('11-enabled.vue', 'enabled').querySelector('input[type=checkbox]')
      __dz.set(box, false)
      await __dz.sleep(250)
      const z = __dz.zones('11-enabled.vue')[2]
      __dz.fire(z, 'dragenter', __dz.dt([__dz.file('any.bin', '')]))
      const stateOnDrag = z.getAttribute('data-dropzone')
      __dz.drop(z, [__dz.file('any.bin', '')])
      await __dz.sleep(400)
      const listed = __dz.txt(z.querySelector('ul'))
      __dz.set(box, true)
      await __dz.sleep(250)
      const zAfter = __dz.zones('11-enabled.vue')[2]
      __dz.drop(zAfter, [__dz.file('back.bin', '')])
      const works = await __dz.until(() => __dz.txt(zAfter.querySelector('ul')).includes('back.bin'), 4000)
      return {
        pass: stateOnDrag !== 'active' && !listed.includes('any.bin') && !!works,
        detail: `disabled: state-on-drag=${stateOnDrag} listed="${listed}"; re-enabled accepts again=${!!works}`,
      }
    },
  },

  /* ---- checks pinning the defects fixed in this pass ---- */
  {
    demo: '02-validation.vue',
    name: 'a partial rejection shows BOTH the accepted line and the reasons line',
    fn: async () => {
      const s = __dz.stage('02-validation.vue')
      __dz.drop(__dz.zone('02-validation.vue'), [__dz.file('ok.png', 'image/png'), __dz.file('no.exe', 'application/x-msdownload')])
      await __dz.until(() => s.querySelector('.ok') && s.querySelector('.bad'), 4000)
      await __dz.sleep(200)
      const ok = __dz.txt(s.querySelector('.ok'))
      const bad = __dz.txt(s.querySelector('.bad'))
      return {
        pass: ok.includes('ok.png') && bad.includes('no.exe') && bad.includes('type'),
        detail: `accepted="${ok}" rejected="${bad}"`,
      }
    },
  },
  {
    demo: '03-click-to-pick.vue',
    name: 'changing accept re-syncs the hidden input on the next open',
    fn: async () => {
      const s = __dz.stage('03-click-to-pick.vue')
      const sel = s.querySelector('select')
      __dz.set(sel, '.pdf,.docx')
      const box = __dz.label('03-click-to-pick.vue', 'multiple').querySelector('input[type=checkbox]')
      __dz.set(box, false)
      await __dz.sleep(200)
      __dz.zone('03-click-to-pick.vue').click()
      await __dz.sleep(200)
      const input = s.querySelector('input[type=file]')
      return {
        pass: !!input && input.accept === '.pdf,.docx' && input.multiple === false,
        detail: `accept="${input?.accept}" multiple=${input?.multiple}`,
      }
    },
  },
  {
    demo: '04-paste.vue',
    name: 'a rejected paste surfaces its reasons on the card',
    fn: async () => {
      const s = __dz.stage('04-paste.vue')
      __dz.paste(document.body, [__dz.file('notes.txt', 'text/plain')])
      const shown = await __dz.until(() => __dz.txt(s.querySelector('.bad')), 4000)
      return { pass: !!shown && shown.includes('type'), detail: `rejected="${shown || '(nothing rendered)'}"` }
    },
  },
  {
    demo: '04-paste.vue',
    name: 'the upload toggle runs a pasted file through the upload pipeline',
    fn: async () => {
      const s = __dz.stage('04-paste.vue')
      const box = __dz.label('04-paste.vue', 'upload what I paste').querySelector('input[type=checkbox]')
      __dz.set(box, true)
      await __dz.sleep(200)
      __dz.paste(document.body, [__dz.file('shot.png', 'image/png', 64 * 1024)])
      const uploaded = await __dz.until(() => __dz.txt(s).includes('✓ uploaded shot.png'), 10000)
      return { pass: !!uploaded, detail: uploaded ? 'pasted file uploaded' : `state=${__dz.zone('04-paste.vue').getAttribute('data-dropzone')}` }
    },
  },
  {
    demo: '06-fn-upload.vue',
    name: 'cancel() aborts the custom transport and logs [aborted]',
    fn: async () => {
      const s = __dz.stage('06-fn-upload.vue')
      __dz.drop(__dz.zone('06-fn-upload.vue'), [__dz.file('big.png', 'image/png')])
      const enabled = await __dz.until(() => {
        const b = __dz.button('06-fn-upload.vue', 'Cancel')
        return b && !b.disabled ? b : null
      }, 6000)
      if (!enabled) return { pass: false, detail: 'Cancel never enabled — api.uploading stayed empty' }
      enabled.click()
      const logged = await __dz.until(() => __dz.txt(s.querySelector('.pg-log')).includes('[aborted]'), 6000)
      return { pass: !!logged, detail: `log="${__dz.txt(s.querySelector('.pg-log')).slice(0, 140)}"` }
    },
  },
  {
    demo: '06-fn-upload.vue',
    name: 'the transport feeds the directive onProgress option',
    fn: async () => {
      const s = __dz.stage('06-fn-upload.vue')
      __dz.drop(__dz.zone('06-fn-upload.vue'), [__dz.file('p.png', 'image/png')])
      const moved = await __dz.until(() => {
        const pct = Number(__dz.txt(s.querySelector('.pg-chip')).replace('%', ''))
        return pct > 0 ? pct : null
      }, 8000)
      return { pass: !!moved, detail: `percent chip reached ${moved ?? 0}%` }
    },
  },
  {
    demo: '07-api.vue',
    name: 'cancel(file) aborts one file and leaves the others uploading',
    fn: async () => {
      const s = __dz.stage('07-api.vue')
      __dz.set(s.querySelector('select'), '/api/upload-slow')
      await __dz.sleep(200)
      __dz.drop(__dz.zone('07-api.vue'), [__dz.file('one.bin', 'application/octet-stream'), __dz.file('two.bin', 'application/octet-stream')])
      const rows = await __dz.until(() => (s.querySelectorAll('.per-file li').length === 2 ? [...s.querySelectorAll('.per-file li')] : null), 6000)
      if (!rows) return { pass: false, detail: `per-file rows never rendered; kv="${__dz.txt(s.querySelector('.kv'))}"` }
      rows[0].querySelector('button').click()
      const down = await __dz.until(() => s.querySelectorAll('.per-file li').length === 1, 5000)
      const left = __dz.txt(s.querySelector('.kv'))
      return { pass: !!down && left.includes('two.bin') && !left.includes('one.bin'), detail: `rows 2 -> ${s.querySelectorAll('.per-file li').length}; kv="${left}"` }
    },
  },
  {
    demo: '07-api.vue',
    name: 'retry(file) re-runs exactly that file',
    fn: async () => {
      const s = __dz.stage('07-api.vue')
      __dz.set(s.querySelector('select'), '/api/upload-fail')
      await __dz.sleep(200)
      __dz.drop(__dz.zone('07-api.vue'), [__dz.file('r.bin', 'application/octet-stream')])
      const row = await __dz.until(() => [...s.querySelectorAll('.per-file li')].find((li) => __dz.txt(li).includes('failed')), 8000)
      if (!row) return { pass: false, detail: `no failed row; kv="${__dz.txt(s.querySelector('.kv'))}"` }
      row.querySelector('button').click()
      const reran = await __dz.until(() => __dz.zone('07-api.vue').getAttribute('data-dropzone') === 'uploading', 5000)
      const failedAgain = await __dz.until(() => __dz.zone('07-api.vue').getAttribute('data-dropzone') === 'error', 9000)
      return { pass: !!reran && !!failedAgain, detail: `re-uploaded=${!!reran} failed-again=${!!failedAgain}` }
    },
  },
  {
    demo: '09-css-progress.vue',
    name: 'a failed upload freezes the bar and reaches the error state',
    fn: async () => {
      const s = __dz.stage('09-css-progress.vue')
      const z = __dz.zone('09-css-progress.vue')
      __dz.set(s.querySelector('select'), '/api/upload-fail')
      await __dz.sleep(200)
      __dz.drop(z, [__dz.file('f.bin', 'application/octet-stream', 128 * 1024)])
      const err = await __dz.until(() => z.getAttribute('data-dropzone') === 'error', 9000)
      const pending = z.style.getPropertyValue('--dropzone-files-pending')
      return { pass: !!err && Number(pending || '0') === 0, detail: `state=${z.getAttribute('data-dropzone')} files-pending="${pending}" progress="${z.style.getPropertyValue('--dropzone-progress')}"` }
    },
  },
  {
    demo: '09-css-progress.vue',
    name: 'a rejected drop never writes the upload variables',
    fn: async () => {
      const s = __dz.stage('09-css-progress.vue')
      const z = __dz.zone('09-css-progress.vue')
      __dz.set(s.querySelector('input[type=number]'), 10)
      await __dz.sleep(200)
      __dz.drop(z, [__dz.file('too-big.bin', 'application/octet-stream', 200 * 1024)])
      const rejected = await __dz.until(() => z.getAttribute('data-dropzone') === 'rejected', 4000)
      const progress = z.style.getPropertyValue('--dropzone-progress')
      const pending = z.style.getPropertyValue('--dropzone-files-pending')
      return { pass: !!rejected && progress === '' && pending === '', detail: `state=${z.getAttribute('data-dropzone')} progress="${progress}" pending="${pending}"` }
    },
  },
  {
    demo: '10-state-machine.vue',
    name: 'a sticky error survives a drag that never drops',
    fn: async () => {
      const s = __dz.stage('10-state-machine.vue')
      const z = __dz.zone('10-state-machine.vue')
      __dz.set(s.querySelector('select'), '/api/upload-fail')
      await __dz.sleep(200)
      __dz.drop(z, [__dz.file('boom.png', 'image/png')])
      const err = await __dz.until(() => z.getAttribute('data-dropzone') === 'error', 9000)
      if (!err) return { pass: false, detail: `never reached error; state=${z.getAttribute('data-dropzone')}` }
      __dz.fire(z, 'dragenter', __dz.dt([__dz.file('x.png', 'image/png')]))
      const during = z.getAttribute('data-dropzone')
      __dz.fire(z, 'dragleave', __dz.dt([]))
      await __dz.sleep(300)
      const after = z.getAttribute('data-dropzone')
      return { pass: during === 'active' && after === 'error', detail: `error -> dragenter=${during} -> dragleave=${after}` }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: "method: 'PUT' is the verb actually sent",
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const sel = [...s.querySelectorAll('select')].find((e) => __dz.txt(e).includes('POST'))
      __dz.set(sel, 'PUT')
      await __dz.sleep(200)
      let verb = null
      const realOpen = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (...a) {
        if (String(a[1]).includes('/api/upload')) verb = a[0]
        return realOpen.apply(this, a)
      }
      try {
        __dz.drop(__dz.zone('05-url-upload.vue'), [__dz.file('put.bin', 'application/octet-stream')])
        await __dz.until(() => verb, 6000)
      } finally { XMLHttpRequest.prototype.open = realOpen }
      return { pass: verb === 'PUT', detail: `verb sent = ${verb}` }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'the function form of url is resolved per file',
    fn: async () => {
      const box = __dz.label('05-url-upload.vue', 'as functions').querySelector('input[type=checkbox]')
      __dz.set(box, true)
      await __dz.sleep(200)
      const urls = []
      const realOpen = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (...a) {
        if (String(a[1]).includes('/api/upload')) urls.push(String(a[1]))
        return realOpen.apply(this, a)
      }
      try {
        __dz.drop(__dz.zone('05-url-upload.vue'), [__dz.file('a.bin', 'application/octet-stream'), __dz.file('b.bin', 'application/octet-stream')])
        await __dz.until(() => urls.length === 2, 7000)
      } finally { XMLHttpRequest.prototype.open = realOpen }
      return {
        pass: urls.length === 2 && urls.some((u) => u.includes('name=a.bin')) && urls.some((u) => u.includes('name=b.bin')),
        detail: `urls=[${urls}]`,
      }
    },
  },
  {
    demo: '10-state-machine.vue',
    name: 'dragging during an upload flips to active then back to uploading, never idle',
    fn: async () => {
      const s = __dz.stage('10-state-machine.vue')
      const z = __dz.zone('10-state-machine.vue')
      __dz.set(s.querySelector('select'), '/api/upload-slow')
      await __dz.sleep(200)
      __dz.drop(z, [__dz.file('slow.png', 'image/png', 64 * 1024)])
      const uploading = await __dz.until(() => z.getAttribute('data-dropzone') === 'uploading', 5000)
      if (!uploading) return { pass: false, detail: `never reached uploading; state=${z.getAttribute('data-dropzone')}` }
      __dz.fire(z, 'dragenter', __dz.dt([__dz.file('x.png', 'image/png')]))
      const during = z.getAttribute('data-dropzone')
      __dz.fire(z, 'dragleave', __dz.dt([]))
      const after = z.getAttribute('data-dropzone')
      return { pass: during === 'active' && after === 'uploading', detail: `uploading -> dragenter=${during} -> dragleave=${after}` }
    },
  },
  {
    demo: '13-click-opt-out.vue',
    name: 'the opted-out zone has NO picker input, no tab stop, no pointer',
    fn: async () => {
      const s = __dz.stage('13-click-opt-out.vue')
      const [def, opt] = __dz.zones('13-click-opt-out.vue')
      const defInput = def.querySelector('input[type=file]')
      const optInput = opt.querySelector('input[type=file]')
      return {
        pass:
          !!defInput &&
          !optInput &&
          !defInput.hasAttribute('tabindex') &&
          getComputedStyle(def).cursor === 'pointer' &&
          getComputedStyle(opt).cursor !== 'pointer',
        detail: `default: input=${!!defInput} tabindex=${defInput && defInput.getAttribute('tabindex')} cursor=${getComputedStyle(def).cursor} | opted-out: input=${!!optInput} cursor=${getComputedStyle(opt).cursor}`,
      }
    },
  },
  {
    demo: '13-click-opt-out.vue',
    name: 'the directive anchors the default host and leaves the opted-out host alone',
    fn: async () => {
      const [def, opt] = __dz.zones('13-click-opt-out.vue')
      // The host write is scoped to the zone whose picker is a real tab stop.
      return {
        pass: def.style.position === 'relative' && opt.style.position === '',
        detail: `default inline position="${def.style.position}" | opted-out inline position="${opt.style.position}"`,
      }
    },
  },
  {
    demo: '13-click-opt-out.vue',
    name: 'click off, drop still on: both zones accept the same drop',
    fn: async () => {
      const [def, opt] = __dz.zones('13-click-opt-out.vue')
      __dz.drop(def, [__dz.file('left.png', 'image/png')])
      __dz.drop(opt, [__dz.file('right.png', 'image/png')])
      const s = __dz.stage('13-click-opt-out.vue')
      const rows = await __dz.until(() => {
        const t = __dz.txt(s)
        return t.includes('left.png') && t.includes('right.png') ? t : null
      }, 3000)
      return { pass: !!rows, detail: rows ? 'both zones reported their drop' : `readouts: ${__dz.txt(s.querySelectorAll('.probe')[1])}` }
    },
  },
  {
    demo: '13-click-opt-out.vue',
    name: 'api.open() creates an input that is tabindex="-1" and aria-hidden',
    fn: async () => {
      const s = __dz.stage('13-click-opt-out.vue')
      const [, opt] = __dz.zones('13-click-opt-out.vue')
      let opened = 0
      const real = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () { if (this.type === 'file') opened++; else real.call(this) }
      try {
        const browse = [...s.querySelectorAll('button')].find((b) => __dz.txt(b).includes('api.open()'))
        if (!browse) return { pass: false, detail: 'no Browse button on the card' }
        browse.click()
        await __dz.sleep(200)
      } finally { HTMLInputElement.prototype.click = real }
      const input = opt.querySelector('input[type=file]')
      return {
        pass: !!input && input.getAttribute('tabindex') === '-1' && input.getAttribute('aria-hidden') === 'true' && opened === 1 && opt.style.position === '',
        detail: `input=${!!input} tabindex=${input && input.getAttribute('tabindex')} aria-hidden=${input && input.getAttribute('aria-hidden')} pickerOpens=${opened} hostPosition="${opt.style.position}"`,
      }
    },
  },
  /* --------------------------------------------------------------------- *
   *  0.1.1 — overlapping drops. The live defect this package was patched   *
   *  for. jsdom cannot see it: it needs two real requests with different   *
   *  latencies open on the same zone at the same time.                     *
   * --------------------------------------------------------------------- */
  {
    demo: '09-css-progress.vue',
    name: 'a second drop that finishes FIRST does not report the zone as done',
    fn: async () => {
      const s = __dz.stage('09-css-progress.vue')
      const z = __dz.zone('09-css-progress.vue')
      const sel = [...s.querySelectorAll('select')].find((e) => __dz.txt(e).includes('upload-slow'))
      __dz.set(sel, '/api/upload-slow')
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('slow-a.bin', 'application/octet-stream'), __dz.file('slow-b.bin', 'application/octet-stream')])
      await __dz.until(() => z.getAttribute('data-dropzone') === 'uploading', 3000)
      // Same zone, fast endpoint: this pair answers ~3s before the first pair.
      __dz.set(sel, '/api/upload')
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('fast-c.bin', 'application/octet-stream'), __dz.file('fast-d.bin', 'application/octet-stream')])
      await __dz.sleep(2200)
      const mid = {
        state: z.getAttribute('data-dropzone'),
        pending: z.style.getPropertyValue('--dropzone-files-pending'),
      }
      const settled = await __dz.until(() => {
        const st = z.getAttribute('data-dropzone')
        return st === 'success' || st === 'error' ? st : null
      }, 8000)
      return {
        pass: mid.state === 'uploading' && mid.pending === '2' && settled === 'success',
        detail: `with slow-a/slow-b still open: state=${mid.state} files-pending=${mid.pending} (0.1.0 read success/0); once everything answered: ${settled}`,
      }
    },
  },
  {
    demo: '09-css-progress.vue',
    name: 'a failure in the second drop is not swallowed by the first drop settling',
    fn: async () => {
      const s = __dz.stage('09-css-progress.vue')
      const z = __dz.zone('09-css-progress.vue')
      const sel = [...s.querySelectorAll('select')].find((e) => __dz.txt(e).includes('upload-slow'))
      __dz.set(sel, '/api/upload-slow')
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('slow-a.bin', 'application/octet-stream'), __dz.file('slow-b.bin', 'application/octet-stream')])
      await __dz.until(() => z.getAttribute('data-dropzone') === 'uploading', 3000)
      __dz.set(sel, '/api/upload-fail')
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('doomed.bin', 'application/octet-stream')])
      await __dz.sleep(1400)
      const mid = {
        state: z.getAttribute('data-dropzone'),
        pending: z.style.getPropertyValue('--dropzone-files-pending'),
      }
      const final = await __dz.until(() => (z.getAttribute('data-dropzone') === 'error' ? 'error' : null), 8000)
      return {
        pass: mid.state === 'uploading' && mid.pending === '2' && final === 'error',
        detail: `doomed.bin 500s while slow-a/slow-b are open: state=${mid.state} files-pending=${mid.pending}; after everything answered: ${final ?? z.getAttribute('data-dropzone')}`,
      }
    },
  },
  {
    demo: '09-css-progress.vue',
    name: 'DZ-4: a rejected drop clears progress vars left by a settled batch',
    fn: async () => {
      const s = __dz.stage('09-css-progress.vue')
      const z = __dz.zone('09-css-progress.vue')
      const sel = [...s.querySelectorAll('select')].find((e) => __dz.txt(e).includes('upload-slow'))
      __dz.set(sel, '/api/upload-fail')
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('boom.bin', 'application/octet-stream')])
      const errored = await __dz.until(() => z.getAttribute('data-dropzone') === 'error', 6000)
      const held = z.style.getPropertyValue('--dropzone-files-pending')
      const heldProgress = z.style.getPropertyValue('--dropzone-progress')
      // Now reject a drop. Nothing uploaded, so nothing may still be reported.
      const size = s.querySelector('input[type=number]')
      __dz.set(size, 1)
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('huge.bin', 'application/octet-stream', 64 * 1024)])
      await __dz.until(() => z.getAttribute('data-dropzone') === 'rejected', 3000)
      const during = {
        state: z.getAttribute('data-dropzone'),
        progress: z.style.getPropertyValue('--dropzone-progress'),
        pending: z.style.getPropertyValue('--dropzone-files-pending'),
      }
      // …and the auto-clear hands back to the sticky error, not to idle.
      const back = await __dz.until(() => (z.getAttribute('data-dropzone') === 'error' ? 'error' : null), 4000)
      return {
        pass: !!errored && held === '0' && heldProgress !== '' && during.state === 'rejected' && during.progress === '' && during.pending === '' && back === 'error',
        detail: `reached error=${!!errored}, held progress="${heldProgress}" pending="${held}"; on rejected: state=${during.state} progress="${during.progress}" pending="${during.pending}" (0.1.0 kept both); auto-clear returned to ${back ?? z.getAttribute('data-dropzone')}`,
      }
    },
  },
  {
    demo: '05-url-upload.vue',
    name: 'a throwing headers() reports through onError instead of wedging at uploading',
    fn: async () => {
      const s = __dz.stage('05-url-upload.vue')
      const z = __dz.zone('05-url-upload.vue')
      const box = __dz.label('05-url-upload.vue', 'token refresh throws').querySelector('input[type=checkbox]')
      __dz.set(box, true)
      await __dz.sleep(250)
      __dz.drop(z, [__dz.file('one.bin', 'application/octet-stream'), __dz.file('two.bin', 'application/octet-stream')])
      const log = await __dz.until(() => {
        const t = __dz.txt(s.querySelector('.pg-log'))
        return t.includes('token refresh failed') ? t : null
      }, 6000)
      const state = z.getAttribute('data-dropzone')
      const both = !!log && log.includes('one.bin') && log.includes('two.bin')
      return {
        pass: both && state === 'error',
        detail: `state=${state}; log=${log || '— nothing logged (0.1.0: the throw escaped the drop listener) —'}`,
      }
    },
  },
  {
    demo: '08-auto-upload-queue.vue',
    name: 'cancel(file) removes a queued file and leaves the zone alone',
    fn: async () => {
      const s = __dz.stage('08-auto-upload-queue.vue')
      const z = __dz.zone('08-auto-upload-queue.vue')
      __dz.drop(z, [__dz.file('keep.bin', 'application/octet-stream'), __dz.file('drop-me.bin', 'application/octet-stream')])
      const queued = await __dz.until(() => {
        const rows = [...s.querySelectorAll('.queue li')]
        return rows.length === 2 ? rows.map((r) => __dz.txt(r.querySelector('.name'))) : null
      }, 4000)
      const stateBefore = z.getAttribute('data-dropzone')
      const row = [...s.querySelectorAll('.queue li')].find((r) => __dz.txt(r).includes('drop-me.bin'))
      const remove = [...row.querySelectorAll('button')].find((b) => __dz.txt(b) === 'remove')
      remove.click()
      const after = await __dz.until(() => {
        const rows = [...s.querySelectorAll('.queue li')]
        return rows.length === 1 ? rows.map((r) => __dz.txt(r.querySelector('.name'))) : null
      }, 3000)
      return {
        pass: !!queued && !!after && after[0] === 'keep.bin' && z.getAttribute('data-dropzone') === stateBefore,
        detail: `queued=[${queued}] → after remove=[${after}] (0.1.0: cancel(pending) was a silent no-op); state ${stateBefore} → ${z.getAttribute('data-dropzone')}`,
      }
    },
  },
]

/** What demo 12 reports after a folder landed on it. */
const FOLDER_RESULT = `(async () => {
  const s = __dz.stage('12-folder-drop.vue')
  await __dz.until(() => s.querySelector('.files li') || s.querySelector('.bad'), 8000)
  await __dz.sleep(300)
  return {
    names: [...s.querySelectorAll('.files li')].map((li) => __dz.txt(li)),
    rejected: __dz.txt(s.querySelector('.bad')),
    summary: __dz.txt(s.querySelector('.result .pg-kv')),
  }
})()`


/**
 * A real Tab, through Chrome's own input pipeline. The DOM-level alternative
 * does not exist: there is no way to *dispatch* a focus move, only to call
 * `focus()`, and `focus()` cannot prove what the browser does with the tab
 * order or with the scroll position on its own.
 */
async function pressTab({ cdp, sessionId }) {
  const key = { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' }
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key }, sessionId)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key }, sessionId)
  await sleep(250)
}

/** A trusted left click at an element's centre — not `el.click()`. */
async function realClick({ page, cdp, sessionId }, locator) {
  const box = await page.evaluate(`(() => {
    const el = ${locator}
    if (!el) throw new Error('nothing to click for ' + ${JSON.stringify(locator)})
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 }, sessionId)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 }, sessionId)
  await sleep(250)
}

/**
 * Count real file-chooser openings. `HTMLInputElement.prototype.click` reads
 * ZERO for keyboard activation — native Enter on a file input does not route
 * through the DOM `click()` method — so `Page.fileChooserOpened` is the only
 * signal that covers both routes. Interception also stops a click on a zone
 * hanging the tab behind a modal OS dialog.
 */
async function watchFileChooser({ cdp, sessionId }) {
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId)
  const state = { opens: 0 }
  cdp.on('Page.fileChooserOpened', (_p, sid) => { if (sid === sessionId) state.opens++ })
  return state
}

const NATIVE_CHECKS = [
  {
    demo: '12-folder-drop.vue',
    name: 'a real folder is walked recursively and flattened',
    async run(ctx) {
      await dragPathOnto(ctx, '12-folder-drop.vue', fixtureTree().album)
      const out = await ctx.page.evaluate(FOLDER_RESULT)
      const names = out.names.join(' ')
      return {
        pass: names.includes('top.png') && names.includes('deep.png') && names.includes('notes.txt'),
        detail: `${out.summary} files=[${out.names}]`,
      }
    },
  },
  {
    demo: '12-folder-drop.vue',
    name: "accept:'image/*' filters the folder CONTENTS, not the folder",
    async run(ctx) {
      await ctx.page.evaluate(`(async () => {
        __dz.set(__dz.label('12-folder-drop.vue', "accept: 'image/*'").querySelector('input[type=checkbox]'), true)
        await __dz.sleep(150)
      })()`)
      await dragPathOnto(ctx, '12-folder-drop.vue', fixtureTree().album)
      const out = await ctx.page.evaluate(FOLDER_RESULT)
      const names = out.names.join(' ')
      return {
        pass:
          names.includes('top.png') &&
          names.includes('deep.png') &&
          !names.includes('notes.txt') &&
          out.rejected.includes('type'),
        detail: `files=[${out.names}] rejected="${out.rejected}"`,
      }
    },
  },
  {
    demo: '12-folder-drop.vue',
    name: 'maxCount rejects the whole drop based on flattened contents',
    async run(ctx) {
      await ctx.page.evaluate(`(async () => {
        __dz.set(__dz.stage('12-folder-drop.vue').querySelector('input[type=number]'), 2)
        await __dz.sleep(150)
      })()`)
      await dragPathOnto(ctx, '12-folder-drop.vue', fixtureTree().album)
      const out = await ctx.page.evaluate(FOLDER_RESULT)
      return {
        pass: out.rejected.includes('count') && out.names.length === 0,
        detail: `rejected="${out.rejected}" files=[${out.names}]`,
      }
    },
  },
  {
    demo: '13-click-opt-out.vue',
    name: 'DZ-3: a real Tab into a zone far down the page does not scroll the page away from it',
    async run(ctx) {
      // The regression this pins moved `scrollY` 5535 -> 656 on a static host,
      // leaving the zone 5722px below the fold — on the bare binding, in dist,
      // with `smoke` green. The last card on the tab is the worst case: the
      // further the zone is from the initial containing block, the bigger the
      // jump.
      const before = await ctx.page.evaluate(`(() => {
        const stage = __dz.stage('13-click-opt-out.vue')
        const zone = stage.querySelector('.dz--click')
        const input = zone.querySelector('input[type=file]')
        if (!input) throw new Error('the default zone on card 13 has no picker input')
        zone.scrollIntoView({ block: 'center' })
        // Focus the tab stop immediately before the picker, so ONE Tab lands
        // on it — and do it without scrolling, or the setup moves the page
        // the assertion is about.
        const all = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => el.getClientRects().length > 0 || el === input)
        const i = all.indexOf(input)
        if (i < 1) throw new Error('picker input is not in the focusable order (i=' + i + ')')
        all[i - 1].focus({ preventScroll: true })
        const r = zone.getBoundingClientRect()
        return { scrollY: Math.round(window.scrollY), zoneTop: Math.round(r.top), prev: all[i - 1].tagName + ':' + (all[i - 1].textContent || '').trim().slice(0, 18) }
      })()`)
      await pressTab(ctx)
      const after = await ctx.page.evaluate(`(() => {
        const zone = __dz.stage('13-click-opt-out.vue').querySelector('.dz--click')
        const r = zone.getBoundingClientRect()
        const a = document.activeElement
        return {
          scrollY: Math.round(window.scrollY),
          zoneTop: Math.round(r.top),
          inView: r.bottom > 0 && r.top < window.innerHeight,
          onPicker: !!a && a.type === 'file' && zone.contains(a),
          focusWithin: zone.matches(':focus-within'),
        }
      })()`)
      const moved = Math.abs(after.scrollY - before.scrollY)
      return {
        pass: after.onPicker && after.inView && after.focusWithin && moved <= 2,
        detail: `tabbed from ${before.prev}: scrollY ${before.scrollY} -> ${after.scrollY} (moved ${moved}px), zoneTop ${before.zoneTop} -> ${after.zoneTop}, inView=${after.inView}, focus on picker=${after.onPicker}, :focus-within=${after.focusWithin}`,
      }
    },
  },
  {
    demo: '04-paste.vue',
    name: "DZ-2: a real click on a pasteOn:'host' zone leaves focus inside it (and still browses)",
    async run(ctx) {
      const chooser = await watchFileChooser(ctx)
      await ctx.page.evaluate(`(async () => {
        __dz.set(__dz.stage('04-paste.vue').querySelector('select'), 'host')
        await __dz.sleep(200)
      })()`)
      const opens = chooser.opens
      await realClick(ctx, "__dz.zone('04-paste.vue')")
      const out = await ctx.page.evaluate(`(() => {
        const z = __dz.zone('04-paste.vue')
        const a = document.activeElement
        return {
          active: a ? a.tagName + (a.type ? '[' + a.type + ']' : '') : null,
          onPicker: !!a && a.type === 'file' && z.contains(a),
          focusWithin: z.matches(':focus-within'),
          armed: __dz.txt(z).includes('⌘V lands here'),
        }
      })()`)
      return {
        pass: out.onPicker && out.focusWithin && out.armed && chooser.opens - opens === 1,
        detail: `activeElement=${out.active} inZone=${out.onPicker} :focus-within=${out.focusWithin} chip="armed"=${out.armed} fileChoosers opened by the click=${chooser.opens - opens}`,
      }
    },
  },
  {
    demo: '04-paste.vue',
    name: "DZ-2: after that click a REAL ⌘V with a PNG on the clipboard reaches the host listener",
    async run(ctx) {
      await watchFileChooser(ctx)
      await ctx.cdp.send('Browser.grantPermissions', {
        origin: BASE_ORIGIN,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      })
      await ctx.page.evaluate(`(async () => {
        __dz.set(__dz.stage('04-paste.vue').querySelector('select'), 'host')
        await __dz.sleep(200)
      })()`)
      const seeded = await ctx.page.evaluate(`(async () => {
        const c = document.createElement('canvas'); c.width = 8; c.height = 8
        c.getContext('2d').fillRect(0, 0, 8, 8)
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        return blob.size
      })()`)
      await realClick(ctx, "__dz.zone('04-paste.vue')")
      const key = { windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, key: 'v', code: 'KeyV', modifiers: 4 }
      await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'v', commands: ['paste'], ...key }, ctx.sessionId)
      await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key }, ctx.sessionId)
      await sleep(600)
      const shots = await ctx.page.evaluate(`__dz.stage('04-paste.vue').querySelectorAll('.shots img').length`)
      return {
        pass: shots > 0,
        detail: `clipboard seeded with a ${seeded}-byte PNG; previews rendered after ⌘V: ${shots}`,
      }
    },
  },
  {
    demo: '13-click-opt-out.vue',
    name: 'DZ-2: a real click browses on the default zone and does nothing on the opted-out one',
    async run(ctx) {
      const chooser = await watchFileChooser(ctx)
      const beforeDefault = chooser.opens
      await realClick(ctx, "__dz.stage('13-click-opt-out.vue').querySelector('.dz--click')")
      const afterDefault = chooser.opens
      await realClick(ctx, "__dz.zones('13-click-opt-out.vue')[1]")
      const afterOptOut = chooser.opens
      const seen = await ctx.page.evaluate(`(() => {
        const opt = __dz.zones('13-click-opt-out.vue')[1]
        const t = __dz.txt(__dz.stage('13-click-opt-out.vue'))
        return { optInput: !!opt.querySelector('input[type=file]'), sawClicks: t.includes('host clicks seen') }
      })()`)
      return {
        pass: afterDefault - beforeDefault === 1 && afterOptOut - afterDefault === 0 && !seen.optInput,
        detail: `choosers: default click opened ${afterDefault - beforeDefault}, opted-out click opened ${afterOptOut - afterDefault}; opted-out zone still has no picker input=${!seen.optInput}`,
      }
    },
  },
]

export default {
  library: 'v-dropzone',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
  cleanup() {
    if (fixture) rmSync(fixture.root, { recursive: true, force: true })
    fixture = null
  },
}
