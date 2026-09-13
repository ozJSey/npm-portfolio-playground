<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const align = ref<'legacy' | 'start' | 'center' | 'end'>('legacy')
const placement = ref<'bottom' | 'right'>('bottom')
const offsetX = ref(0)
const offsetY = ref(8)
const zIndex = ref(1201)
const multiplier = ref(2)
// Where the reference sits along the rail, as a percentage of the rail's own
// width. The legacy right-anchor heuristic trips past 71% of the VIEWPORT
// width, so the reference has to be able to get there — a rail that cannot
// move it is a card that cannot show the behaviour its prose explains.
const railPos = ref(20)
// The rail is a percentage of the CARD, and the reference has to stay
// inside it: a plain `margin-left: 100%` pushed the button out past the
// card's right edge and under the sidebar. Subtracting the button's own
// width keeps 100% meaning "flush with the right-hand edge", which is
// still well past the 71% of the VIEWPORT the right-anchor heuristic
// watches for.
const RAIL_BTN_W = 96
const trigger = useTemplateRef<HTMLElement>('trigger')
const host = useTemplateRef<HTMLElement>('host')
const readout = ref('—')

const options = computed(() => ({
  to: trigger.value,
  placement: placement.value,
  crossAxisAlign: align.value === 'legacy' ? undefined : align.value,
  offsetX: offsetX.value,
  offsetY: offsetY.value,
  zIndex: zIndex.value,
  widthMultiplier: multiplier.value,
  maxHeight: 110,
}))

function onPositioned() {
  const t = trigger.value
  const h = host.value
  if (!t || !h) return
  const tr = t.getBoundingClientRect()
  const hr = h.getBoundingClientRect()
  const pct = Math.round((tr.right / window.innerWidth) * 100)
  const anchored = h.style.right !== '' ? 'right-anchored' : 'left-anchored'
  readout.value =
    `reference right edge at ${pct}% of the viewport (heuristic fires past 71%) · ` +
    `${anchored} · host ${Math.round(hr.left)}…${Math.round(hr.right)}`
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      crossAxisAlign
      <select v-model="align" class="pg-select">
        <option value="legacy">(omitted — legacy heuristic)</option>
        <option value="start">start</option>
        <option value="center">center</option>
        <option value="end">end</option>
      </select>
    </label>
    <label class="pg-label">
      placement
      <select v-model="placement" class="pg-select">
        <option>bottom</option>
        <option>right</option>
      </select>
    </label>
    <label class="pg-label">
      widthMultiplier
      <input v-model.number="multiplier" type="range" min="1" max="4" step="0.5" />
      {{ multiplier }}×
    </label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      reference position <input v-model.number="railPos" type="range" min="0" max="100" /> {{ railPos }}%
    </label>
    <label class="pg-label">
      offsetX <input v-model.number="offsetX" type="range" min="-60" max="60" /> {{ offsetX }}
    </label>
    <label class="pg-label">
      offsetY <input v-model.number="offsetY" type="range" min="-40" max="60" /> {{ offsetY }}
    </label>
    <label class="pg-label">
      zIndex <input v-model.number="zIndex" class="pg-input" type="number" step="100" style="width: 6rem" />
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

  <div ref="host" v-teleport-to="options" class="pop" @teleport-positioned="onPositioned">
    aligned host
  </div>

  <p class="pg-muted">
    Slide the reference to the right. Leaving <code>crossAxisAlign</code> out keeps the legacy
    implicit behaviour: once the reference's right edge passes ~71% of the viewport width the host
    right-anchors, and the readout says so. Passing <em>any</em> explicit value — including
    <code>'start'</code> — opts out of that heuristic for good, so the same slide changes nothing.
  </p>
  <p class="pg-muted">
    The readout names the threshold too, because the slider cannot always reach it: the
    playground's content column is capped at 1500px and centred, so past roughly a 2100px-wide
    window the reference tops out below 71% of the viewport and the implicit branch never fires.
    <code>crossAxisAlign: 'end'</code> right-anchors at any position and is unaffected.
  </p>
  <p class="pg-muted">
    A right-anchored host is positioned with CSS <code>right:</code>, so its real left edge is
    <code>referenceRight − rendered width</code>, not <code>referenceRight − projected width</code>.
    Widen the host with the multiplier while right-anchored and watch the readout: the host's left
    edge follows its actual box. That distinction is what <code>--teleport-arrow-x</code> is
    computed from (card 06), and getting it wrong put the arrow outside the popover entirely.
  </p>
</template>

<style scoped>
.rail {
  display: flex;
  justify-content: flex-start;
  padding: 2rem 0;
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
  padding: 0.5rem 0.9rem;
  font-size: 0.82rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}
</style>
