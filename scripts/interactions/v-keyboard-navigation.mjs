/**
 * v-keyboard-navigation interaction spec.
 *
 * Everything this library does happens in response to a key, and the thing it
 * exists for — the scroll — has no layout in jsdom to move. So almost every
 * check here is a `nativeCheck` driving Chrome's own input pipeline with
 * `Input.dispatchKeyEvent`: a synthetic `new KeyboardEvent('keydown')` cannot
 * move focus with Tab, cannot check a radio, and cannot make the user agent
 * perform its own focus scroll — which is the exact behaviour card 04 is
 * measured against.
 *
 * The wedge check reads `scrollTop` back out of the live pane after every
 * keystroke and compares the two traces:
 *
 *   controlled   0,0,0,0,40,80,120,160,…   one row per key
 *   native       0,0,0,0,120,120,120,240,… the UA centres, three rows a jump
 */

const KEYS = {
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
}

/** One real key press through the browser's input pipeline. */
async function press(ctx, name, times = 1) {
  const spec = KEYS[name]
  for (let i = 0; i < times; i++) {
    if (spec) {
      const base = {
        key: spec.key,
        code: spec.code,
        windowsVirtualKeyCode: spec.keyCode,
        nativeVirtualKeyCode: spec.keyCode,
      }
      await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, ctx.sessionId)
      await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, ctx.sessionId)
    } else {
      // A printable character: `text` is what makes it a real typed key.
      const upper = name.toUpperCase()
      const base = {
        key: name,
        code: `Key${upper}`,
        text: name,
        unmodifiedText: name,
        windowsVirtualKeyCode: upper.charCodeAt(0),
        nativeVirtualKeyCode: upper.charCodeAt(0),
      }
      await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, ctx.sessionId)
      await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, ctx.sessionId)
    }
    await ctx.page.evaluate('new Promise((r) => requestAnimationFrame(() => r(1)))')
  }
}

const PRELUDE = `
window.__kn = Object.assign(Object.create(window.__pg), {
  items(file) { return [...this.stage(file).querySelectorAll('[data-keyboard-navigation-item]')] },
  host(file) { return this.stage(file).querySelector('[data-keyboard-navigation-state]') },
  /** Real DOM focus, which is what a click or a Tab would produce. */
  focusItem(file, index) {
    const el = this.items(file)[index]
    if (!el) throw new Error('no item ' + index + ' in ' + file)
    el.focus()
    return el
  },
  activeLabel() { return this.txt(document.activeElement) },
  marked(file) { return this.txt(this.stage(file).querySelector('[data-keyboard-navigation-item="active"]')) },
  tabbable(file) { return [...this.stage(file).querySelectorAll('[tabindex="0"]')] },
})
'ready'
`

/** Step sizes in a scrollTop trace, as rendered by card 04. */
const readTrace = (file) => `(() => {
  const text = __kn.txt(__kn.stage('${file}').querySelector('.trace'))
  const nums = text === '—' ? [] : text.split(',').map((n) => Number(n.trim()))
  const steps = nums.slice(1).map((n, i) => n - nums[i])
  return { nums, steps, max: steps.length ? Math.max(...steps) : 0 }
})()`

const NATIVE_CHECKS = [
  // -------------------------------------------------------------------------
  // 04 — the wedge, measured
  // -------------------------------------------------------------------------
  {
    demo: '04-listbox-scroll.vue',
    name: 'controlled scroll follows the focus ring one 40px row per key',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('04-listbox-scroll.vue', 0)`)
      await press(ctx, 'ArrowDown', 12)
      const out = await ctx.page.evaluate(readTrace('04-listbox-scroll.vue'))
      const moved = out.steps.filter((s) => s > 0)
      return {
        pass: out.nums.length === 12 && out.max === 40 && moved.length >= 6,
        detail: `trace=[${out.nums}] maxStep=${out.max}`,
      }
    },
  },
  {
    demo: '04-listbox-scroll.vue',
    name: "the browser's own focus scroll centres instead — three rows a jump",
    async run(ctx) {
      await ctx.page.evaluate(`(async () => {
        const box = __kn.stage('04-listbox-scroll.vue').querySelector('input[type=checkbox]')
        __kn.set(box, false)
        await __kn.sleep(200)
        __kn.focusItem('04-listbox-scroll.vue', 0)
      })()`)
      await press(ctx, 'ArrowDown', 12)
      const out = await ctx.page.evaluate(readTrace('04-listbox-scroll.vue'))
      return {
        pass: out.max >= 100,
        detail: `native trace=[${out.nums}] maxStep=${out.max} (expected a ~120px lurch)`,
      }
    },
  },
  {
    demo: '04-listbox-scroll.vue',
    name: 'End scrolls to the last row and Home comes back to the top',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('04-listbox-scroll.vue', 0)`)
      await press(ctx, 'End')
      const bottom = await ctx.page.evaluate(`(() => {
        const pane = __kn.stage('04-listbox-scroll.vue').querySelector('.list-pane')
        return { top: Math.round(pane.scrollTop), label: __kn.activeLabel() }
      })()`)
      await press(ctx, 'Home')
      const top = await ctx.page.evaluate(`(() => {
        const pane = __kn.stage('04-listbox-scroll.vue').querySelector('.list-pane')
        return { top: Math.round(pane.scrollTop), label: __kn.activeLabel() }
      })()`)
      return {
        pass: bottom.label === 'Row 200' && bottom.top > 7000 && top.label === 'Row 1' && top.top === 0,
        detail: `End → ${bottom.label} @${bottom.top}, Home → ${top.label} @${top.top}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 01 — one tab stop, proven with a real Tab key
  // -------------------------------------------------------------------------
  {
    demo: '01-toolbar.vue',
    name: 'a real Tab leaves the whole toolbar in one press',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('01-toolbar.vue', 0)`)
      const before = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'Tab')
      const after = await ctx.page.evaluate(`(() => ({
        label: __kn.activeLabel(),
        inside: __kn.host('01-toolbar.vue').contains(document.activeElement),
      }))()`)
      return {
        pass: before === 'Bold' && !after.inside,
        detail: `Tab from "${before}" landed on "${after.label}" (inside toolbar: ${after.inside})`,
      }
    },
  },
  {
    demo: '01-toolbar.vue',
    name: 'arrows walk the toolbar, clamp at the end, and a letter jumps',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('01-toolbar.vue', 0)`)
      await press(ctx, 'ArrowRight', 2)
      const walked = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'ArrowRight', 9)
      const clamped = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'c')
      const typed = await ctx.page.evaluate(`__kn.activeLabel()`)
      return {
        pass: walked === 'Underline' && clamped === 'Quote' && typed === 'Code',
        detail: `2×Right=${walked}, clamped=${clamped}, typeahead "c"=${typed}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 02 / 03 — wrap, and the keys the directive must not take
  // -------------------------------------------------------------------------
  {
    demo: '02-tablist.vue',
    name: 'a tablist wraps and selection follows focus',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('02-tablist.vue', 0)`)
      await press(ctx, 'ArrowLeft')
      const out = await ctx.page.evaluate(`(() => ({
        label: __kn.activeLabel(),
        selected: __kn.txt(__kn.stage('02-tablist.vue').querySelector('[aria-selected="true"]')),
        panel: __kn.txt(__kn.stage('02-tablist.vue').querySelector('[role=tabpanel] strong')),
      }))()`)
      return {
        pass: out.label === 'Changelog' && out.selected === 'Changelog' && out.panel === 'Changelog',
        detail: `wrapped to ${out.label}; panel=${out.panel}`,
      }
    },
  },
  {
    demo: '03-menu.vue',
    name: 'Enter reaches the application; the arrows wrap the menu',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('03-menu.vue', 6)`)
      await press(ctx, 'ArrowDown')
      const wrapped = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'Enter')
      const chosen = await ctx.page.evaluate(
        `__kn.txt(__kn.stage('03-menu.vue').querySelector('.pg-kv'))`,
      )
      return {
        pass: wrapped === 'New file' && chosen === 'chosen: New file',
        detail: `wrapped to "${wrapped}"; Enter set chosen="${chosen}"`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 05 — native radios keep their own behaviour
  // -------------------------------------------------------------------------
  {
    demo: '05-radiogroup.vue',
    name: 'native radios keep the browser arrow behaviour, ARIA radios are driven',
    async run(ctx) {
      const state = await ctx.page.evaluate(`(() => {
        const groups = [...__kn.stage('05-radiogroup.vue').querySelectorAll('.group')]
        window.__g = groups
        // Start from the radio the browser considers the group's tab stop —
        // the checked one — so an arrow has somewhere to move to.
        groups[1].querySelector('input[type=radio]:checked').focus()
        return __kn.txt(groups[1])
      })()`)
      await press(ctx, 'ArrowDown')
      const native = await ctx.page.evaluate(`(() => {
        const kv = [...__kn.stage('05-radiogroup.vue').querySelectorAll('.pg-kv')]
        return __kn.txt(kv[1])
      })()`)

      await ctx.page.evaluate(`window.__g[0].querySelector('[role=radio]').focus()`)
      await press(ctx, 'ArrowDown', 2)
      const aria = await ctx.page.evaluate(`(() => {
        const kv = [...__kn.stage('05-radiogroup.vue').querySelectorAll('.pg-kv')]
        return { selected: __kn.txt(kv[0]), focused: __kn.activeLabel() }
      })()`)

      return {
        // The browser moved AND checked on the right (Medium → Large); on the
        // left focus walked Small → Medium → Large while the selection stayed
        // exactly where the application put it.
        pass: native.includes('Large') && aria.focused === 'Large' && aria.selected.includes('Medium'),
        detail: `native="${native}" | aria focus=${aria.focused} selection="${aria.selected}" (start: ${state.slice(0, 20)}…)`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 06 — typeahead with real typed characters
  // -------------------------------------------------------------------------
  {
    demo: '06-typeahead.vue',
    name: 'typing refines the match and publishes the buffer as an attribute',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('06-typeahead.vue', 0)`)
      await press(ctx, 'b')
      const first = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'l')
      const out = await ctx.page.evaluate(`(() => ({
        label: __kn.activeLabel(),
        buffer: __kn.host('06-typeahead.vue').getAttribute('data-keyboard-navigation-typeahead'),
      }))()`)
      return {
        pass: first === 'Banana' && out.label === 'Blueberry' && out.buffer === 'bl',
        detail: `"b"=${first}, "bl"=${out.label}, buffer attribute="${out.buffer}"`,
      }
    },
  },
  {
    demo: '06-typeahead.vue',
    name: 'a repeated letter cycles the matches, Escape drops the buffer',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('06-typeahead.vue', 0)`)
      await press(ctx, 'a')
      const one = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'a')
      const two = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'Escape')
      const cleared = await ctx.page.evaluate(
        `__kn.host('06-typeahead.vue').hasAttribute('data-keyboard-navigation-typeahead')`,
      )
      return {
        pass: one === 'Apricot' && two === 'Avocado' && cleared === false,
        detail: `a→${one}, a→${two}, buffer after Escape: ${cleared}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 07 — orientation, including RTL
  // -------------------------------------------------------------------------
  {
    demo: '07-wrap-and-orientation.vue',
    name: 'a listbox ignores the horizontal arrows; RTL flips the inline axis',
    async run(ctx) {
      await ctx.page.evaluate(`(async () => {
        const selects = __kn.stage('07-wrap-and-orientation.vue').querySelectorAll('select')
        __kn.set(selects[0], 'listbox')
        await __kn.sleep(250)
        __kn.focusItem('07-wrap-and-orientation.vue', 0)
      })()`)
      await press(ctx, 'ArrowRight')
      const ignored = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'ArrowDown')
      const moved = await ctx.page.evaluate(`__kn.activeLabel()`)

      await ctx.page.evaluate(`(async () => {
        const s = __kn.stage('07-wrap-and-orientation.vue')
        __kn.set(s.querySelectorAll('select')[0], 'toolbar')
        await __kn.sleep(200)
        __kn.set(s.querySelector('input[type=checkbox]'), true)
        await __kn.sleep(250)
        __kn.focusItem('07-wrap-and-orientation.vue', 0)
      })()`)
      await press(ctx, 'ArrowLeft')
      const rtl = await ctx.page.evaluate(`__kn.activeLabel()`)

      return {
        pass: ignored === '1' && moved === '2' && rtl === '2',
        detail: `listbox: Right→${ignored}, Down→${moved}; RTL toolbar: Left→${rtl}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 08 — the invariant, in a real browser
  // -------------------------------------------------------------------------
  {
    demo: '08-dynamic-list.vue',
    name: 'removing the focused row keeps focus inside the group and one tab stop',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('08-dynamic-list.vue', 1)`)
      const before = await ctx.page.evaluate(`__kn.activeLabel()`)
      await ctx.page.evaluate(`(async () => {
        __kn.button('08-dynamic-list.vue', 'Remove focused').click()
        await __kn.sleep(300)
      })()`)
      const after = await ctx.page.evaluate(`(() => ({
        label: __kn.activeLabel(),
        inside: __kn.host('08-dynamic-list.vue').contains(document.activeElement),
        tabbable: __kn.tabbable('08-dynamic-list.vue').length,
        rows: __kn.items('08-dynamic-list.vue').length,
      }))()`)
      return {
        pass: before.startsWith('Bravo') && after.inside && after.tabbable === 1 && after.rows === 3,
        detail: `removed "${before}" → focus "${after.label}" inside=${after.inside} tabbable=${after.tabbable}`,
      }
    },
  },
  {
    demo: '08-dynamic-list.vue',
    name: 'emptied and refilled: state says empty, then exactly one tab stop returns',
    async run(ctx) {
      const emptied = await ctx.page.evaluate(`(async () => {
        __kn.button('08-dynamic-list.vue', 'Remove all').click()
        await __kn.sleep(300)
        return {
          state: __kn.host('08-dynamic-list.vue').getAttribute('data-keyboard-navigation-state'),
          tabbable: __kn.tabbable('08-dynamic-list.vue').length,
        }
      })()`)
      const refilled = await ctx.page.evaluate(`(async () => {
        __kn.button('08-dynamic-list.vue', 'Refill').click()
        await __kn.sleep(300)
        return {
          state: __kn.host('08-dynamic-list.vue').getAttribute('data-keyboard-navigation-state'),
          tabbable: __kn.tabbable('08-dynamic-list.vue').length,
          readout: __kn.txt(__kn.stage('08-dynamic-list.vue').querySelector('.pg-kv')),
        }
      })()`)
      await ctx.page.evaluate(`__kn.focusItem('08-dynamic-list.vue', 0)`)
      await press(ctx, 'ArrowDown')
      const moves = await ctx.page.evaluate(`__kn.activeLabel()`)
      return {
        pass:
          emptied.state === 'empty' &&
          emptied.tabbable === 0 &&
          refilled.state === 'idle' &&
          refilled.tabbable === 1 &&
          moves.startsWith('Bravo'),
        detail: `empty→${emptied.state}/${emptied.tabbable}, refill→${refilled.state}/${refilled.tabbable} "${refilled.readout}", arrow→${moves}`,
      }
    },
  },
  {
    demo: '08-dynamic-list.vue',
    name: 'disabling the tabbable row hands its tabindex back rather than leaving two',
    async run(ctx) {
      const out = await ctx.page.evaluate(`(async () => {
        __kn.focusItem('08-dynamic-list.vue', 0)
        const first = __kn.items('08-dynamic-list.vue')[0]
        __kn.button('08-dynamic-list.vue', 'Disable focused').click()
        await __kn.sleep(300)
        return {
          tabbable: __kn.tabbable('08-dynamic-list.vue').length,
          firstTabIndex: first.getAttribute('tabindex'),
          marked: __kn.marked('08-dynamic-list.vue'),
        }
      })()`)
      return {
        pass: out.tabbable === 1 && out.firstTabIndex === null && out.marked.startsWith('Bravo'),
        detail: `tabbable=${out.tabbable} disabled-row tabindex=${out.firstTabIndex} active=${out.marked}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 09 / 10 — activedescendant, and a real page
  // -------------------------------------------------------------------------
  {
    demo: '09-activedescendant.vue',
    name: 'focus stays on the host, the pointer moves, and the list still scrolls',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.host('09-activedescendant.vue').focus()`)
      await press(ctx, 'ArrowDown', 8)
      const out = await ctx.page.evaluate(`(() => {
        const host = __kn.host('09-activedescendant.vue')
        return {
          focusIsHost: document.activeElement === host,
          pointer: host.getAttribute('aria-activedescendant'),
          marked: __kn.marked('09-activedescendant.vue'),
          scrollTop: Math.round(host.scrollTop),
          pointsAtRealItem: !!document.getElementById(host.getAttribute('aria-activedescendant')),
        }
      })()`)
      return {
        pass: out.focusIsHost && out.pointsAtRealItem && out.scrollTop > 0 && out.marked === 'Budapest',
        detail: `focus on host=${out.focusIsHost} pointer=${out.pointer} active=${out.marked} scrollTop=${out.scrollTop}`,
      }
    },
  },
  {
    demo: '10-page-keys.vue',
    name: 'PageDown moves a real visible page — six 30px lines in a 180px window',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('10-page-keys.vue', 0)`)
      await press(ctx, 'PageDown')
      const paged = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'PageUp')
      const back = await ctx.page.evaluate(`__kn.activeLabel()`)
      await ctx.page.evaluate(`(async () => {
        __kn.set(__kn.stage('10-page-keys.vue').querySelector('select'), 'fixed')
        await __kn.sleep(250)
        __kn.focusItem('10-page-keys.vue', 0)
      })()`)
      await press(ctx, 'PageDown')
      const fixed = await ctx.page.evaluate(`__kn.activeLabel()`)
      return {
        pass: paged === 'Line 7' && back === 'Line 1' && fixed === 'Line 4',
        detail: `auto PageDown→${paged}, PageUp→${back}, page:3→${fixed}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 12 — events, with the reason the move actually had
  // -------------------------------------------------------------------------
  {
    demo: '12-events-and-state.vue',
    name: 'a key move is reported once, as reason "key"',
    async run(ctx) {
      await ctx.page.evaluate(`(async () => {
        __kn.button('12-events-and-state.vue', 'Clear log').click()
        await __kn.sleep(150)
        __kn.focusItem('12-events-and-state.vue', 0)
      })()`)
      await press(ctx, 'ArrowDown')
      const out = await ctx.page.evaluate(`(() => {
        const lines = [...__kn.stage('12-events-and-state.vue').querySelectorAll('.pg-log li')]
        return {
          lines: lines.map((l) => __kn.txt(l)),
          state: __kn.host('12-events-and-state.vue').getAttribute('data-keyboard-navigation-state'),
        }
      })()`)
      const keyLines = out.lines.filter((l) => l.startsWith('key:'))
      return {
        pass: keyLines.length === 1 && keyLines[0].includes('Ada → Alan') && out.state === 'active',
        detail: `log=${JSON.stringify(out.lines)} state=${out.state}`,
      }
    },
  },
]

const CHECKS = [
  {
    demo: '11-api.vue',
    name: 'the api drives the group and reports where it landed',
    fn: async () => {
      const s = __kn.stage('11-api.vue')
      __kn.button('11-api.vue', 'last()').click()
      await __kn.sleep(150)
      const last = { focus: __kn.activeLabel(), marked: __kn.marked('11-api.vue') }
      __kn.button('11-api.vue', 'previous()').click()
      await __kn.sleep(150)
      const kv = [...s.querySelectorAll('.pg-kv')].map((k) => __kn.txt(k))
      return {
        pass: last.focus === '8' && last.marked === '8' && kv[0].includes('6') && kv[2].includes('8'),
        detail: `last()→${last.focus}, previous() readouts: ${JSON.stringify(kv)}`,
      }
    },
  },
  {
    demo: '11-api.vue',
    name: 'enabled: false gives every tabindex back and reports the state',
    fn: async () => {
      const before = __kn.tabbable('11-api.vue').length
      __kn.set(__kn.label('11-api.vue', 'enabled').querySelector('input'), false)
      await __kn.sleep(250)
      const host = __kn.host('11-api.vue')
      const after = {
        tabbable: __kn.tabbable('11-api.vue').length,
        state: host.getAttribute('data-keyboard-navigation-state'),
        anyTabIndex: [...host.querySelectorAll('button')].some((b) => b.hasAttribute('tabindex')),
      }
      return {
        pass: before === 1 && after.tabbable === 0 && after.state === 'disabled' && !after.anyTabIndex,
        detail: `before=${before} after=${JSON.stringify(after)}`,
      }
    },
  },
  {
    demo: '12-events-and-state.vue',
    name: 'a group filtered down to nothing reports empty instead of going quiet',
    fn: async () => {
      const input = __kn.stage('12-events-and-state.vue').querySelector('input.pg-input')
      __kn.set(input, 'z')
      await __kn.sleep(300)
      const empty = {
        state: __kn.host('12-events-and-state.vue').getAttribute('data-keyboard-navigation-state'),
        tabbable: __kn.tabbable('12-events-and-state.vue').length,
      }
      __kn.set(input, '')
      await __kn.sleep(300)
      const back = {
        state: __kn.host('12-events-and-state.vue').getAttribute('data-keyboard-navigation-state'),
        tabbable: __kn.tabbable('12-events-and-state.vue').length,
      }
      return {
        pass: empty.state === 'empty' && empty.tabbable === 0 && back.state === 'idle' && back.tabbable === 1,
        detail: `filtered=${JSON.stringify(empty)} restored=${JSON.stringify(back)}`,
      }
    },
  },
  {
    demo: '13-screen-reader.vue',
    name: 'three groups on one card carry exactly one tab stop each',
    fn: async () => {
      const s = __kn.stage('13-screen-reader.vue')
      const hosts = [...s.querySelectorAll('[data-keyboard-navigation-state]')]
      const stops = hosts.map((h) => h.querySelectorAll('[tabindex="0"]').length)
      const ad = hosts[2]
      return {
        pass:
          hosts.length === 3 &&
          stops[0] === 1 &&
          stops[1] === 1 &&
          // The activedescendant list is itself the tab stop, so its options
          // are all -1 and the <ul> carries the 0.
          stops[2] === 0 &&
          ad.getAttribute('tabindex') === '0' &&
          !!ad.getAttribute('aria-activedescendant'),
        detail: `hosts=${hosts.length} stops=${JSON.stringify(stops)} ad-tabindex=${ad.getAttribute('tabindex')}`,
      }
    },
  },
]

export default {
  library: '@ozjsey/v-keyboard-navigation',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
