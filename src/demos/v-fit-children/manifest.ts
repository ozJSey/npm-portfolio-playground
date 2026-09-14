import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'v-fit-children',
  pkg: '@ozjsey/v-fit-children',
  tagline:
    'Hide the children that do not fit on one row and hand you the ones you lost — count, elements, indices, and the matching data objects — so a "+N more" badge is three lines instead of a resize-observer project.',
  status: 'Published — 2.2.0 on npm (owner ozjsey); 2.3.0 built locally, not yet published',
  notes: [
    'No ghost element, no IntersectionObserver, no requestAnimationFrame. One ResizeObserver watches five things — the host, the width-restricting container, the host\'s parent, every sibling and every child — because a "+N" badge growing beside a shrink-to-fit host changes none of the first three. Vue-rendered child changes arrive through the directive\'s own updated hook, and a MutationObserver catches children injected outside Vue. All of it runs before the browser paints, so nothing is ever shown mid-recalculation.',
    'The real children are measured in place, once per pass, with everything the directive hid shown first — a display:none child measures zero, which is exactly what the old ghost existed to route around. Spacing comes from where the browser actually put each child, so CSS gap and sibling margins are one number.',
    'Hiding is the data-v-fit-hidden attribute plus one injected rule, never style.display — v-show, Vue\'s style patcher and <Transition> all own that property between them, and the last writer would win.',
    'Every pass measures. 2.2.0 had a cached "shrinking is free" path and 2.3.0 removed it: a cached pass was only ever allowed to confirm the current run, so the only shrink it saved a read on was a shrink that changed nothing — and keeping it meant storing ResizeObserver content rects as a second, disagreeing source of widths.',
    'The event fires whenever the payload changes, and only then. The gate compares the payload a listener would actually see; through 2.2.0 it compared the visible set plus the data array\'s identity, which is why a first pass that hid every child was silent and an in-place items.push() never re-reported. Cards 10 and 11.',
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
      blurb: "Vue's updated hook picks up v-for churn — additions, removals, and a re-keyed child that grew.",
      tags: ['updated hook', 'hiddenData', 'isOverflowing'],
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
    {
      file: '10-event-contract.vue',
      title: 'The event reports what is true now',
      blurb:
        'Starts at a width where nothing fits — the first pass must still dispatch. Then push/pop the same array and watch the payload follow.',
      tags: ['@fit-children-updated', 'FitChildrenEventDetail', 'hiddenIndices', 'bare binding'],
    },
    {
      file: '11-pinned-overflow.vue',
      title: 'isOverflowing on a row that cannot hide anything',
      blurb:
        'Every chip is pinned, so the visible set never moves. Drag the width down: the event and data-v-fit-state have to agree.',
      tags: ['isOverflowing', 'data-v-fit-keep', 'data-v-fit-state'],
    },
  ],
}

export default manifest
