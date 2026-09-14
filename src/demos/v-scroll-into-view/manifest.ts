import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'v-scroll-into-view',
  pkg: '@ozjsey/v-scroll-into-view',
  tagline:
    'scrollIntoView() driven by a reactive condition — with edge detection, a pinned scroll container, and sticky-header offsets the native API leaves to you.',
  status: 'v1.3.1 local — 342/342 tests across 5 workspaces, SIV-6 patch',
  notes: [
    'Native scrollIntoView walks up to the nearest scrollable ancestor, which is usually the page. The container option is the whole point: it pins the scroller you actually meant.',
    'Every demo with a container scrolls inside its own box. The three cards that deliberately exercise the container-less native path (10, 12, 13) let the browser walk the ancestor chain, which moves the page too — that is the behaviour container exists to opt out of.',
    'The default behavior is smooth, except when the user has asked their OS for reduced motion: then it resolves to instant. An explicit behavior is always passed through untouched.',
    'Since 1.3.0 the container path reads the target\'s CSS scroll-margin and the pane\'s scroll-padding, subtracts the container\'s border (clientTop/clientLeft), divides out any transform: scale() above it, and scrolls every scroller between the target and the pinned container. offset is the per-side override for scroll-margin on both paths. Card 15 is the sweep that holds all of that to the browser\'s own answer.',
    'Direction is two facts, not one: which edge inline: "start" names comes from the TARGET, the sign of the container\'s scrollLeft comes from the CONTAINER. 1.3.0 read one flag for both and broke every mixed-direction rail; card 16 is the sweep that holds the horizontal axis to native the way card 15 holds the vertical one.',
  ],
  demos: [
    {
      file: '01-boolean-edge.vue',
      title: 'Boolean condition + edge detection',
      blurb: 'Scrolls on false → true only. Pressing the same button twice does nothing the second time.',
      tags: ['condition', 'edge detection'],
    },
    {
      file: '02-v-for-active.vue',
      title: 'Active item in a list',
      blurb: 'One binding across a v-for; only the item whose condition flips scrolls.',
      tags: ['v-for', 'block', 'behavior'],
    },
    {
      file: '03-container.vue',
      title: 'Custom scroll container',
      blurb:
        'Getter, element, CSS selector or ":scope <sel>" (closest), resolved at scroll time — plus the one spelling that looks right and silently scrolls the page instead.',
      tags: ['container', ':scope', 'getter', 'template ref'],
    },
    {
      file: '04-offset.vue',
      title: 'Sticky-header offset',
      blurb:
        'offset.top keeps the target clear of a sticky header. This card pins the pane with a container; card 13 shows what the container-less path does with the CSS equivalent.',
      tags: ['offset', 'scrollMarginTop'],
    },
    {
      file: '05-always.vue',
      title: 'always: re-scroll on every update',
      blurb: 'Opt out of edge detection when the content moves under a condition that stays true.',
      tags: ['always'],
    },
    {
      file: '06-alignment.vue',
      title: 'behavior / block / inline / offset',
      blurb:
        'Every native alignment including the horizontal axis, plus offsets on both axes. Change any of them live — the pane is wide enough that all four inline alignments land somewhere different.',
      tags: ['behavior', 'block', 'inline', 'offset.left'],
    },
    {
      file: '07-composable.vue',
      title: 'useScrollIntoView composable',
      blurb: 'scroll() / cancel() / update() with a reactive pending state. update() merges.',
      tags: ['useScrollIntoView', 'state', 'cancel()'],
    },
    {
      file: '08-state-attribute.vue',
      title: 'data-scroll-into-view-state',
      blurb: 'pending while the rAF is queued, idle once it fires — a CSS hook for selection rings.',
      tags: ['data-scroll-into-view-state'],
    },
    {
      file: '09-resilience.vue',
      title: 'Malformed input is a silent no-op',
      blurb: 'Bad selectors, detached containers and non-boolean bindings never throw.',
      tags: ['hardening', 'no-op'],
    },
    {
      file: '10-native-path.vue',
      title: 'Bare binding, no container',
      blurb:
        'The default configuration: no value, no options, no container. Already in view is a no-op; scroll the pane away and remount to watch it fire.',
      tags: ['bare binding', 'native path', 'no-op'],
    },
    {
      file: '11-hidden-target.vue',
      title: 'A hidden target is a no-op',
      blurb:
        'v-show the target off and scroll to it: the pane stays where it was, on both paths. An element with no layout box has no position to scroll to.',
      tags: ['v-show', 'container', 'no-op'],
    },
    {
      file: '12-nearest-oversized.vue',
      title: 'nearest when the target does not fit',
      blurb:
        'Directive and native scrollIntoView side by side, with a Δ line rather than two readouts to subtract. A target taller than the pane aligns the edge you approach it from; an offset that cannot fit is dropped rather than clipping the target.',
      tags: ['block: nearest', 'native parity', 'offset'],
    },
    {
      file: '13-scroll-margin.vue',
      title: 'CSS scroll-margin, and offset as its override',
      blurb:
        'The same scroll-margin-top rule opens the same gap on both paths since 1.3.0. offset is the per-side override for it — including offset: { top: 0 }, which removes it.',
      tags: ['scroll-margin', 'scroll-padding', 'container', 'offset'],
    },
    {
      file: '14-focus.vue',
      title: 'Pairing with focus()',
      blurb:
        'focus() makes the browser scroll first, and nearest then has nothing left to do — so the browser decides where you land. preventScroll hands it back.',
      tags: ['focus()', 'preventScroll', 'block: nearest'],
    },
    {
      file: '15-parity-matrix.vue',
      title: 'The container path against the browser, 192 ways',
      blurb:
        'A sweep, not a specimen: border × padding × target size × offset × block × approach, each measured against scrollIntoView on an identical pane. One number at the end.',
      tags: ['native parity', 'container', 'border', 'scroll-margin'],
    },
    {
      file: '16-direction.vue',
      title: 'The horizontal axis, in both directions',
      blurb:
        'An RTL card in an LTR rail, and the reverse. Which edge "start" names is the target\'s business; the sign of scrollLeft is the container\'s. 1.3.0 read one flag for both.',
      tags: ['rtl', 'inline', 'direction', 'native parity'],
    },
  ],
}

export default manifest
