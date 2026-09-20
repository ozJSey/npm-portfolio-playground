<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const placement = ref<'top' | 'bottom' | 'left' | 'right'>('bottom')
// Where the reference sits, as a percentage of the rail. The card's own prose
// used to say "drag the slider" while the card had no slider at all — and
// without one the interesting half of the arrow maths was unreachable, because
// the legacy right-anchor heuristic only trips once the reference's right edge
// passes ~71% of the viewport width.
const railPos = ref(20)
// The rail is a percentage of the CARD, and the reference has to stay
// inside it: a plain `margin-left: 100%` pushed the button out past the
// card's right edge and under the sidebar. Subtracting the button's own
// width keeps 100% meaning "flush with the right-hand edge", which is
// still well past the 71% of the VIEWPORT the right-anchor heuristic
// watches for.
const RAIL_BTN_W = 96
// A wide host makes the same point louder: `max-width` is a cap, so the host is
// usually narrower than `referenceWidth × multiplier`. A right-anchored host is
// positioned with CSS `right:`, so deriving its left edge from the projected
// width instead of the rendered one put the arrow outside the popover.
const multiplier = ref(3)
const trigger = useTemplateRef<HTMLElement>('trigger')
const host = useTemplateRef<HTMLElement>('host')
const arrow = useTemplateRef<HTMLElement>('arrow')
const readout = ref('—')

const options = computed(() => ({
  to: trigger.value,
  placement: placement.value,
  arrow: arrow.value,
  overflow: 'shift' as const,
  widthMultiplier: multiplier.value,
  maxHeight: 120,
}))

// Measured off the live boxes, not recomputed from the options: the arrow's
// own centre against the reference's own centre. Zero is the whole contract.
function onPositioned() {
  const t = trigger.value
  const h = host.value
  const a = arrow.value
  if (!t || !h || !a) return
  const tr = t.getBoundingClientRect()
  const hr = h.getBoundingClientRect()
  const ar = a.getBoundingClientRect()
  const horizontal = placement.value === 'left' || placement.value === 'right'
  const err = horizontal
    ? (ar.top + ar.bottom) / 2 - (tr.top + tr.bottom) / 2
    : (ar.left + ar.right) / 2 - (tr.left + tr.right) / 2
  const anchored = h.style.right !== '' ? 'right-anchored' : 'left-anchored'
  const pct = Math.round((tr.right / window.innerWidth) * 100)
  const projected = Math.round(tr.width * multiplier.value)
  // The threshold is stated, not just crossed. The playground's content column
  // is capped at 1500px and centred, so on a window wider than about 2100px the
  // slider cannot push the reference past 71% of the VIEWPORT at all — and a
  // control that silently cannot reach the state it demonstrates is the exact
  // failure this card was filed for.
  readout.value =
    `ref right edge at ${pct}% of viewport (right-anchors past 71%) · ${anchored} · ` +
    `host ${Math.round(hr.width)}px rendered / ${projected}px projected · ` +
    `arrow off centre by ${err.toFixed(1)}px`
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      placement
      <select v-model="placement" class="pg-select">
        <option>top</option>
        <option>bottom</option>
        <option>left</option>
        <option>right</option>
      </select>
    </label>
    <label class="pg-label">
      reference position
      <input v-model.number="railPos" type="range" min="0" max="100" />
      {{ railPos }}%
    </label>
    <label class="pg-label">
      widthMultiplier
      <input v-model.number="multiplier" type="range" min="1" max="6" step="0.5" />
      {{ multiplier }}×
    </label>
  </div>

  <div class="rail">
    <button
      ref="trigger"
      class="pg-btn pg-btn--primary"
      :style="{ marginLeft: `calc((100% - ${RAIL_BTN_W}px) * ${railPos} / 100)` }"
    >
      reference
    </button>
  </div>

  <p class="pg-muted status">{{ readout }}</p>

  <div ref="host" v-teleport-to="options" class="pop has-arrow" @teleport-positioned="onPositioned">
    <span ref="arrow" class="arrow" />
    Arrow tracks the reference centre
  </div>

  <p class="pg-muted">
    Drag the reference slider all the way right. Past ~71% of the viewport width the host
    right-anchors on its own — no option asked for it — and its real left edge becomes
    <code>referenceRight − rendered width</code>. Since <code>max-width</code> is a cap rather than
    a width, the rendered width is usually well under the projected one, and the readout shows both.
    The arrow's off-centre figure stays at <code>0.0px</code> through the whole range; deriving the
    left edge from the projection instead put it up to 127px outside the popover.
  </p>
  <p class="pg-muted">
    The readout names the threshold as well as the current position. It has to: the playground's
    content column is capped at 1500px and centred, so on a window wider than about 2100px the
    slider runs out of card before the reference reaches 71% of the viewport, and the heuristic
    stays out of reach. Narrow the window, or use <code>crossAxisAlign: 'end'</code> (card 07),
    which right-anchors at any position and takes the same corrected width.
  </p>
  <p class="pg-muted">
    The directive never styles the arrow — it only emits
    <code>--teleport-arrow-x</code> / <code>--teleport-arrow-y</code> (one is always
    <code>0px</code>) and detects detachment so the vars can be cleared. Your CSS pins the arrow to
    the edge facing the reference and slides it along the other axis.
  </p>
</template>

<style scoped>
.rail {
  display: flex;
  justify-content: flex-start;
  padding: 2.5rem 0;
}
.rail .pg-btn {
  white-space: nowrap;
  flex: none;
  width: 96px;
  padding-inline: 0;
  text-align: center;
}
.status {
  font-variant-numeric: tabular-nums;
  margin: 0 0 0.6rem;
}
.pop {
  background: #1f2437;
  color: #fff;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.82rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}
.arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #1f2437;
}
.pop[data-teleport-placement='bottom'] .arrow {
  top: 0;
  left: var(--teleport-arrow-x);
  transform: translate(-50%, -50%) rotate(45deg);
}
.pop[data-teleport-placement='top'] .arrow {
  bottom: 0;
  left: var(--teleport-arrow-x);
  transform: translate(-50%, 50%) rotate(45deg);
}
.pop[data-teleport-placement='right'] .arrow {
  left: 0;
  top: var(--teleport-arrow-y);
  transform: translate(-50%, -50%) rotate(45deg);
}
.pop[data-teleport-placement='left'] .arrow {
  right: 0;
  top: var(--teleport-arrow-y);
  transform: translate(50%, -50%) rotate(45deg);
}
</style>
