import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: '@ozjsey/v-fit-children',
  tagline:
    'Hide the children that do not fit on one row and hand you the ones you lost — count, elements, indices, and the matching data objects — so a "+N more" badge is three lines instead of a resize-observer project.',
  status: 'Published — 2.1.0 on npm (owner ozjsey); 3.0 engine built locally, not yet published',
  notes: [
    'No ghost element, no IntersectionObserver, no requestAnimationFrame. One ResizeObserver watches the container and every child; Vue-rendered child changes arrive through the directive\'s own updated hook. Both run before the browser paints, so nothing is ever shown mid-recalculation.',
    'The real children are measured in place, once per pass, with everything the directive hid shown first — a display:none child measures zero, which is exactly what the old ghost existed to route around. Spacing comes from where the browser actually put each child, so CSS gap and sibling margins are one number.',
    'Hiding is the data-v-fit-hidden attribute plus one injected rule, never style.display — v-show, Vue\'s style patcher and <Transition> all own that property between them, and the last writer would win.',
    'Growing the container re-measures; shrinking it is pure arithmetic over the last measurement and costs no DOM reads at all.',
  ],
  demos: [
    {
      file: '01-basic.vue',
      title: 'Chips with a +N more badge',
      blurb: 'The canonical case. Narrow the container and watch children drop out of the row.',
      tags: ['@ozjsey/v-fit-children', 'offsetNeededInPx', '@fit-children-updated'],
    },
    {
      file: '02-data-mapping.vue',
      title: 'data → hiddenData + hiddenIndices',
      blurb: 'Pass the same array you v-for over and get the hidden objects back, typed.',
      tags: ['data', 'hiddenData', 'hiddenIndices', 'FitChildrenEventDetail'],
    },
    {
      file: '03-keep-visible.vue',
      title: 'Pinned children',
      blurb: 'keepVisibleEl (a ref) and data-v-fit-keep (an attribute) both survive the cull.',
      tags: ['keepVisibleEl', 'data-v-fit-keep'],
    },
    {
      file: '04-gap-and-container.vue',
      title: 'margin spacing + separate width container',
      blurb: 'Margins are measured, so the gap option is only a floor; the constraining element can be an ancestor.',
      tags: ['gap', 'widthRestrictingContainer'],
    },
    {
      file: '05-inline-badge.vue',
      title: 'Inline badge with offsetNeededInPx: 0',
      blurb: 'When the badge lives outside the directive element, reserve nothing inside it.',
      tags: ['offsetNeededInPx: 0', 'flex: 1'],
    },
    {
      file: '06-dynamic-children.vue',
      title: 'Adding and removing children',
      blurb: "Vue's updated hook picks up v-for churn; a per-child ResizeObserver catches a child that merely grows.",
      tags: ['updated hook', 'ResizeObserver', 'isOverflowing'],
    },
    {
      file: '07-state-attribute.vue',
      title: 'CSS-only styling via data-v-fit-state',
      blurb: 'The host carries data-v-fit-state="fits" | "overflowing" — style overflow without an event handler.',
      tags: ['data-v-fit-state', 'CSS state hook'],
    },
    {
      file: '08-decorative.vue',
      title: 'Decorative separators outside the data mapping',
      blurb: 'data-v-fit-decorative children hide like any other but consume no data index — hiddenData stays 1:1 with your array.',
      tags: ['data-v-fit-decorative', 'hiddenData'],
    },
    {
      file: '09-v-show.vue',
      title: 'v-show children are left alone',
      blurb: 'A child you hide yourself is excluded from measurement, never counted, and never force-shown.',
      tags: ['v-show', 'consumer-hidden'],
    },
  ],
}

export default manifest
