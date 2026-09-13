import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'v-select-text',
  tagline:
    'Reactive text selection for any element — select a paragraph, a range across nested markup, or the part that matches a pattern, on a false → true transition or on click. Inputs, textareas and contenteditable come along for the ride.',
  status: 'v2.1.0 local — copy-on-select landed, first publish pending',
  notes: [
    'The point of the directive is the `text` kind: selecting the rendered text of an ordinary <p>, <code> or <td>. Selecting an <input> is `el.select()` and needs no directive — it is supported, but it is not the reason this exists.',
    'Offsets are expressed against the text as rendered, not raw `textContent`: a run of whitespace counts as one space and leading/trailing whitespace is dropped, because a template-authored `<p>` carries its own source indentation. `whitespace: \'preserve\'` opts back into raw indices for `white-space: pre` hosts.',
    'A document selection over static text stays painted with no focus involved. An <input>’s highlight greys out on blur — that is the browser, not the directive. Clicking other text or the page background collapses it, as it would any selection.',
    'The whitespace difference is dramatic in demo 03 because that text comes from an interpolated JS string. Template-authored markup is condensed by Vue’s compiler first, so a host there carries one leading and trailing space rather than full indentation — the resolution still matters, just less visibly.',
    '`SelectTextPlugin` and `DIRECTIVE_NAME` have no card because no demo can install a plugin: the playground itself calls `app.use(SelectTextPlugin)` in `src/libraries.ts`, so every card on this tab is already proof that the documented install path works.',
    'An empty resolution is a no-op (card 13): nothing selected, nothing dispatched, and the document selection left alone. A collapsed Range is not a selection — which covers a host whose text has not arrived, a whitespace-only host, `{ start: 5, end: 5 }` and a range over a synthetic block separator alike. The `edge` trigger is spent by a selection that happened, not by an enabled render, so the host is still armed when the text lands.',
    '`copy: true` (cards 14–15) writes exactly `detail.text`, never `getSelection().toString()` — the latter is `""` on a `user-select: none` host and would wipe the clipboard. Card 14\'s fourth token carries a `display: none` fragment so the two strings are provably different: what you cannot see never reaches the clipboard. The write is started in the same synchronous turn as the selection and BEFORE `select-text` is dispatched, so a consumer handler cannot spend the user activation it needs.',
    'Card 16 is the loop SEL-5 found, and the guard that closes it: `trigger: \'always\'` + `copy: true` + a handler that writes state used to be an unbounded clipboard loop — ~4,700 real writes per second, forever, because the cycle crosses a promise boundary and Vue\'s recursive-update guard only sees synchronous re-entry. Under `\'always\'` a copy whose text is unchanged since that host\'s last attempt is now skipped outright: no write, no event, no attribute churn. `\'edge\'` (card 15) and `\'click\'` (card 14) are untouched — both need an explicit act per attempt, so both still re-copy identical text on demand.',
    'Card 15 makes the constraint teachable rather than a README footnote, and corrects the folklore while it is at it: transient activation lasts about five seconds, so a flip 250 ms after your click still copies. What is refused is a flip with no gesture behind it — past the window, or on mount, which is what `trigger: \'edge\'` does. Chrome refuses that one too; it is not a Firefox/Safari-only caveat. Measured with trusted input in Chrome 152, clipboard permissions left at their defaults.',
  ],
  demos: [
    {
      file: '01-static-text.vue',
      title: 'Static text — the point of the directive',
      blurb: 'A plain paragraph selects its own rendered text on mount, across nested markup, with no contenteditable and no focus.',
      tags: ['v-select-text', "kind: 'text'", 'Range API', 'mount'],
    },
    {
      file: '02-match.vue',
      title: 'match — select by content, not by counting',
      blurb: 'Type a string or switch to a RegExp; the match is found in the rendered text and selected even when it spans elements.',
      tags: ['match', 'matchIndex', 'RegExp', 'no match → no event'],
    },
    {
      file: '03-whitespace.vue',
      title: "whitespace: 'collapse' vs 'preserve'",
      blurb: 'The same source-indented paragraph indexed both ways — why offsets are against the rendered text by default.',
      tags: ['whitespace', 'textContent', 'white-space: pre'],
    },
    {
      file: '04-click-to-select.vue',
      title: "trigger: 'click'",
      blurb: 'Click a token to select it. Same affordance as `user-select: all`, but with an event, a payload, and an optional match.',
      tags: ['trigger', "'click'", 'enabled', '@select-text'],
    },
    {
      file: '05-nested-range.vue',
      title: 'start / end across nested markup',
      blurb: 'A flat character range mapped onto (textNode, offset) pairs, so one selection covers three elements. Clamps and swaps.',
      tags: ['start', 'end', 'direction', 'TreeWalker', 'clamping'],
    },
    {
      file: '06-input.vue',
      title: 'Inputs and textareas',
      blurb: 'The setSelectionRange path: bare select-all, ranges, direction, and the type="number" fallback to select().',
      tags: ["kind: 'input'", "kind: 'textarea'", 'setSelectionRange', 'fallback'],
    },
    {
      file: '07-boolean-edge.vue',
      title: 'Boolean toggle and edge detection',
      blurb: 'Selection fires on false → true only. Holding it true across re-renders does nothing — prev is tracked per element.',
      tags: ['enabled', 'edge detection', 'WeakMap', "'condition' alias"],
    },
    {
      file: '08-trigger-always.vue',
      title: "trigger: 'always'",
      blurb: 'Re-select on every update while enabled stays true — for when the range or the text moves under it.',
      tags: ['trigger', "'edge' | 'always'"],
    },
    {
      file: '09-contenteditable.vue',
      title: 'contenteditable',
      blurb: 'The same options against an editable host — including a match that re-reads the live content as you type.',
      tags: ['contenteditable', 'match', 'Range', 'kind'],
    },
    {
      file: '10-composable.vue',
      title: 'useSelectText composable',
      blurb: 'Imperative select() / clear() / update() over both a static paragraph and a textarea. select() returns the detail.',
      tags: ['useSelectText', 'state', 'update()', 'select() → detail'],
    },
    {
      file: '11-event.vue',
      title: 'select-text CustomEvent',
      blurb: 'Every successful selection dispatches the resolved start / end / text / direction / kind. The event is the integration point.',
      tags: ['@select-text', 'SelectTextEventDetail', 'detail.text'],
    },
    {
      file: '12-unsupported.vue',
      title: 'What still degrades quietly',
      blurb: 'Text-less hosts warn once and no-op; a plain <div> no longer does. Plus the user-select: none diagnostic.',
      tags: ['no-op', 'console.warn', 'user-select: none', 'fallback'],
    },
    {
      file: '13-late-text.vue',
      title: 'Text that arrives after mount',
      blurb: 'A bare binding on an empty host selects nothing, dispatches nothing, keeps your existing selection — and fires when the text lands.',
      tags: ['{{ fromApi }}', 'no phantom event', 'collapsed Range', 'edge stays armed'],
    },
    {
      file: '14-copy-on-select.vue',
      title: 'copy: true — click, or Enter/Space, to copy',
      blurb: 'The selected text goes on the clipboard: exactly detail.text, the rendered view, narrowable with match. Keyboard-operable, with a data-* state to style.',
      tags: ['copy', "trigger: 'click'", 'select-text-copy', 'tabindex + role=button'],
    },
    {
      file: '15-copy-activation.vue',
      title: 'The activation trap, measured',
      blurb: 'The same false → true flip, timed three ways: inside the handler and 250 ms later both copy; six seconds later there is no activation left and Chrome refuses it. The event says which, and a refusal leaves the clipboard intact.',
      tags: ['user activation', '~5 s window', "reason: 'no-user-activation'", 'never throws'],
    },
    {
      file: '16-always-copy-loop.vue',
      title: "trigger: 'always' + copy — the write follows the text",
      blurb: 'Re-render all you like: a copy whose text is unchanged since this host\'s last attempt is skipped entirely. Change the text and exactly one more write happens.',
      tags: ["trigger: 'always'", 'copy', 'no unbounded loop', 'SEL-5'],
    },
  ],
}

export default manifest
