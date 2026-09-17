import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'v-keyboard-navigation',
  pkg: '@ozjsey/v-keyboard-navigation',
  tagline:
    'One tab stop for a group of controls — roving tabindex, arrows, typeahead, a real PageUp/PageDown, and the controlled scroll the browser gets wrong.',
  notes: [
    'The wedge is card 04. Every roving-tabindex library leaves scrolling to the browser on purpose, and the browser centres the focused item — a five-row window lurches three rows at a time. focus({preventScroll:true}) then scrollIntoView({block:"nearest"}) follows one row at a time; in the other order it is a silent no-op.',
    'The directive never writes role or selection state. Every aria-selected / aria-checked you see on these cards is written by the demo, which is the point.',
    'Card 13 is a manual screen-reader walkthrough. Arrow keys never reach the handler in NVDA/JAWS browse mode, so keyboard testing alone cannot validate this library.',
    'Card 15 is a regression card for the worst defect this package shipped: in 0.1.0 a bare container selector went through document.querySelector, so two instances of one component both scrolled the first one\'s pane. Tick the box on that card to watch the old behaviour, spelled out as a getter.',
    'Card 14 is the skipping model: three piles, per-role defaults for aria-disabled, and the group that skips every item — which is the obvious way to break the one-tabbable invariant.',
    'Cards 16 and 17 are hover-as-input (0.3.0). Card 16 carries the regression for the trap that makes it hard: arrowing scrolls the list, so the row under a stationary cursor changes and the browser fires a pointer event for it — react to that and the highlight snaps back to the mouse on every keystroke. The fix is to react to the cursor moving, not to the document moving. Card 17 is the case the focus rule exists for: hover must not blur the input you are typing in.',
  ],
  demos: [
    {
      file: '01-toolbar.vue',
      title: 'Bare binding — a toolbar',
      blurb: 'Zero options. Tab in and out in one step; arrows, Home/End and typeahead inside.',
      tags: ['bare binding', 'role="toolbar"', 'data-keyboard-navigation-item'],
    },
    {
      file: '02-tablist.vue',
      title: 'Tabs',
      blurb: 'Horizontal, wrapping. Selection follows focus — written by the card, never the directive.',
      tags: ['role="tablist"', 'wrap', 'keyboard-navigate'],
    },
    {
      file: '03-menu.vue',
      title: 'Menu',
      blurb: 'Vertical, wrapping. Plain role="menuitem" divs get adopted and made focusable.',
      tags: ['role="menu"', 'item roles', 'Enter untouched'],
    },
    {
      file: '04-listbox-scroll.vue',
      title: 'The scroll wedge — 200 rows in a 200px box',
      blurb: 'Hold ArrowDown and read the scrollTop trace. Untick the box for the browser’s own centring scroll.',
      tags: ['scroll', 'preventScroll', "block: 'nearest'", 'scrollTop trace'],
    },
    {
      file: '05-radiogroup.vue',
      title: 'Radio group — driven vs left alone',
      blurb: 'role="radio" elements are driven; native <input type="radio"> keeps its own arrow behaviour.',
      tags: ['role="radiogroup"', 'native radios', 'no selection writes'],
    },
    {
      file: '06-typeahead.vue',
      title: 'Typeahead',
      blurb: 'Repeat a letter to cycle, keep typing to refine. The live buffer is a CSS-readable attribute.',
      tags: ['typeahead', 'typeaheadTimeout', 'data-keyboard-navigation-typeahead'],
    },
    {
      file: '07-wrap-and-orientation.vue',
      title: 'Orientation and wrap per role',
      blurb: 'Switch role, wrap and RTL and feel the defaults change. Never inferred from layout.',
      tags: ['orientation', 'wrap', 'aria-orientation', 'RTL'],
    },
    {
      file: '08-dynamic-list.vue',
      title: 'The one-tabbable invariant under mutation',
      blurb: 'Add, remove the focused row, reverse, disable, empty. The tabbable count must stay at 1.',
      tags: ['MutationObserver', 'focus rescue', 'data-keyboard-navigation-state="empty"'],
    },
    {
      file: '09-activedescendant.vue',
      title: 'aria-activedescendant mode',
      blurb: 'Focus stays on the list; the item is pointed at. The browser scrolls nothing here — the directive does.',
      tags: ['activedescendant', 'generated ids', 'scroll'],
    },
    {
      file: '10-page-keys.vue',
      title: 'PageUp / PageDown as a real page',
      blurb: 'Measured from the scroll viewport, not mapped to first/last the way Radix and Reka do.',
      tags: ['page', 'pageStep', 'clamped'],
    },
    {
      file: '11-api.vue',
      title: 'The imperative api',
      blurb: 'first / previous / next / last / focus(i) from outside the group, plus the enabled toggle.',
      tags: ['ref', 'KeyboardNavigationApi', 'enabled'],
    },
    {
      file: '12-events-and-state.vue',
      title: 'Events and the state attribute',
      blurb: 'One move, both channels, same detail. Filter to "z" to see the empty-group signal.',
      tags: ['onNavigate', 'keyboard-navigate', 'data-keyboard-navigation-state'],
    },
    {
      file: '13-screen-reader.vue',
      title: 'Screen-reader walkthrough (manual)',
      blurb: 'Four widgets and what to listen for. Browse mode is the case no keyboard test can reach — including the skipped item it still finds.',
      tags: ['NVDA', 'JAWS', 'VoiceOver', 'browse mode', 'skipped items'],
    },
    {
      file: '14-skipping.vue',
      title: 'Skipping — three piles, and the group that skips everything',
      blurb: 'focusgroup="none" for a live control; aria-disabled per role; disable every row and watch the tab stop survive.',
      tags: ['focusgroup="none"', 'skipDisabled', 'ROLE_DEFAULTS', 'data-keyboard-navigation-item="skipped"'],
    },
    {
      file: '15-two-instances.vue',
      title: 'Which box scrolls — two instances, one selector',
      blurb: 'The 0.1.0 defect, with its negative control: a bare container selector resolved document-wide and the second list scrolled the first.',
      tags: ['scroll', 'container', ':scope', 'regression'],
    },
    {
      file: '16-hover.vue',
      title: 'Hover as an input — and the scroll trap',
      blurb: 'Arrow to row 3, hover row 7, press ↓, land on row 8. Then park the cursor and hold ↓: the highlight must not snap back.',
      tags: ['hover', "reason: 'hover'", 'pointermove not mouseover', 'no scroll on hover'],
    },
    {
      file: '17-combobox.vue',
      title: 'Combobox — hover that never blurs the input',
      blurb: 'Type, arrow the listbox, hover a row. Focus stays in the field the whole time — the reason hover never moves focus into a group.',
      tags: ['activedescendant', 'hover', 'imperative api', 'focus never leaves the input'],
    },
  ],
}

export default manifest
