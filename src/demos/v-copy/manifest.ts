import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: '@ozjsey/v-copy',
  tagline:
    'Make any element copyable. Click a <li>, a <code>, a table cell — its text is on the clipboard. Plus copy history, a "Copied!" state, keyboard + screen-reader support, and an automatic clipboard fallback, all from one binding.',
  status: '1.1.0 — renamed to @ozjsey/v-copy, ready to publish (the unscoped name is squatted)',
  notes: [
    'The Clipboard API needs a secure context. localhost counts, so real copies work here — paste somewhere to confirm.',
    'History and controller state only stay observable when the bound object is a ref/reactive; an inline literal is re-created every render.',
  ],
  demos: [
    {
      file: '01-bare.vue',
      title: 'Bare binding — copy textContent',
      blurb: 'Click any address. No config, no handler; the element is the source.',
      tags: ['@ozjsey/v-copy', 'textContent', 'data-copied'],
    },
    {
      file: '02-source-override.vue',
      title: 'Source override',
      blurb: 'Copy something other than what is on screen — a string, a number, or a getter.',
      tags: ['source', 'string binding', 'source: () => …'],
    },
    {
      file: '03-history.vue',
      title: 'Copy history via a bound ref',
      blurb:
        'Bind a ref<string[]> and copies land in it, newest-first. dedupe is ON by default, so re-copying a row promotes it back to the top instead of adding a second one.',
      tags: ['sink', 'dedupe', 'ref binding'],
    },
    {
      file: '04-rich-multi.vue',
      title: 'Rich entries + per-binding labels',
      blurb: 'Two cells per row share one log; the directive argument labels which one fired.',
      tags: ['.rich', 'v-copy:[key]', 'RichCopyEntry'],
    },
    {
      file: '05-controller.vue',
      title: 'Controller — slot-like state without a composable',
      blurb: 'Bind a reactive object: read copied / history / last, call copy() and clear().',
      tags: ['CopyController', 'copy()', 'clear()', 'reactive'],
    },
    {
      file: '06-feedback.vue',
      title: 'Feedback config',
      blurb: 'Custom class + duration, attribute rename, or feedback: false for no visual state.',
      tags: ['feedback', 'className', 'duration', 'attribute'],
    },
    {
      file: '07-callbacks-event.vue',
      title: 'Callbacks and the bubbling copy-result event',
      blurb: 'onSuccess/onError per binding; one parent listener collects a whole v-for subtree.',
      tags: ['onCopy', 'onSuccess', 'onError', 'copy-result'],
    },
    {
      file: '08-modifiers.vue',
      title: 'Modifiers — .once .trim .prevent .stop',
      blurb:
        'The trigger fires at most once, trim an explicit source, or stop/prevent the trigger event.',
      tags: ['.once', '.trim', '.prevent', '.stop'],
    },
    {
      file: '09-disabled-trigger.vue',
      title: 'Disabled state and custom triggers',
      blurb: 'v-copy="false" detaches; trigger picks the DOM event; trigger: false is programmatic-only.',
      tags: ['disabled', 'trigger', 'v-copy="false"'],
    },
    {
      file: '10-a11y.vue',
      title: 'Accessibility',
      blurb:
        'Non-interactive hosts get tabindex + role=button and Enter/Space. Tab to the span and press Enter.',
      tags: ['announce', 'aria-live', 'keyboard'],
    },
    {
      file: '11-config-sink.vue',
      title: 'Config-form history — sink, max, key',
      blurb: 'The history target as part of the options bag, with live cap eviction.',
      tags: ['sink', 'max', 'key', 'rich: true'],
    },
    {
      file: '12-multi-select.vue',
      title: 'Multi-select rows → one copied context',
      blurb:
        'Select rows, copy them as one TSV block with a header — ordinary selection state plus a computed source.',
      tags: ['computed source', 'false disables', 'recipe'],
    },
    {
      file: '13-history-picker.vue',
      title: 'Clipboard history picker — copy, re-open, copy again',
      blurb:
        'The reason the package exists: copy a few values, open the history in a teleported dropdown, pick one and it goes back on the clipboard — and jumps to the top. Toggle dedupe to watch history and attempts diverge.',
      tags: ['dedupe', 'compare', 'CopyController', 'sink', 'max', '.rich', 'copy-result'],
      uses: ['@ozjsey/v-teleport-to'],
    },
    {
      file: '14-nothing-to-copy.vue',
      title: 'Nothing to copy — empty and not-yet-loaded bindings',
      blurb:
        'An empty copy would clear the clipboard while the UI says it worked, so it is refused. So is a null binding, rather than falling back to the visible label.',
      tags: ['null binding', "error: 'empty'", "error: 'pending'", 'source: undefined'],
    },
    {
      file: '15-dedupe-scope.vue',
      title: "dedupe scope — one row per payload, or one row per label",
      blurb:
        'dedupe compares text, not labels: two columns holding the same address collapse and the newest label wins. Flip to scope: \'key\' for a row each.',
      tags: ['dedupe', 'scope', 'v-copy:[key]', '.rich'],
    },
  ],
}

export default manifest
