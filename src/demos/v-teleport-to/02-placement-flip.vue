<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef } from 'vue'
import type { TeleportToEventDetail } from '@ozjsey/v-teleport-to'

type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right'

// `flip` is on by default now, and it applies to `'auto'` too — `'auto'` only
// decides which side is *preferred*, then runs the same fit ladder an explicit
// side gets. Start on an explicit side so the checkbox has something visible to
// turn off.
const placement = ref<Placement>('bottom')
const flip = ref(true)
const open = ref(true)
// Where the reference sits inside the canvas, as a percentage of the room it
// has to move in. Without it the reference was pinned at one spot and half the
// fit ladder was unreachable: `neither` needs the reference near the middle of
// the boundary, and the zero clamp needs it hard against one edge.
const refY = ref(28)
// The OTHER input to the fit test. `refY` varies the ROOM; this varies the
// popover's own height, and a card that only moves the reference structurally
// cannot catch a bug whose input is the content — which is exactly how TT-19
// stayed open while this card was green. Extra rows are plain block children,
// so the popover is as tall as its content and nothing else.
const extraRows = ref(0)

const stage = useTemplateRef<HTMLElement>('stage')
const trigger = useTemplateRef<HTMLElement>('trigger')

// `boundary` clips the available-space math to this box instead of the
// viewport, so the decision is about the box: reproducible wherever the page
// happens to be scrolled, and — unlike a reference pinned in a page column —
// horizontal space actually varies, so the horizontal flip is reachable.
//
// `maxHeight: 400` sits above everything the content slider can produce, so the
// clamp never becomes the binding constraint and the fit test is always
// deciding about the popover's real height. That matters now there are two
// sliders: capped at 200 the content axis would stop moving the verdict the
// moment the cap bit, and `neither` would be unreachable by content alone. The
// box is 360px tall and the two sides share 326px of it, which is what makes
// every verdict — `fits`, `flipped`, `neither`, and a zero clamp — reachable.
const options = computed(() => ({
  to: trigger.value,
  boundary: stage.value ?? ('viewport' as const),
  placement: placement.value,
  flip: flip.value,
  maxHeight: 400,
  widthMultiplier: 2,
}))

const chosen = ref('—')
const losing = ref('—')
const available = ref(0)
const opposite = ref(0)
const fit = ref('—')
const maxHeight = ref(0)
const collapsed = ref(false)
// What the fit test actually compared against the two numbers above, and
// whether the popover you are looking at is short or cut.
const contentHeight = ref(0)
const truncated = ref(false)
// The buffered numbers — NOT the ones the fit test reads. They exist here only
// to explain which side `'auto'` prefers, which is the one thing the buffers
// still weight.
const preference = reactive({ above: 0, below: 0 })
const horizontal = computed(() => chosen.value === 'left' || chosen.value === 'right')

const OPPOSITE: Record<string, string> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}
const BUFFER_DOWN = 150
const BUFFER_UP = 50

function onPositioned(e: Event) {
  const d = (e as CustomEvent<TeleportToEventDetail>).detail
  chosen.value = d.placement
  losing.value = OPPOSITE[d.placement] ?? '—'
  // Both sides come off the event itself, raw and boundary-clipped, exactly the
  // pair the fit test compared against the popover's own height.
  available.value = Math.round(d.availableSpace)
  opposite.value = Math.round(d.oppositeSpace)
  fit.value = d.fit
  maxHeight.value = Math.round(d.maxHeight)
  collapsed.value = d.collapsed
  contentHeight.value = d.contentHeight === null ? 0 : Math.round(d.contentHeight)
  truncated.value = d.truncated

  const el = trigger.value
  const box = stage.value
  if (!el || !box) return
  const r = el.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  preference.above = Math.round(r.top - b.top - BUFFER_UP)
  preference.below = Math.round(b.bottom - r.bottom - BUFFER_DOWN)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.5rem">
    <label class="pg-label">
      placement
      <select v-model="placement" class="pg-select">
        <option>auto</option>
        <option>top</option>
        <option>bottom</option>
        <option>left</option>
        <option>right</option>
      </select>
    </label>
    <label class="pg-label"><input v-model="flip" type="checkbox" /> flip</label>
    <label class="pg-label"><input v-model="open" type="checkbox" /> open</label>
    <label class="pg-label">
      reference height in the box
      <input v-model.number="refY" type="range" min="0" max="100" />
      {{ refY }}%
    </label>
    <label class="pg-label">
      popover content
      <input v-model.number="extraRows" type="range" min="0" max="10" />
      +{{ extraRows }} rows
    </label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.7rem">
    <span class="pg-chip is-chosen">chosen: {{ chosen }}</span>
    <span class="pg-chip">fit: {{ fit }}</span>
    <span class="pg-chip">{{ chosen }} has {{ available }}px</span>
    <span class="pg-chip">{{ losing }} has {{ opposite }}px</span>
    <span class="pg-chip">maxHeight {{ maxHeight }}px</span>
    <span class="pg-chip">content {{ contentHeight }}px</span>
    <span v-if="collapsed" class="pg-chip is-collapsed">data-teleport-collapsed</span>
    <span v-if="truncated" class="pg-chip is-cut">data-teleport-truncated</span>
  </div>

  <div v-if="!horizontal" class="pg-row" style="margin-bottom: 0.7rem">
    <span class="pg-chip is-soft">'auto' preference — above {{ preference.above }}px</span>
    <span class="pg-chip is-soft">below {{ preference.below }}px</span>
  </div>

  <div ref="stage" class="stage">
    <div class="canvas">
      <button
        ref="trigger"
        class="pg-btn pg-btn--primary reference"
        :style="{ top: `calc(${refY} * (100% - 34px) / 100)` }"
      >
        reference
      </button>
    </div>
  </div>

  <div v-show="open" v-teleport-to="options" class="popover" @teleport-positioned="onPositioned">
    <span class="arrow" />
    <strong>popover — placement = {{ chosen }}</strong>
    <span class="pg-muted">this popover is ~177px tall</span>
    <span class="pg-muted">the box is 360px tall</span>
    <span class="pg-muted">so its two sides share 326px</span>
    <span class="pg-muted">at 50% each side has 163px</span>
    <span class="pg-muted">so neither of them can hold it</span>
    <span v-for="n in extraRows" :key="n" class="pg-muted">extra row {{ n }}</span>
  </div>

  <p class="pg-muted">
    <strong>The fit test runs on every configuration</strong>, including the default. Whatever you
    pick above is a <em>preference</em>: the popover stays there while it still fits, and moves to
    the other side of the axis when it cannot (<code>fit: flipped</code>). Drag the reference up
    and down the box and watch the chips — the popover moves before it would be cut, not after.
    Untick <code>flip</code> to pin the side instead: the popover stays put and is clamped into
    whatever room is left, which is what <em>every</em> binding did before 3.0.0.
  </p>
  <p class="pg-muted">
    <strong>Both inputs to the fit test have a slider.</strong> The reference slider varies the
    <em>room</em>; <code>popover content</code> varies the popover's own <em>height</em>. Hold the
    reference still and drag the content instead: the geometry never moves and the placement still
    changes, because what is being compared is the content's real size —
    <code>detail.contentHeight</code>, measured with our own <code>max-height</code> lifted, on no
    side, in the open state. Push the content past <code>maxHeight: 400</code> and
    <code>data-teleport-truncated</code> appears: <code>fit</code> is still right (the host fits at
    the size it renders) and the popover is still cut, which is why the two are separate signals.
  </p>
  <p class="pg-muted">
    Park the reference in the middle and neither side can hold the popover: there is no right
    answer, so the side with more room wins and <code>fit</code> says <code>neither</code> rather
    than leaving you to guess. Push it to <code>0%</code> with <code>placement: top</code> and
    <code>flip</code> off and the room above reaches zero — the popover is clamped to
    <code>max-height: 0</code> and collapses to its own padding, which is invisible on its own, so
    it also gets <code>data-teleport-collapsed</code> and <code>detail.collapsed</code>. Note the
    <code>fit</code> chip reads <code>unmeasured</code> there: with <code>flip</code> off no fit
    test runs, which is exactly why the collapse needs a signal of its own.
  </p>
  <p class="pg-muted">
    <code>'auto'</code> differs from an explicit side in one place only: it has no side of its own,
    so it picks the roomier of top/bottom as its preference and then runs the same ladder. That
    preference is the one thing the reserved edge buffers still weight (150px measuring down, 50px
    measuring up, which is why the second row of chips does not flip at the geometric middle of the
    box). They are <strong>not</strong> charged to the fit test or to <code>maxHeight</code> — the
    first row is raw, boundary-clipped room, straight off
    <code>detail.availableSpace</code> / <code>detail.oppositeSpace</code>.
  </p>
  <p class="pg-muted">
    Horizontally the box is deliberately too narrow: scroll it sideways and across most of the
    range the popover is wider than <em>either</em> side, so <code>left</code> and
    <code>right</code> produce <code>neither</code> too. The host carries
    <code>data-teleport-fit</code>
    (<code>fits</code> / <code>flipped</code> / <code>neither</code> / <code>unmeasured</code>) and
    the event carries the same value as <code>detail.fit</code>.
  </p>
</template>

<style scoped>
.stage {
  position: relative;
  width: 420px;
  max-width: 100%;
  height: 360px;
  overflow: auto;
  /* An OUTLINE, not a border. `boundary` measures the element's border box, so
     a 2px border would leave the canvas 2px inside the boundary on every side
     and the reference could never reach an edge — which is exactly the state
     `data-teleport-collapsed` exists to report. */
  outline: 2px dashed #4f46e5;
  outline-offset: -2px;
  border-radius: 8px;
  background: #fbfcfe;
}
.canvas {
  position: relative;
  width: 680px;
  /* Exactly the stage's own height, so the reference slider moves the reference
     through the boundary rather than through a scroll offset — the vertical
     geometry is then reproducible without touching the scrollbar. */
  height: 360px;
  background: repeating-linear-gradient(45deg, #fff 0 12px, #f6f7fb 12px 24px);
}
.reference {
  position: absolute;
  left: 275px;
  width: 130px;
  /* Pinned so the slider's arithmetic below is exact: at 0% and 100% the
     reference is flush with the boundary edge and the room on that side is
     genuinely zero. */
  height: 34px;
  padding: 0;
}
.is-chosen {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}
.is-collapsed {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}
.is-soft {
  opacity: 0.7;
}
.is-cut {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}
.popover {
  background: #1f2437;
  color: #e6e9f0;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  white-space: nowrap;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  /* The clamp has to be visible. Without this the content simply spills past
     `max-height` and a truncated popover looks identical to a healthy one. */
  overflow: hidden;
}
.popover .pg-muted {
  color: #98a1b8;
}
/* A real child rather than an `::after`, and pinned INSIDE the edge so
   `overflow: hidden` cannot clip it. Keeping the decoration's box out of the
   host's own height is the rule `flip` asks of every consumer: the host must
   not change size in response to the side it was given, or it can chase itself
   between the two. */
.arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  left: 16px;
  background: #2b3149;
  transform: rotate(45deg);
}
.popover[data-teleport-placement='bottom'] .arrow {
  top: 3px;
}
.popover[data-teleport-placement='top'] .arrow {
  bottom: 3px;
}
.popover[data-teleport-placement='right'] .arrow {
  left: 3px;
  top: 14px;
}
.popover[data-teleport-placement='left'] .arrow {
  left: auto;
  right: 3px;
  top: 14px;
}
</style>
