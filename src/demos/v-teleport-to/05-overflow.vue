<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { TeleportToEventDetail } from '@ozjsey/v-teleport-to'

const overflow = ref<'none' | 'shift' | 'hide'>('shift')
const placement = ref<'bottom' | 'right'>('bottom')
const multiplier = ref(3)
// `offsetX` is on this card for one reason: it is the ONLY thing
// `overflow: 'shift'` can move on a horizontal placement.
//
// For `placement: 'right'` the host's left edge starts at `parentRight +
// offsetX`, and the shift clamp's floor is `parentRight` — shift is never
// allowed to push the host onto its own reference. So the clamp's entire range
// of motion is the offset gap, and at the default `offsetX: 0` the floor IS the
// starting point: `'shift'` and `'none'` produce byte-identical boxes at every
// rail position and every multiplier. That was measured, not inferred, and it
// left this card's `overflow` control dead in its `right` mode (TT-22 finding
// 7). Give it an offset and the clamp has slack to reclaim.
const offsetX = ref(0)
const trigger = useTemplateRef<HTMLElement>('trigger')
const host = useTemplateRef<HTMLElement>('host')
const strip = useTemplateRef<HTMLElement>('strip')
const readout = ref('—')

const options = computed(() => ({
  to: trigger.value,
  placement: placement.value,
  overflow: overflow.value,
  // No `scrollContainer` here on purpose. The default listener sits on
  // `window` in the CAPTURE phase, which already sees scroll events from the
  // strip below — while also keeping the host pinned to its reference when the
  // page itself scrolls. Narrowing to the strip would trade that away for
  // nothing. `scrollContainer` is demoed on its own card (04).
  //
  // Two defaults are switched off here, and both for the same reason: they are
  // the library's OTHER answers to "the host is about to leave the screen", and
  // each of them moves the host away from the edge before `overflow` has
  // anything left to do. With them on, every setting of `overflow` produced
  // byte-identical output at every scroll position — the card looked like it
  // worked and demonstrated nothing.
  //   - `crossAxisAlign: 'start'` pins the host's left edge to the reference.
  //     Left out, the legacy right-anchor heuristic flips the host to extend
  //     leftward as soon as the reference passes 71% of the viewport, which is
  //     exactly where you would have watched it hang off the right edge.
  //   - `flip: false` keeps a horizontal placement on the side you asked for.
  //     Left out, `placement: 'right'` becomes `'left'` at the same moment.
  crossAxisAlign: 'start' as const,
  flip: false,
  offsetX: offsetX.value,
  widthMultiplier: multiplier.value,
  maxHeight: 120,
}))

// Named on the card rather than left for the reader to discover by finding that
// nothing happens. A dead control that says nothing is how finding 7 survived.
const shiftIsInert = computed(
  () => placement.value === 'right' && overflow.value === 'shift' && offsetX.value === 0,
)

// `overflow` measures the HOST against the VIEWPORT, so this readout has to as
// well — the strip is only the thing that lets you drag the reference to an
// edge where the host would hang off the screen.
//
// It also has to name WHICH hide happened. Two different mechanisms write
// `data-teleport-hidden`, and a readout that says only "hidden" cannot tell
// them apart: `overflow: 'hide'` hides because the HOST left the screen, while
// `hideWhenReferenceHidden` (on by default) hides because the REFERENCE did.
// Scroll the strip far enough and the second one fires whatever `overflow`
// says, which is what made every setting on this card look identical.
function onPositioned(e: Event) {
  const d = (e as CustomEvent<TeleportToEventDetail>).detail
  const h = host.value
  if (!h) return
  const r = h.getBoundingClientRect()
  const off = Math.round(Math.max(0, r.right - window.innerWidth) + Math.max(0, 0 - r.left))
  const state = d.referenceHidden
    ? 'hidden — the REFERENCE scrolled off screen'
    : h.dataset.teleportHidden !== undefined
      ? "hidden — overflow: 'hide'"
      : off > 0
        ? `${off}px off screen`
        : 'fully on screen'
  readout.value = `${d.placement} · host ${Math.round(r.left)}…${Math.round(r.right)} of ${window.innerWidth} · ${state}`
}

// Park the reference against the strip's right-hand edge — NOT at the end of
// the rail. Scrolling all the way carries the reference off the screen too,
// which trips `hideWhenReferenceHidden` and hides the host before `overflow`
// has anything to say about it.
function scrollToEdge() {
  const s = strip.value
  const t = trigger.value
  if (!s || !t) return
  s.scrollTo({ left: t.offsetLeft + t.offsetWidth - s.clientWidth, behavior: 'smooth' })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      overflow
      <select v-model="overflow" class="pg-select">
        <option>none</option>
        <option>shift</option>
        <option>hide</option>
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
      <input v-model.number="multiplier" type="range" min="1" max="6" step="0.5" />
      {{ multiplier }}×
    </label>
    <label class="pg-label">
      offsetX
      <input v-model.number="offsetX" type="range" min="0" max="120" step="20" />
      {{ offsetX }}px
    </label>
    <button class="pg-btn" @click="scrollToEdge">Push the reference to the right edge</button>
  </div>

  <p v-if="shiftIsInert" class="inert">
    <code>'shift'</code> is a <strong>no-op here</strong>, and provably so: on a horizontal
    placement the host's near edge already sits at the reference's far edge, which is also the
    clamp's floor — shift may never push the host onto its own reference. At
    <code>offsetX: 0</code> the floor <em>is</em> the starting point, so switching between
    <code>'none'</code> and <code>'shift'</code> produces the same box to the pixel. Raise
    <code>offsetX</code> and the clamp gains exactly that much slack to reclaim — and no more.
    For real horizontal visibility use <code>flip</code> (on by default, and it runs first) or
    <code>'hide'</code>.
  </p>

  <div ref="strip" class="strip">
    <div class="rail">
      <span v-for="i in 6" :key="i" class="spacer">{{ i }}</span>
      <button ref="trigger" class="pg-btn pg-btn--primary">reference</button>
      <span v-for="i in 6" :key="`b${i}`" class="spacer">{{ i + 6 }}</span>
    </div>
  </div>

  <p class="pg-muted status">{{ readout }}</p>

  <div ref="host" v-teleport-to="options" class="pop" @teleport-positioned="onPositioned">
    host — push the reference to the right-hand edge, then widen me with the slider until I hang
    off the screen
  </div>

  <p class="pg-muted">
    The rail is wider than the strip, so it scrolls sideways: drag it (or press the button) until
    the reference sits at the right-hand edge, then widen the host with the slider. The readout
    above is measured off the live host box against the viewport, not recomputed from the options.
    Keep dragging past that and the <em>reference</em> leaves the screen — a different mechanism
    takes over there, and the readout names which one hid the host.
  </p>
  <p class="pg-muted">
    <code>'shift'</code> clamps the host back inside the viewport along the placement axis. For a
    <strong>vertical</strong> placement that axis is horizontal and the clamp has the whole
    viewport width to work with, which is the case this card was built around. For a
    <strong>horizontal</strong> placement the clamp is bounded below by the reference's own edge,
    so all it can ever reclaim is the <code>offsetX</code> gap — set that to <code>0</code> and it
    does nothing at all. <code>'hide'</code> hides the host with <code>visibility: hidden</code>
    (plus a
    <code>data-teleport-hidden</code> marker) once the <strong>host's own box</strong> crosses a
    viewport edge — never <code>display</code>, which stays yours for <code>v-show</code> /
    <code>v-if</code>. <code>'none'</code> is the default and lets it hang off the edge.
  </p>
  <p class="pg-muted">
    This card sets <code>crossAxisAlign: 'start'</code> and <code>flip: false</code>, which is
    otherwise unusual — they are the library's two <em>other</em> answers to "the host is about to
    leave the screen", and each moves it away from the edge before <code>overflow</code> has
    anything to do. With them left at their defaults the host right-anchors (or flips) at 71% of
    the viewport and all three settings above produce identical output.
  </p>
  <p class="pg-muted">
    Note what <code>overflow</code> is <em>not</em>: it watches the host, not the reference.
    "Hide once the reference scrolls out of view" is a different option —
    <code>hideWhenReferenceHidden</code>, which is on by default and is why the host here
    disappears when you scroll this card off the page whatever you pick above. Card 04 has the
    toggle for it.
  </p>
</template>

<style scoped>
.strip {
  overflow: auto;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  padding: 0.6rem;
  background: #fbfcfe;
  height: 90px;
}
.rail {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  /* Wide enough that the strip genuinely scrolls at any card width — without
     this the rail was exactly as wide as its container and "scroll the strip
     sideways" was an impossible instruction. */
  min-width: 2400px;
}
.spacer {
  color: #97a0b4;
  font-size: 0.8rem;
  min-width: 8rem;
}
.status {
  font-variant-numeric: tabular-nums;
  margin: 0.4rem 0 0.6rem;
}
.inert {
  margin: 0 0 0.6rem;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.8rem;
  line-height: 1.5;
}
.pop {
  /* Without this the host can never overflow and the card cannot demonstrate
     its own option: a `position: fixed` block with a `left` and no `width`
     shrink-to-fits into the room between that edge and the viewport, so it
     stops exactly at the edge no matter how large `max-width` gets. */
  width: max-content;
  background: #1f2437;
  color: #fff;
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font-size: 0.82rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}
</style>
