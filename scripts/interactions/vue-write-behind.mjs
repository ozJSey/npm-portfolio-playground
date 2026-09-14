/**
 * Interaction checks for the `vue-write-behind` tab.
 *
 * The flagship claim — **the cell does not jump** — is the one thing no unit
 * test in the package can make, so it is checked here the only honest way: with
 * real key events through the browser's own input pipeline (`nativeChecks`
 * below), sampling the live `<input>.value` after every keystroke and all the
 * way through the slow server's answer landing.
 *
 * Everything else is driven synthetically, because those cards are about the
 * store's arrays and the request log rather than about the keyboard.
 */
import { setTimeout as sleep } from 'node:timers/promises'

const PRELUDE = `
window.__wb = {
  /** The text of the first .pg-chip on the card whose label starts with \`prefix\`. */
  chip(file, prefix) {
    const el = [...__pg.stage(file).querySelectorAll('.pg-chip')].find(
      (c) => __pg.txt(c).startsWith(prefix),
    )
    return el ? __pg.txt(el).slice(prefix.length).trim() : null
  },
  /** Same, for the .pg-kv lines. */
  kv(file, prefix) {
    const el = [...__pg.stage(file).querySelectorAll('.pg-kv')].find(
      (p) => __pg.txt(p).startsWith(prefix),
    )
    return el ? __pg.txt(el).slice(prefix.length).trim() : null
  },
  /** Request log \`index\` on the card, whitespace-collapsed. */
  log(file, index) {
    const pres = __pg.stage(file).querySelectorAll('pre.pg-log')
    return __pg.txt(pres[index || 0])
  },
  inputs(file) { return [...__pg.stage(file).querySelectorAll('input')] },
  /** Type into a demo input the way v-model sees it. */
  async type(file, index, value) {
    const el = this.inputs(file)[index]
    el.focus()
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    await __pg.sleep(30)
  },
}
'ready'
`

/** Real keyDown/keyUp through Chrome, one character at a time. */
async function typeKeys(ctx, text, { perKey = 45, afterEach } = {}) {
  for (const character of text) {
    await ctx.cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', text: character, unmodifiedText: character, key: character },
      ctx.sessionId,
    )
    await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character }, ctx.sessionId)
    await sleep(perKey)
    if (afterEach) await afterEach()
  }
}

const NO_JUMP = '01-no-jump.vue'

const NATIVE_CHECKS = [
  {
    demo: NO_JUMP,
    name: 'real keystrokes during an in-flight slow write never move the cell',
    async run(ctx) {
      const value = () => ctx.page.evaluate(`__wb.inputs('${NO_JUMP}')[0].value`)
      // A full page reload mid-check (Vite re-optimizing, or a watched library
      // source changing under the run) would reset the card's counters and make
      // this read as a pass on an empty card. Stamp the document and check the
      // stamp survived — see `vite.config.ts` on mid-session re-optimization.
      const stamp = await ctx.page.evaluate(`window.__wbStamp = String(Math.random()); window.__wbStamp`)
      await ctx.page.evaluate(`__wb.inputs('${NO_JUMP}')[0].focus(); 'focused'`)

      const observed = new Set()
      const sample = async () => observed.add(await value())

      // Three characters, then wait past the 1000 ms flush window: the request
      // is now on the wire and the server will not answer for 1.8 s.
      await typeKeys(ctx, 'hel')
      await sleep(1300)
      const inFlight = await ctx.page.evaluate(`__wb.chip('${NO_JUMP}', 'inFlight:')`)

      // Keep typing straight through the flight, sampling after every key…
      await sample()
      await typeKeys(ctx, 'lo world', { afterEach: sample })
      // …and keep sampling while the reply lands and the second write goes out.
      for (let i = 0; i < 32; i += 1) {
        await sample()
        await sleep(120)
      }

      const stampAfter = await ctx.page.evaluate(`window.__wbStamp ?? null`)
      const final = await value()
      const verdict = await ctx.page.evaluate(
        `__pg.txt(__pg.stage('${NO_JUMP}').querySelector('.verdict'))`,
      )
      const log = await ctx.page.evaluate(`__wb.log('${NO_JUMP}')`)
      const requests = await ctx.page.evaluate(`__wb.chip('${NO_JUMP}', 'requests:')`)
      const keystrokes = await ctx.page.evaluate(`__wb.chip('${NO_JUMP}', 'keystrokes:')`)

      // The server answers in UPPERCASE, so any sample that is not what a
      // lowercase typist produced is the cell having jumped.
      const shouted = [...observed].filter((v) => v !== v.toLowerCase())

      return {
        pass:
          stampAfter === stamp &&
          inFlight === 'A1' &&
          shouted.length === 0 &&
          final === 'hello world' &&
          keystrokes === '11' &&
          requests === '2' &&
          /200 A1 -> "HEL" .* discarded/.test(log) &&
          /PUT \/cell\/A1 +"hello world"/.test(log) &&
          verdict.startsWith('no jump'),
        detail:
          `${stampAfter === stamp ? '' : 'THE PAGE RELOADED MID-CHECK — rerun on a quiet tree. '}` +
          `inFlight=${inFlight} keystrokes=${keystrokes} requests=${requests} ` +
          `final=${JSON.stringify(final)} samples=${observed.size} ` +
          `uppercased=${JSON.stringify(shouted)} verdict="${verdict}" log="${log}"`,
      }
    },
  },
  {
    demo: NO_JUMP,
    name: 'the discarded reply is received and shown while the input keeps the typed value',
    async run(ctx) {
      await ctx.page.evaluate(`__wb.inputs('${NO_JUMP}')[0].focus(); 'focused'`)
      await typeKeys(ctx, 'abc')
      // 1000 ms flush window + 1800 ms server + slack.
      await sleep(3400)
      const out = await ctx.page.evaluate(`(() => {
        const rows = [...__pg.stage('${NO_JUMP}').querySelectorAll('tbody tr')]
        const row = rows[0]
        return {
          input: row.querySelector('input').value,
          reply: __pg.txt(row.querySelector('.reply')),
          state: __pg.txt(row.querySelector('.state')),
        }
      })()`)
      return {
        pass: out.input === 'abc' && out.reply === 'ABC' && out.state === 'saved',
        detail: `input=${JSON.stringify(out.input)} reply=${JSON.stringify(out.reply)} state=${out.state}`,
      }
    },
  },
]

const CHECKS = [
  {
    demo: '02-coalescing.vue',
    name: 'keystrokes outrun requests, and the last write carries the final value',
    fn: async () => {
      __pg.button('02-coalescing.vue', 'type for me').click()
      // The phrase is 43 characters at 90 ms — about 3.9 s of continuous typing.
      await __pg.sleep(5200)
      const chips = [...__pg.stage('02-coalescing.vue').querySelectorAll('.counter')].map((c) =>
        __pg.txt(c),
      )
      const keystrokes = Number(chips[0].replace(/\D/g, ''))
      const requests = Number(chips[1].replace(/\D/g, ''))
      const field = __wb.inputs('02-coalescing.vue')[0].value
      const log = __wb.log('02-coalescing.vue')
      return {
        pass:
          keystrokes >= 40 &&
          requests >= 2 &&
          requests < keystrokes / 4 &&
          log.includes(JSON.stringify(field)),
        detail: `keystrokes=${keystrokes} requests=${requests} field=${JSON.stringify(field)} log="${log}"`,
      }
    },
  },
  {
    demo: '03-failure-and-retry.vue',
    name: 'a failing key keeps retrying, keeps its value, and never leaves pending',
    fn: async () => {
      await __wb.type('03-failure-and-retry.vue', 0, 'draft')
      await __pg.sleep(3200)
      return {
        pass:
          __wb.chip('03-failure-and-retry.vue', 'pending:') === 'note' &&
          Number(__wb.chip('03-failure-and-retry.vue', 'attempts:')) >= 2 &&
          __wb.chip('03-failure-and-retry.vue', 'failed:') === '1' &&
          __wb.inputs('03-failure-and-retry.vue')[0].value === 'draft',
        detail:
          `pending=${__wb.chip('03-failure-and-retry.vue', 'pending:')} ` +
          `attempts=${__wb.chip('03-failure-and-retry.vue', 'attempts:')} ` +
          `failed=${__wb.chip('03-failure-and-retry.vue', 'failed:')} ` +
          `input=${JSON.stringify(__wb.inputs('03-failure-and-retry.vue')[0].value)}`,
      }
    },
  },
  {
    demo: '03-failure-and-retry.vue',
    name: 'the attempt that lands carries the newest value, not the one that failed',
    fn: async () => {
      await __wb.type('03-failure-and-retry.vue', 0, 'draft')
      await __pg.sleep(1600)
      await __wb.type('03-failure-and-retry.vue', 0, 'draft-v2')
      __pg.button('03-failure-and-retry.vue', 'server:').click()
      __pg.button('03-failure-and-retry.vue', 'retry()').click()
      await __pg.sleep(2200)
      const failedValue = __wb.kv('03-failure-and-retry.vue', 'value that first failed:')
      const acceptedValue = __wb.kv(
        '03-failure-and-retry.vue',
        'value the accepted attempt carried:',
      )
      return {
        pass:
          failedValue === 'draft' &&
          acceptedValue === 'draft-v2' &&
          __wb.chip('03-failure-and-retry.vue', 'pending:') === 'none',
        detail: `firstFailed=${failedValue} accepted=${acceptedValue} pending=${__wb.chip('03-failure-and-retry.vue', 'pending:')}`,
      }
    },
  },
  {
    demo: '04-retry-false.vue',
    name: 'retry: false stops attempting but keeps the key pending with no retryAt',
    fn: async () => {
      await __wb.type('04-retry-false.vue', 0, 'parked')
      await __pg.sleep(4200)
      const boxes = [...__pg.stage('04-retry-false.vue').querySelectorAll('.pg-box')]
      const read = (box, prefix) => {
        const el = [...box.querySelectorAll('.pg-kv')].find((p) => __pg.txt(p).startsWith(prefix))
        return el ? __pg.txt(el).slice(prefix.length).trim() : null
      }
      const parkedAttempts = Number(read(boxes[0], 'attempts made:'))
      const persistentAttempts = Number(read(boxes[1], 'attempts made:'))
      return {
        pass:
          parkedAttempts === 1 &&
          persistentAttempts >= 2 &&
          read(boxes[0], 'pending:') === 'note' &&
          read(boxes[0], 'failed[0].retryAt:') === 'undefined — nothing scheduled' &&
          read(boxes[1], 'failed[0].retryAt:') !== 'undefined — nothing scheduled',
        detail:
          `parked attempts=${parkedAttempts} pending=${read(boxes[0], 'pending:')} ` +
          `retryAt=${read(boxes[0], 'failed[0].retryAt:')} | default attempts=${persistentAttempts} ` +
          `retryAt=${read(boxes[1], 'failed[0].retryAt:')}`,
      }
    },
  },
  {
    demo: '04-retry-false.vue',
    name: "retry('note') re-arms a parked key",
    fn: async () => {
      await __wb.type('04-retry-false.vue', 0, 'parked')
      await __pg.sleep(2200)
      const boxes = [...__pg.stage('04-retry-false.vue').querySelectorAll('.pg-box')]
      const attempts = () =>
        Number(
          __pg
            .txt([...boxes[0].querySelectorAll('.pg-kv')][0])
            .replace('attempts made:', '')
            .trim(),
        )
      const before = attempts()
      __pg.button('04-retry-false.vue', "retry('note')").click()
      await __pg.sleep(1600)
      const after = attempts()
      return {
        pass: before === 1 && after === 2,
        detail: `attempts before=${before} after=${after}`,
      }
    },
  },
  {
    demo: '05-live-state.vue',
    name: 'pending / inFlight / failed / isSyncing track three endpoints independently',
    fn: async () => {
      await __wb.type('05-live-state.vue', 0, 'a')
      await __wb.type('05-live-state.vue', 1, 'b')
      await __wb.type('05-live-state.vue', 2, 'c')
      // 1 s window + the fast (300 ms) and broken (400 ms) endpoints answering,
      // with the slow (3 s) one still out.
      await __pg.sleep(2000)
      const row = (label) => {
        const th = [...__pg.stage('05-live-state.vue').querySelectorAll('.store th')].find((t) =>
          __pg.txt(t).startsWith(label),
        )
        return th ? __pg.txt(th.nextElementSibling) : null
      }
      const banner = __pg.txt(__pg.stage('05-live-state.vue').querySelector('.banner'))
      return {
        pass:
          row('inFlight') === 'slow' &&
          row('isSyncing') === 'true' &&
          row('pending').includes('slow') &&
          row('pending').includes('broken') &&
          !row('pending').includes('fast') &&
          row('failed').startsWith('broken ×') &&
          banner.includes('unsaved change'),
        detail: `pending=[${row('pending')}] inFlight=[${row('inFlight')}] failed=[${row('failed')}] isSyncing=${row('isSyncing')} banner="${banner}"`,
      }
    },
  },
  {
    demo: '06-batch.vue',
    name: 'three edits become three per-key requests and exactly one batched call',
    fn: async () => {
      __pg.button('06-batch.vue', 'fill all three').click()
      await __pg.sleep(2000)
      const perKey = __wb.log('06-batch.vue', 0)
      const batch = __wb.log('06-batch.vue', 1)
      const puts = (perKey.match(/PUT \/cell\//g) || []).length
      const patches = (batch.match(/PATCH \/cells/g) || []).length
      return {
        pass:
          puts === 3 &&
          patches === 1 &&
          /"C1":/.test(batch) &&
          /"C2":/.test(batch) &&
          /"C3":/.test(batch) &&
          /207 failed: C3/.test(batch) &&
          /422 C3 rejected/.test(perKey),
        detail: `PUTs=${puts} PATCHes=${patches} batch="${batch}"`,
      }
    },
  },
  {
    demo: '06-batch.vue',
    name: 'only the rejected key stays pending on both sides',
    fn: async () => {
      __pg.button('06-batch.vue', 'fill all three').click()
      await __pg.sleep(2200)
      const boxes = [...__pg.stage('06-batch.vue').querySelectorAll('.pg-box')]
      const chip = (box, prefix) => {
        const el = [...box.querySelectorAll('.pg-chip')].find((c) => __pg.txt(c).startsWith(prefix))
        return el ? __pg.txt(el).slice(prefix.length).trim() : null
      }
      return {
        pass:
          chip(boxes[0], 'pending:') === 'C3' &&
          chip(boxes[1], 'pending:') === 'C3' &&
          chip(boxes[0], 'failed:') === 'C3' &&
          chip(boxes[1], 'failed:') === 'C3',
        detail:
          `per-key pending=${chip(boxes[0], 'pending:')} failed=${chip(boxes[0], 'failed:')} | ` +
          `batch pending=${chip(boxes[1], 'pending:')} failed=${chip(boxes[1], 'failed:')}`,
      }
    },
  },
  {
    demo: '07-discard.vue',
    name: 'neither a failing endpoint nor deleting the key drops the write — discard() does',
    fn: async () => {
      await __wb.type('07-discard.vue', 0, 'kept')
      await __pg.sleep(1800)
      const afterFailure = __wb.chip('07-discard.vue', 'pending:')

      __pg.button('07-discard.vue', 'delete draft.note').click()
      await __pg.sleep(400)
      const afterDelete = __wb.chip('07-discard.vue', 'pending:')

      __pg.button('07-discard.vue', "discard('note')").click()
      await __pg.sleep(300)
      const afterDiscard = __wb.chip('07-discard.vue', 'pending:')

      return {
        pass:
          afterFailure === 'note' && afterDelete === 'note' && afterDiscard === 'none',
        detail: `pending after failure=${afterFailure}, after delete=${afterDelete}, after discard=${afterDiscard}`,
      }
    },
  },
  {
    demo: '07-discard.vue',
    name: 'discarding an in-flight key frees it at once and the orphan reply changes nothing',
    fn: async () => {
      await __wb.type('07-discard.vue', 1, 'slowly')
      const inFlight = await __pg.until(
        () => (__wb.chip('07-discard.vue', 'inFlight:') === 'slow' ? 'slow' : null),
        4000,
      )
      __pg.button('07-discard.vue', "discard('slow')").click()
      await __pg.sleep(300)
      const afterDiscard = {
        pending: __wb.chip('07-discard.vue', 'pending:'),
        inFlight: __wb.chip('07-discard.vue', 'inFlight:'),
      }
      // Let the orphaned request answer.
      await __pg.sleep(3200)
      const log = __wb.log('07-discard.vue')
      return {
        pass:
          inFlight === 'slow' &&
          afterDiscard.pending === 'none' &&
          afterDiscard.inFlight === 'none' &&
          /200 slow/.test(log) &&
          __wb.chip('07-discard.vue', 'pending:') === 'none',
        detail:
          `inFlight before=${inFlight} | after discard pending=${afterDiscard.pending} ` +
          `inFlight=${afterDiscard.inFlight} | after the reply pending=${__wb.chip('07-discard.vue', 'pending:')} log="${log}"`,
      }
    },
  },
  {
    demo: '08-interval-and-debounce.vue',
    name: 'the fixed window keeps saving while the debounced key waits for a pause',
    fn: async () => {
      const writes = (index) => {
        const box = [...__pg.stage('08-interval-and-debounce.vue').querySelectorAll('.pg-box')][index]
        const chip = [...box.querySelectorAll('.pg-chip')].find((c) =>
          __pg.txt(c).startsWith('writes:'),
        )
        return Number(__pg.txt(chip).replace(/\D/g, ''))
      }
      __pg.button('08-interval-and-debounce.vue', 'type without pausing').click()
      await __pg.sleep(4500)
      const duringWindowed = writes(0)
      const duringQuiet = writes(1)
      __pg.button('08-interval-and-debounce.vue', 'stop').click()
      await __pg.sleep(1600)
      const afterQuiet = writes(1)
      return {
        pass: duringWindowed >= 3 && duringQuiet === 0 && afterQuiet === 1,
        detail: `while typing: interval=${duringWindowed} debounce=${duringQuiet}; after stopping: debounce=${afterQuiet}`,
      }
    },
  },
  {
    demo: '09-keys-filter.vue',
    name: 'an excluded key never queues on its own, and set() queues it anyway',
    fn: async () => {
      await __wb.type('09-keys-filter.vue', 0, 'a title')
      await __wb.type('09-keys-filter.vue', 2, '150')
      await __pg.sleep(400)
      const beforeSet = __wb.chip('09-keys-filter.vue', 'pending:')
      __pg.button('09-keys-filter.vue', "set('ui:zoom'").click()
      await __pg.sleep(300)
      const afterSet = __wb.chip('09-keys-filter.vue', 'pending:')
      await __pg.sleep(1400)
      const log = __wb.log('09-keys-filter.vue')
      return {
        pass:
          beforeSet === 'title' &&
          afterSet.includes('ui:zoom') &&
          /ui:zoom = "150"/.test(log),
        detail: `pending before set()=${beforeSet}, after=${afterSet}, log="${log}"`,
      }
    },
  },
  {
    demo: '10-equals-and-set.vue',
    name: 'equals suppresses an equivalent replacement; neither comparator sees an in-place mutation',
    fn: async () => {
      const writes = (index) => {
        const box = [...__pg.stage('10-equals-and-set.vue').querySelectorAll('.pg-box')][index]
        const chip = [...box.querySelectorAll('.pg-chip')].find((c) =>
          __pg.txt(c).startsWith('writes:'),
        )
        return Number(__pg.txt(chip).replace(/\D/g, ''))
      }
      // The card's own order, which is also the only order the matrix claims:
      // each step starts from a value both comparators agree is current.
      __pg.button('10-equals-and-set.vue', 'in place').click()
      await __pg.sleep(1500)
      const inPlace = [writes(0), writes(1)]

      __pg.button('10-equals-and-set.vue', 'replace with an equivalent object').click()
      await __pg.sleep(1500)
      const equivalent = [writes(0), writes(1)]

      __pg.button('10-equals-and-set.vue', "set('bio'").click()
      await __pg.sleep(1500)
      const afterSet = [writes(0), writes(1)]

      __pg.button('10-equals-and-set.vue', 'replace with a different object').click()
      await __pg.sleep(1500)
      const different = [writes(0), writes(1)]

      return {
        pass:
          inPlace[0] === 0 &&
          inPlace[1] === 0 &&
          equivalent[0] === 1 &&
          equivalent[1] === 0 &&
          afterSet[0] === 2 &&
          afterSet[1] === 1 &&
          different[0] === 3 &&
          different[1] === 2,
        detail:
          `[default, custom] after in-place=${inPlace} after equivalent=${equivalent} ` +
          `after set()=${afterSet} after different=${different}`,
      }
    },
  },
  {
    demo: '11-flush-and-tab-hide.vue',
    name: 'flush() sends immediately and resolves; the interval alone sends nothing',
    fn: async () => {
      await __wb.type('11-flush-and-tab-hide.vue', 0, 'unsent')
      await __pg.sleep(1800)
      const idle = [__wb.log('11-flush-and-tab-hide.vue', 0), __wb.log('11-flush-and-tab-hide.vue', 1)]

      __pg.button('11-flush-and-tab-hide.vue', 'flush() the left one').click()
      await __pg.sleep(1200)
      const left = __wb.log('11-flush-and-tab-hide.vue', 0)
      const right = __wb.log('11-flush-and-tab-hide.vue', 1)
      const resolved = __wb.kv('11-flush-and-tab-hide.vue', 'flush() called at')

      return {
        pass:
          idle[0].startsWith('nothing sent yet') &&
          idle[1].startsWith('nothing sent yet') &&
          /PUT draft "unsent"/.test(left) &&
          /200 draft/.test(left) &&
          right.startsWith('nothing sent yet') &&
          resolved !== null,
        detail: `idle=${JSON.stringify(idle)} left="${left}" right="${right}" resolved="${resolved}"`,
      }
    },
  },
  {
    demo: '11-flush-and-tab-hide.vue',
    name: "flush('unload') hands the writer final: true — the flag keepalive hangs off",
    fn: async () => {
      await __wb.type('11-flush-and-tab-hide.vue', 0, 'last-keystroke')
      __pg.button('11-flush-and-tab-hide.vue', "flush('unload')").click()
      await __pg.sleep(1200)
      const left = __wb.log('11-flush-and-tab-hide.vue', 0)
      const right = __wb.log('11-flush-and-tab-hide.vue', 1)

      return {
        pass:
          /PUT draft "last-keystroke" reason=unload final=true attempt=1/.test(left) &&
          right.startsWith('nothing sent yet'),
        detail: `left="${left}" right="${right}"`,
      }
    },
  },
]

export default {
  library: 'vue-write-behind',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
