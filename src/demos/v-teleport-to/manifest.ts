import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'v-teleport-to',
  tagline:
    'Viewport-aware fixed positioning relative to a reference element — dropdowns, popovers and autocompletes that escape every overflow and clip container without a wrapper component.',
  status: 'v3.0.0 local — 806/806 tests; the fit test now runs on the default binding (TT-15)',
  notes: [
    'Positioning is recomputed on scroll and resize, RAF-batched. Scroll the page or a demo container with a popover open and it tracks.',
    'A template ref is null during the render pass that reads it, so the directive always sees `to: null` on its first mounted call and positions on the update that follows. Nothing to work around — but it means `to` resolving late is the normal path, not an edge case.',
    'Transformed ancestors are a CSS limitation, not a bug: an ancestor with transform / filter / contain becomes the containing block for position: fixed. The composable demo is the documented workaround.',
  ],
  demos: [
    {
      file: '01-basic-dropdown.vue',
      title: 'Basic dropdown',
      blurb: 'One binding, no wrapper component, no <Teleport>. Escapes an overflow: hidden parent.',
      tags: ['to', 'v-show', 'overflow escape'],
    },
    {
      file: '02-placement-flip.vue',
      title: 'placement + flip',
      blurb:
        'Every placement is a preference: the fit test runs on all of them, flip is on by default, and a host with nowhere to go says so.',
      tags: ['placement', 'flip', 'boundary', 'data-teleport-fit', 'data-teleport-collapsed'],
    },
    {
      file: '03-sizing.vue',
      title: 'Sizing — matchWidth, widthMultiplier, maxWidth, maxHeight',
      blurb: 'Every width knob, plus the mobile full-bleed branch and the precedence between them.',
      tags: ['matchWidth', 'widthMultiplier', 'maxWidth', 'maxHeight'],
    },
    {
      file: '04-boundary-scroll.vue',
      title: 'boundary + scrollContainer',
      blurb:
        'Clamp available space to a scroll pane, scope the scroll listener, and opt out of the default hide-when-the-reference-leaves.',
      tags: ['boundary', 'scrollContainer', 'HTMLElement[]', 'hideWhenReferenceHidden'],
    },
    {
      file: '05-overflow.vue',
      title: "overflow: 'shift' | 'hide' | 'none'",
      blurb: 'Keep the host on screen, or let it disappear when the reference scrolls away.',
      tags: ['overflow', 'shift', 'hide'],
    },
    {
      file: '06-arrow.vue',
      title: 'Arrow positioning',
      blurb:
        '--teleport-arrow-x / -y locate the reference centre in host coordinates — including on a right-anchored host, where the rendered width is not the projected one.',
      tags: ['arrow', 'CSS custom properties', 'anchorRight'],
    },
    {
      file: '07-cross-axis-offsets.vue',
      title: 'crossAxisAlign + offsets + zIndex',
      blurb: 'Explicit alignment opts out of the legacy right-anchor heuristic. Nudge with offsetX/Y.',
      tags: ['crossAxisAlign', 'offsetX', 'offsetY', 'zIndex'],
    },
    {
      file: '08-auto-update.vue',
      title: 'autoUpdate + autoUpdateSubtree',
      blurb: 'Re-position on reflow that no scroll or resize event would report.',
      tags: ['autoUpdate', 'autoUpdateSubtree', 'MutationObserver'],
    },
    {
      file: '09-virtual-reference.vue',
      title: 'Virtual reference',
      blurb: 'Anchor to a cursor position — any object with getBoundingClientRect() works.',
      tags: ['VirtualReference', 'context menu'],
    },
    {
      file: '10-events-state.vue',
      title: 'Events, callbacks and state attributes',
      blurb: 'teleport-positioned, onPositioned, onPlacementChange, data-teleport-state animations.',
      tags: ['@teleport-positioned', 'onPlacementChange', 'data-teleport-state', 'referenceHidden'],
    },
    {
      file: '11-composable.vue',
      title: 'useTeleportTo inside <Teleport to="body">',
      blurb:
        'The escape hatch for transformed ancestors — bind the returned styles yourself, and pass the host so the fit test has something to measure.',
      tags: ['useTeleportTo', 'styles', 'update()', 'host argument'],
    },
    {
      file: '12-strategy-absolute.vue',
      title: "strategy: 'absolute'",
      blurb: 'Track a scrolling parent by positioning against the offsetParent instead of the viewport.',
      tags: ['strategy', 'absolute', 'offsetParent'],
    },
  ],
}

export default manifest
