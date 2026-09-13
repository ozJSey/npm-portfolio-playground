import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: '@ozjsey/v-observe',
  tagline:
    'IntersectionObserver + ResizeObserver + MutationObserver behind one binding — with scroll-direction inference, per-threshold crossings, breakpoint brackets, semantic mutation diffs, and a single data-observe-state CSS hook.',
  status: 'v0.1.0 local — 189/189 tests, publish prep',
  notes: [
    'Every mode writes its own segment of data-observe-state ("intersect:…;resize:…;mutate:…"). A "-" means that mode is not configured on the binding; one segment never clobbers another.',
    'Scroll inside each demo box rather than the page — the intersect demos use their own root so the results are reproducible.',
  ],
  demos: [
    {
      file: '01-lazy-once.vue',
      title: 'intersect — lazy load with once: true',
      blurb: 'The observer disconnects after the first intersection. Scroll the box to trigger it.',
      tags: ['intersect', 'once', 'IntersectEvent'],
    },
    {
      file: '02-thresholds-crossed.vue',
      title: 'intersect — per-threshold crossed events',
      blurb: 'One event per threshold per crossing, with an up/down direction. The infinite-scroll primitive.',
      tags: ['thresholds', 'crossed', 'IntersectCrossEvent'],
    },
    {
      file: '03-direction.vue',
      title: 'intersect — scroll-direction inference',
      blurb: 'enter-from-above / below and leave-to-above / below, so reveals can animate the right way.',
      tags: ['direction', 'IntersectDirection'],
    },
    {
      file: '04-css-only.vue',
      title: 'intersect — CSS-only visible state',
      blurb: 'No JS state mirror: style on [data-observe-state*="intersect:visible"].',
      tags: ['data-observe-state', 'CSS'],
    },
    {
      file: '05-root-margin.vue',
      title: 'intersect — custom root and rootMargin',
      blurb: 'Pre-load 120px early inside a nested scroller by growing the root box.',
      tags: ['root', 'rootMargin'],
    },
    {
      file: '06-resize-tick.vue',
      title: 'resize — tick mode with from/to/delta',
      blurb: 'Every callback carries the previous size, the new size and the componentwise delta.',
      tags: ['resize', 'tick', 'ResizeTickEvent'],
    },
    {
      file: '07-resize-breakpoints.vue',
      title: 'resize — breakpoint brackets',
      blurb: 'Object labels vs array defaults, plus the bracket label in the state attribute.',
      tags: ['breakpoints', 'bracket', '(base)'],
    },
    {
      file: '08-resize-crossed.vue',
      title: "resize — on: 'crossed'",
      blurb: 'Fires only when a threshold is crossed, per axis, with direction. Try axis: both.',
      tags: ["on: 'crossed'", 'axis', 'threshold'],
    },
    {
      file: '09-resize-orientation.vue',
      title: "resize — on: 'orientation'",
      blurb: 'portrait ↔ landscape ↔ square flips, with a configurable square tolerance band.',
      tags: ['orientation', 'squareTolerance', 'ratio'],
    },
    {
      file: '10-resize-box-debounce.vue',
      title: 'resize — box modes and debounce',
      blurb: 'border / content / device-pixel side by side, and a debounced counter proving coalescing.',
      tags: ['box', 'device-pixel', 'debounce'],
    },
    {
      file: '11-mutate-attr.vue',
      title: 'mutate — attribute diffs',
      blurb: 'attr:class / attr:style / attr:<name> / attr:* with from → to values.',
      tags: ['mutate', 'attr:class', 'attr:*'],
    },
    {
      file: '12-mutate-children.vue',
      title: 'mutate — children added/removed with match',
      blurb: 'Element nodes only, filtered by a selector (or a list of them).',
      tags: ['children:added', 'children:removed', 'match'],
    },
    {
      file: '13-mutate-text.vue',
      title: 'mutate — text edits',
      blurb: 'Subtree character data, collapsed to one from → to per flush. Type in the box.',
      tags: ['text', 'contenteditable'],
    },
    {
      file: '14-mutate-removed.vue',
      title: 'mutate — self-removal detection',
      blurb: 'Fires when a third party yanks the host out of the DOM without unmounting Vue.',
      tags: ["on: 'removed'", 'parent observer'],
    },
    {
      file: '15-mutate-multi.vue',
      title: 'mutate — multi-type subscription + debounce',
      blurb: 'Array form unions the subscription; debounce merges a burst into one event.',
      tags: ['MutateEventType[]', 'debounce', 'mutate:active'],
    },
    {
      file: '16-gate-on-intersect.vue',
      title: 'gateOnIntersect',
      blurb: 'Suspend resize/mutate work while the host is off-screen; baseline resets on return.',
      tags: ['gateOnIntersect', 'cross-observer'],
    },
    {
      file: '17-combined.vue',
      title: 'All three modes on one element',
      blurb: 'One binding, three observers, three independent segments of the state attribute.',
      tags: ['ObserveOptions', 'data-observe-state'],
    },
  ],
}

export default manifest
