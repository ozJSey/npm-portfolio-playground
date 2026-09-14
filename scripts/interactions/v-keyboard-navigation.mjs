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

/**
 * One real cursor movement through the browser's own input pipeline.
 *
 * `Input.dispatchMouseEvent` is what makes this a *cursor* rather than a
 * synthetic event: Chrome updates its own hit-test position, so the compat
 * `mousemove` / `pointermove` it later fires when a scroll moves the document
 * under a stationary cursor carries these same coordinates — which is the
 * whole thing the hover guard is written against, and the whole thing a
 * `dispatchEvent(new MouseEvent(...))` cannot reproduce.
 */
async function moveMouse(ctx, x, y) {
  await ctx.cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' },
    ctx.sessionId,
  )
  await ctx.page.evaluate('new Promise((r) => requestAnimationFrame(() => r(1)))')
}

/**
 * Park the cursor on a point, the way a hand does.
 *
 * Two moves, because the very first cursor sample a group ever sees is
 * recorded as the baseline and deliberately not acted on (`hover.ts`), and a
 * wait first, because a group is deaf to the cursor for 150ms after a key it
 * acted on — the belt to the coordinate guard's brace.
 */
async function hoverAt(ctx, x, baselineY, targetY) {
  await ctx.page.evaluate('new Promise((r) => setTimeout(r, 220))')
  await moveMouse(ctx, x, baselineY)
  await moveMouse(ctx, x, targetY)
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
  /** data-label first: a row whose text carries a state badge still names itself. */
  activeLabel() {
    const el = document.activeElement
    return (el && el.getAttribute && el.getAttribute('data-label')) || this.txt(el)
  },
  pane(file, id) { return this.stage(file).querySelector('[data-pane="' + id + '"]') },
  paneTop(file, id) { const p = this.pane(file, id); return p ? Math.round(p.scrollTop) : -1 },
  paneRows(file, id) { return [...this.pane(file, id).querySelectorAll('[role=option]')] },
  /** Vue renders on a microtask; one macrotask later the DOM has caught up. */
  settled() { return this.sleep(0) },
  marked(file) { return this.txt(this.stage(file).querySelector('[data-keyboard-navigation-item="active"]')) },
  tabbable(file) { return [...this.stage(file).querySelectorAll('[tabindex="0"]')] },
  /** Put a card in the middle of the viewport, so CDP mouse coordinates land on it. */
  showCard(file) {
    this.sec(file).scrollIntoView({ block: 'center' })
    return true
  },
  /** Viewport rect of one element inside a card, rounded for CDP. */
  box(file, sel) {
    const el = this.stage(file).querySelector(sel)
    if (!el) throw new Error('no ' + sel + ' in ' + file)
    const r = el.getBoundingClientRect()
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
  },
  kv(file, needle) {
    return this.txt([...this.stage(file).querySelectorAll('.pg-kv')].find((k) => this.txt(k).includes(needle)))
  },
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
        if (!(await __kn.until(() => box.checked === false))) throw new Error('checkbox never cleared')
        await __kn.settled()
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
        const host = () => __kn.host('07-wrap-and-orientation.vue')
        if (!(await __kn.until(() => host().getAttribute('role') === 'listbox')))
          throw new Error('the host never became a listbox')
        __kn.focusItem('07-wrap-and-orientation.vue', 0)
      })()`)
      await press(ctx, 'ArrowRight')
      const ignored = await ctx.page.evaluate(`__kn.activeLabel()`)
      await press(ctx, 'ArrowDown')
      const moved = await ctx.page.evaluate(`__kn.activeLabel()`)

      await ctx.page.evaluate(`(async () => {
        const s = __kn.stage('07-wrap-and-orientation.vue')
        const host = () => __kn.host('07-wrap-and-orientation.vue')
        __kn.set(s.querySelectorAll('select')[0], 'toolbar')
        if (!(await __kn.until(() => host().getAttribute('role') === 'toolbar')))
          throw new Error('the host never became a toolbar')
        __kn.set(s.querySelector('input[type=checkbox]'), true)
        if (!(await __kn.until(() => host().getAttribute('dir') === 'rtl')))
          throw new Error('the host never went RTL')
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
        const rows = () => __kn.stage('08-dynamic-list.vue').querySelectorAll('[role=option]').length
        const before = rows()
        __kn.button('08-dynamic-list.vue', 'Remove focused').click()
        if (!(await __kn.until(() => rows() === before - 1))) throw new Error('no row was removed')
        await __kn.settled()
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
        const rows = () => __kn.stage('08-dynamic-list.vue').querySelectorAll('[role=option]').length
        __kn.button('08-dynamic-list.vue', 'Remove all').click()
        if (!(await __kn.until(() => rows() === 0))) throw new Error('the list never emptied')
        await __kn.settled()
        return {
          state: __kn.host('08-dynamic-list.vue').getAttribute('data-keyboard-navigation-state'),
          tabbable: __kn.tabbable('08-dynamic-list.vue').length,
        }
      })()`)
      const refilled = await ctx.page.evaluate(`(async () => {
        const rows = () => __kn.stage('08-dynamic-list.vue').querySelectorAll('[role=option]').length
        __kn.button('08-dynamic-list.vue', 'Refill').click()
        if (!(await __kn.until(() => rows() === 4))) throw new Error('the list never refilled')
        await __kn.settled()
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
    name: 'disabling the tabbable row moves the stop and pins the row at -1, never two stops',
    async run(ctx) {
      const out = await ctx.page.evaluate(`(async () => {
        __kn.focusItem('08-dynamic-list.vue', 0)
        const first = __kn.items('08-dynamic-list.vue')[0]
        __kn.button('08-dynamic-list.vue', 'Toggle disabled').click()
        if (!(await __kn.until(() => first.getAttribute('data-keyboard-navigation-item') === 'skipped')))
          throw new Error('the row never became skipped')
        await __kn.settled()
        const disabled = {
          tabbable: __kn.tabbable('08-dynamic-list.vue').length,
          firstTabIndex: first.getAttribute('tabindex'),
          marked: __kn.marked('08-dynamic-list.vue'),
        }
        // The other half of the toggle, which used to be unreachable from the
        // card's own UI: the skipped row is still clickable at -1.
        first.focus()
        __kn.button('08-dynamic-list.vue', 'Toggle disabled').click()
        if (!(await __kn.until(() => first.getAttribute('data-keyboard-navigation-item') !== 'skipped')))
          throw new Error('the row never came back')
        await __kn.settled()
        return {
          ...disabled,
          backTabbable: __kn.tabbable('08-dynamic-list.vue').length,
          backItem: first.getAttribute('data-keyboard-navigation-item'),
        }
      })()`)
      return {
        pass:
          out.tabbable === 1 &&
          out.firstTabIndex === '-1' &&
          out.marked.startsWith('Bravo') &&
          out.backTabbable === 1 &&
          out.backItem !== 'skipped',
        detail: `disabled: tabbable=${out.tabbable} row tabindex=${out.firstTabIndex} active=${out.marked}; re-enabled: tabbable=${out.backTabbable} item=${out.backItem}`,
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
        const select = __kn.stage('10-page-keys.vue').querySelector('select')
        __kn.set(select, 'fixed')
        if (!(await __kn.until(() => select.value === 'fixed'))) throw new Error('page mode never changed')
        await __kn.settled()
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
        // An empty log renders one placeholder <li>, so "no lines" is the
        // placeholder being the only child — not a count of zero.
        const empty = () => !!__kn.stage('12-events-and-state.vue').querySelector('.pg-log .pg-muted')
        __kn.button('12-events-and-state.vue', 'Clear log').click()
        if (!(await __kn.until(empty))) throw new Error('the log never cleared')
        await __kn.settled()
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

  // -------------------------------------------------------------------------
  // 14 — skipping: the per-role default, and the group that skips everything
  // -------------------------------------------------------------------------
  {
    demo: '14-skipping.vue',
    name: 'a menu stops on its unavailable option; a toolbar steps over it',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.focusItem('14-skipping.vue', 0)`)
      await press(ctx, 'ArrowDown', 2)
      const menu = await ctx.page.evaluate(`__kn.activeLabel()`)

      await ctx.page.evaluate(`(async () => {
        const select = __kn.stage('14-skipping.vue').querySelectorAll('select')[0]
        __kn.set(select, 'toolbar')
        const host = () => __kn.host('14-skipping.vue')
        if (!(await __kn.until(() => host().getAttribute('role') === 'toolbar')))
          throw new Error('the host never became a toolbar')
        if (!(await __kn.until(() => host().querySelector('[data-keyboard-navigation-item="skipped"]'))))
          throw new Error('nothing was ever marked skipped')
        __kn.focusItem('14-skipping.vue', 0)
      })()`)
      await press(ctx, 'ArrowRight', 2)
      const toolbar = await ctx.page.evaluate(`(() => ({
        label: __kn.activeLabel(),
        skipped: [...__kn.host('14-skipping.vue')
          .querySelectorAll('[data-keyboard-navigation-item="skipped"]')]
          .map((el) => el.getAttribute('data-label')),
      }))()`)

      return {
        // menu: role default skipDisabled=false, so ↓↓ from "New file" lands
        // ON Paste. toolbar: skipDisabled=true, so →→ steps past it to Rename.
        pass: menu === 'Paste' && toolbar.label === 'Rename' && toolbar.skipped.join() === 'Paste',
        detail: `menu ↓↓ → ${menu}; toolbar →→ → ${toolbar.label} (skipped: ${toolbar.skipped})`,
      }
    },
  },
  {
    demo: '14-skipping.vue',
    name: 'skipDisabled beats the role default in both directions',
    async run(ctx) {
      const setUp = (role, override) => `(async () => {
        const s = __kn.stage('14-skipping.vue')
        const selects = s.querySelectorAll('select')
        __kn.set(selects[0], '${role}')
        __kn.set(selects[1], '${override}')
        const host = () => __kn.host('14-skipping.vue')
        if (!(await __kn.until(() => host().getAttribute('role') === '${role}')))
          throw new Error('role never changed')
        if (!(await __kn.until(() => __kn.txt(s.querySelector('.effective')) === '${override === 'skip'}')))
          throw new Error('the readout never showed the override')
        __kn.focusItem('14-skipping.vue', 0)
      })()`

      // A menu told to skip: ↓↓ from "New file" clears Paste and lands on Rename.
      await ctx.page.evaluate(setUp('menu', 'skip'))
      await press(ctx, 'ArrowDown', 2)
      const menuSkipping = await ctx.page.evaluate(`__kn.activeLabel()`)

      // A toolbar told to keep: →→ stops on Paste.
      await ctx.page.evaluate(setUp('toolbar', 'keep'))
      await press(ctx, 'ArrowRight', 2)
      const toolbarKeeping = await ctx.page.evaluate(`(() => ({
        label: __kn.activeLabel(),
        skipped: __kn.host('14-skipping.vue')
          .querySelectorAll('[data-keyboard-navigation-item="skipped"]').length,
      }))()`)

      return {
        pass: menuSkipping === 'Rename' && toolbarKeeping.label === 'Paste' && toolbarKeeping.skipped === 0,
        detail: `menu+skip ↓↓ → ${menuSkipping}; toolbar+keep →→ → ${toolbarKeeping.label} (${toolbarKeeping.skipped} skipped)`,
      }
    },
  },
  {
    demo: '14-skipping.vue',
    name: 'every row skipped: the group keeps one tab stop, says empty, and claims no key',
    async run(ctx) {
      const measured = await ctx.page.evaluate(`(async () => {
        const s = __kn.stage('14-skipping.vue')
        // The card opens on role="menu", which KEEPS its disabled options —
        // so "disable every row" alone changes nothing, which is the per-role
        // default doing its job. Ask for skipping explicitly.
        __kn.set(s.querySelectorAll('select')[1], 'skip')
        __kn.set(s.querySelector('input[type=checkbox]'), true)
        const host = () => __kn.host('14-skipping.vue')
        if (!(await __kn.until(() => host().getAttribute('data-keyboard-navigation-state') === 'empty')))
          throw new Error('the group never reported empty')
        __kn.button('14-skipping.vue', 'Measure').click()
        await __kn.settled()
        const stop = host().querySelector('[tabindex="0"]')
        stop.focus()
        return {
          state: __kn.txt(s.querySelector('.state')),
          items: __kn.txt(s.querySelector('.count-items')),
          skipped: __kn.txt(s.querySelector('.count-skipped')),
          tabbable: __kn.txt(s.querySelector('.count-tabbable')),
          holder: stop.getAttribute('data-label'),
          focused: document.activeElement.getAttribute('data-label'),
        }
      })()`)

      // Nowhere to go, so the key is not claimed and focus does not move.
      await press(ctx, 'ArrowDown')
      const after = await ctx.page.evaluate(`(() => ({
        focused: document.activeElement.getAttribute('data-label'),
        // Tab out of the one stop and the opted-out row is what it reaches:
        // never touched by the directive, still in the tab order.
        optedOut: __kn.host('14-skipping.vue').querySelector('[focusgroup="none"]').hasAttribute('tabindex'),
      }))()`)
      await press(ctx, 'Tab')
      const tabbed = await ctx.page.evaluate(`document.activeElement.getAttribute('data-label')`)

      return {
        pass:
          measured.state === 'empty' &&
          measured.items === '0' &&
          measured.skipped === '4' &&
          measured.tabbable === '1' &&
          measured.holder === 'New file' &&
          after.focused === 'New file' &&
          after.optedOut === false &&
          tabbed === 'Load more…',
        detail: `state=${measured.state} items=${measured.items} skipped=${measured.skipped} tabbable=${measured.tabbable} on "${measured.holder}"; ArrowDown → ${after.focused}; Tab → ${tabbed}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 15 — which box scrolls, with its own negative control
  // -------------------------------------------------------------------------
  {
    demo: '15-two-instances.vue',
    name: 'two instances of one component each scroll their own pane',
    async run(ctx) {
      await ctx.page.evaluate(`__kn.paneRows('15-two-instances.vue', 'right')[0].focus()`)
      await press(ctx, 'ArrowDown', 6)
      const out = await ctx.page.evaluate(`(async () => {
        __kn.button('15-two-instances.vue', 'Measure').click()
        await __kn.settled()
        const s = __kn.stage('15-two-instances.vue')
        return {
          left: __kn.paneTop('15-two-instances.vue', 'left'),
          right: __kn.paneTop('15-two-instances.vue', 'right'),
          readLeft: __kn.txt(s.querySelector('.top-left')),
          readRight: __kn.txt(s.querySelector('.top-right')),
          focused: __kn.activeLabel(),
        }
      })()`)
      return {
        pass: out.right > 0 && out.left === 0 && out.focused === 'R 7' && out.readLeft === '0',
        detail: `left=${out.left} right=${out.right} (card reads ${out.readLeft}/${out.readRight}), focus=${out.focused}`,
      }
    },
  },
  {
    demo: '15-two-instances.vue',
    name: 'the document-wide getter reproduces the 0.1.0 defect — the FIRST pane scrolls',
    async run(ctx) {
      await ctx.page.evaluate(`(async () => {
        const box = __kn.stage('15-two-instances.vue').querySelector('input[type=checkbox]')
        __kn.set(box, true)
        if (!(await __kn.until(() => box.checked === true))) throw new Error('the toggle never set')
        await __kn.settled()
        __kn.paneRows('15-two-instances.vue', 'right')[0].focus()
      })()`)
      await press(ctx, 'ArrowDown', 6)
      const out = await ctx.page.evaluate(`(() => ({
        left: __kn.paneTop('15-two-instances.vue', 'left'),
        right: __kn.paneTop('15-two-instances.vue', 'right'),
        focused: __kn.activeLabel(),
      }))()`)
      return {
        // Arrowing in the right-hand list writes a scrollTop onto the left
        // one, and the list the user is actually in never follows its focus
        // ring. This is the negative control for the check above: it is what
        // `document.querySelector` did to every bare selector in 0.1.0.
        pass: out.left > 0 && out.right === 0 && out.focused === 'R 7',
        detail: `left=${out.left} (the WRONG pane) right=${out.right}, focus=${out.focused}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 16 — hover as an input, and THE TRAP
  // -------------------------------------------------------------------------
  {
    demo: '16-hover.vue',
    name: 'the arrows continue from the row the cursor is on — and do not when hover is off',
    async run(ctx) {
      const pane = await ctx.page.evaluate(`(() => {
        __kn.showCard('16-hover.vue')
        __kn.focusItem('16-hover.vue', 0)
        return __kn.box('16-hover.vue', '.list-pane')
      })()`)
      // Rows are 40px in a 200px pane: +180 is the middle of the fifth one.
      const x = pane.left + 60
      const onRowFive = pane.top + 180

      await press(ctx, 'ArrowDown', 2)
      const afterKeys = await ctx.page.evaluate(`__kn.marked('16-hover.vue')`)
      await hoverAt(ctx, x, pane.top + 20, onRowFive)
      const hovered = await ctx.page.evaluate(`(() => ({
        marked: __kn.marked('16-hover.vue'),
        reason: __kn.kv('16-hover.vue', 'reason:'),
        focused: __kn.activeLabel(),
      }))()`)
      await press(ctx, 'ArrowDown')
      const continued = await ctx.page.evaluate(`__kn.marked('16-hover.vue')`)

      // The negative control, in the card itself: with `hover: false` the same
      // three gestures leave the active row exactly where the keys put it.
      await ctx.page.evaluate(`(async () => {
        const box = __kn.label('16-hover.vue', 'hover').querySelector('input')
        __kn.set(box, false)
        if (!(await __kn.until(() => box.checked === false))) throw new Error('the hover toggle never cleared')
        await __kn.settled()
        __kn.button('16-hover.vue', 'Reset').click()
        await __kn.settled()
      })()`)
      await press(ctx, 'ArrowDown', 2)
      await hoverAt(ctx, x, pane.top + 20, onRowFive)
      const off = await ctx.page.evaluate(`__kn.marked('16-hover.vue')`)
      await press(ctx, 'ArrowDown')
      const offAfter = await ctx.page.evaluate(`__kn.marked('16-hover.vue')`)

      return {
        pass:
          afterKeys === 'Row 3' &&
          hovered.marked === 'Row 5' &&
          hovered.reason.includes('hover') &&
          // Focus followed the cursor, because the keyboard was already
          // standing on one of these rows — one highlight, not two.
          hovered.focused === 'Row 5' &&
          continued === 'Row 6' &&
          off === 'Row 3' &&
          offAfter === 'Row 4',
        detail: `keys→${afterKeys}, hover→${hovered.marked} (${hovered.reason}, focus ${hovered.focused}), ↓→${continued}; hover:false → ${off} then ${offAfter}`,
      }
    },
  },
  {
    demo: '16-hover.vue',
    name: 'THE TRAP: the list scrolling under a stationary cursor must not move the active row',
    async run(ctx) {
      const pane = await ctx.page.evaluate(`(() => {
        __kn.showCard('16-hover.vue')
        __kn.button('16-hover.vue', 'Reset').click()
        return __kn.box('16-hover.vue', '.list-pane')
      })()`)
      const x = pane.left + 60
      // Dead centre of the pane — row 3 at scrollTop 0, and a different row
      // after every 40px the list scrolls.
      const y = pane.top + 100

      await hoverAt(ctx, x, pane.top + 20, y)
      const parked = await ctx.page.evaluate(`(() => ({
        marked: __kn.marked('16-hover.vue'),
        hovers: Number(__kn.txt(__kn.stage('16-hover.vue').querySelector('.hover-count'))),
      }))()`)

      // Hand off the mouse. Every key from here on scrolls the list under a
      // cursor that does not move.
      await press(ctx, 'ArrowDown', 12)

      const out = await ctx.page.evaluate(`(() => {
        const pane = __kn.stage('16-hover.vue').querySelector('.list-pane')
        const r = pane.getBoundingClientRect()
        return {
          marked: __kn.marked('16-hover.vue'),
          scrollTop: Math.round(pane.scrollTop),
          hovers: Number(__kn.txt(__kn.stage('16-hover.vue').querySelector('.hover-count'))),
          keys: Number(__kn.txt(__kn.stage('16-hover.vue').querySelector('.key-count'))),
          paneTop: Math.round(r.top),
          paneLeft: Math.round(r.left),
        }
      })()`)

      return {
        pass:
          parked.marked === 'Row 3' &&
          parked.hovers === 1 &&
          // Twelve keys from Row 3, and the list scrolled 400px underneath a
          // cursor that never moved. One hover total — the deliberate one.
          out.marked === 'Row 15' &&
          out.scrollTop === 400 &&
          out.hovers === 1 &&
          out.keys === 12 &&
          // The card did not move under us, so the cursor really was over the
          // pane for the whole run.
          out.paneTop === pane.top &&
          out.paneLeft === pane.left,
        detail: `parked on ${parked.marked}; after 12×↓ active=${out.marked} scrollTop=${out.scrollTop} hoverMoves=${out.hovers} keyMoves=${out.keys} (pane ${out.paneLeft},${out.paneTop} was ${pane.left},${pane.top})`,
      }
    },
  },
  {
    demo: '16-hover.vue',
    name: 'a hover does not scroll, where the same move by key does',
    async run(ctx) {
      const pane = await ctx.page.evaluate(`(() => {
        __kn.showCard('16-hover.vue')
        __kn.focusItem('16-hover.vue', 0)
        return __kn.box('16-hover.vue', '.list-pane')
      })()`)
      const x = pane.left + 60

      await press(ctx, 'ArrowDown', 6)
      // Misalign the pane so the top row is genuinely clipped: `block:'nearest'`
      // has something to do, and doing it would drag the list out from under
      // the mouse.
      await ctx.page.evaluate(`__kn.stage('16-hover.vue').querySelector('.list-pane').scrollTop = 20`)
      await hoverAt(ctx, x, pane.top + 120, pane.top + 10)
      const hovered = await ctx.page.evaluate(`(() => ({
        marked: __kn.marked('16-hover.vue'),
        scrollTop: Math.round(__kn.stage('16-hover.vue').querySelector('.list-pane').scrollTop),
      }))()`)

      // The same row, reached by key, does scroll — so the assertion above is
      // about hover and not about a list that never scrolls.
      await ctx.page.evaluate(`(async () => {
        __kn.stage('16-hover.vue').querySelector('.list-pane').scrollTop = 20
        __kn.focusItem('16-hover.vue', 3)
        await __kn.settled()
      })()`)
      await press(ctx, 'Home')
      const keyed = await ctx.page.evaluate(`(() => ({
        marked: __kn.marked('16-hover.vue'),
        scrollTop: Math.round(__kn.stage('16-hover.vue').querySelector('.list-pane').scrollTop),
      }))()`)

      return {
        pass:
          hovered.marked === 'Row 1' &&
          hovered.scrollTop === 20 &&
          keyed.marked === 'Row 1' &&
          keyed.scrollTop === 0,
        detail: `hover → ${hovered.marked} scrollTop=${hovered.scrollTop} (unchanged); Home → ${keyed.marked} scrollTop=${keyed.scrollTop}`,
      }
    },
  },

  // -------------------------------------------------------------------------
  // 17 — the combobox: hover that never blurs the input
  // -------------------------------------------------------------------------
  {
    demo: '17-combobox.vue',
    name: 'type, arrow, hover — and focus never leaves the input',
    async run(ctx) {
      await ctx.page.evaluate(`(() => {
        __kn.showCard('17-combobox.vue')
        __kn.stage('17-combobox.vue').querySelector('#combo-input').focus()
        return true
      })()`)
      await press(ctx, 'a')
      const typed = await ctx.page.evaluate(`(async () => {
        await __kn.settled()
        const input = __kn.stage('17-combobox.vue').querySelector('#combo-input')
        return { value: input.value, rows: __kn.items('17-combobox.vue').length, focused: document.activeElement.id }
      })()`)

      await press(ctx, 'ArrowDown', 3)
      const arrowed = await ctx.page.evaluate(`(() => ({
        marked: __kn.marked('17-combobox.vue'),
        focused: document.activeElement.id,
        pointer: __kn.stage('17-combobox.vue').querySelector('#combo-input').getAttribute('aria-activedescendant'),
      }))()`)

      const box = await ctx.page.evaluate(`__kn.box('17-combobox.vue', '#combo-list')`)
      const x = box.left + 60
      await hoverAt(ctx, x, box.top + 15, box.top + 165)
      const hovered = await ctx.page.evaluate(`(() => ({
        marked: __kn.marked('17-combobox.vue'),
        focused: document.activeElement.id,
        reason: __kn.kv('17-combobox.vue', 'last reason:'),
        pointer: __kn.stage('17-combobox.vue').querySelector('#combo-input').getAttribute('aria-activedescendant'),
      }))()`)

      await press(ctx, 'ArrowDown')
      const continued = await ctx.page.evaluate(`__kn.marked('17-combobox.vue')`)

      // The letters still land in the field: nothing ever took the focus.
      await press(ctx, 'n')
      const stillTyping = await ctx.page.evaluate(`(async () => {
        await __kn.settled()
        const input = __kn.stage('17-combobox.vue').querySelector('#combo-input')
        return { value: input.value, focused: document.activeElement.id }
      })()`)

      // Filtered on "a": Amsterdam, Ankara, Athens, Barcelona, Bratislava,
      // Bucharest, … — 'Berlin' and 'Bern' carry no 'a' and are not in it.
      return {
        pass:
          typed.value === 'a' &&
          typed.focused === 'combo-input' &&
          // Three ArrowDowns: the first lands ON the first option.
          arrowed.marked === 'Athens' &&
          arrowed.focused === 'combo-input' &&
          arrowed.pointer === 'combo-Athens' &&
          // The sixth 30px row in a 180px list.
          hovered.marked === 'Bucharest' &&
          hovered.focused === 'combo-input' &&
          hovered.reason.includes('hover') &&
          hovered.pointer === 'combo-Bucharest' &&
          continued === 'Budapest' &&
          stillTyping.value === 'an' &&
          stillTyping.focused === 'combo-input',
        detail: `typed "${typed.value}" (${typed.rows} rows, focus ${typed.focused}); 3×↓ → ${arrowed.marked}; hover → ${hovered.marked} (${hovered.reason}, focus ${hovered.focused}, pointer ${hovered.pointer}); ↓ → ${continued}; typed again → "${stillTyping.value}" focus ${stillTyping.focused}`,
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
      const active = () => document.activeElement
      const before = active()
      __kn.button('11-api.vue', 'last()').click()
      if (!(await __kn.until(() => active() !== before))) throw new Error('last() moved nothing')
      const afterLast = active()
      const last = { focus: __kn.activeLabel(), marked: __kn.marked('11-api.vue') }
      __kn.button('11-api.vue', 'previous()').click()
      if (!(await __kn.until(() => active() !== afterLast))) throw new Error('previous() moved nothing')
      await __kn.settled()
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
      const box = __kn.label('11-api.vue', 'enabled').querySelector('input')
      __kn.set(box, false)
      if (!(await __kn.until(() => box.checked === false))) throw new Error('the toggle never cleared')
      await __kn.settled()
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
      const rows = () => __kn.stage('12-events-and-state.vue').querySelectorAll('[role=option]').length
      __kn.set(input, 'z')
      if (!(await __kn.until(() => rows() === 0))) throw new Error('the filter never emptied the list')
      await __kn.settled()
      const empty = {
        state: __kn.host('12-events-and-state.vue').getAttribute('data-keyboard-navigation-state'),
        tabbable: __kn.tabbable('12-events-and-state.vue').length,
      }
      __kn.set(input, '')
      if (!(await __kn.until(() => rows() === 4))) throw new Error('the list never came back')
      await __kn.settled()
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
    name: 'four groups on one card carry exactly one tab stop each',
    fn: async () => {
      const s = __kn.stage('13-screen-reader.vue')
      const hosts = [...s.querySelectorAll('[data-keyboard-navigation-state]')]
      const stops = hosts.map((h) => h.querySelectorAll('[tabindex="0"]').length)
      const ad = hosts[3]
      // The skipping widget: the aria-disabled button is held at -1 (not
      // released, or a native button would be a second tab stop), and the
      // focusgroup="none" button is not touched at all.
      const skipping = hosts[2]
      const skipped = skipping.querySelector('[aria-disabled="true"]')
      const optedOut = skipping.querySelector('[focusgroup="none"]')
      return {
        pass:
          hosts.length === 4 &&
          stops[0] === 1 &&
          stops[1] === 1 &&
          stops[2] === 1 &&
          // The activedescendant list is itself the tab stop, so its options
          // are all -1 and the <ul> carries the 0.
          stops[3] === 0 &&
          skipped.getAttribute('tabindex') === '-1' &&
          skipped.getAttribute('data-keyboard-navigation-item') === 'skipped' &&
          !optedOut.hasAttribute('tabindex') &&
          !optedOut.hasAttribute('data-keyboard-navigation-item') &&
          ad.getAttribute('tabindex') === '0' &&
          !!ad.getAttribute('aria-activedescendant'),
        detail: `hosts=${hosts.length} stops=${JSON.stringify(stops)} skipped-tabindex=${skipped.getAttribute('tabindex')} optedOut-tabindex=${optedOut.getAttribute('tabindex')} ad-tabindex=${ad.getAttribute('tabindex')}`,
      }
    },
  },
]

export default {
  library: 'v-keyboard-navigation',
  prelude: PRELUDE,
  checks: CHECKS,
  nativeChecks: NATIVE_CHECKS,
}
