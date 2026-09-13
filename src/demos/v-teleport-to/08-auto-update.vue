<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const autoUpdate = ref(true)
const subtree = ref(false)
const trigger = useTemplateRef<HTMLElement>('trigger')
const host = useTemplateRef<HTMLElement>('host')
const nested = useTemplateRef<HTMLElement>('nested')
const gapEl = useTemplateRef<HTMLElement>('gapEl')

const options = computed(() => ({
  to: trigger.value,
  autoUpdate: autoUpdate.value,
  autoUpdateSubtree: subtree.value,
  placement: 'bottom' as const,
  // Pinned. The reference grows downward here, so a fit-driven flip would move
  // the host for a reason that has nothing to do with this card.
  flip: false,
  widthMultiplier: 1,
  maxHeight: 90,
}))

// Nothing on this card may touch reactive state, and that is the whole design.
// Any reactive write re-renders the component, which calls the directive's
// `updated` hook, which repositions the host — whether or not `autoUpdate` is
// checked. A card that grew the reference through a `ref` would show the host
// tracking perfectly with the box unticked and prove the opposite of what it
// claims; so would one whose own drift readout was a `ref`. Both mistakes were
// in this card. The buttons therefore mutate the DOM directly and the readout
// is written straight into a text node — behind Vue's back, which is exactly
// the class of layout change no scroll or resize event reports.
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit '

function grow(el: HTMLElement | null) {
  if (!el) return
  el.appendChild(document.createTextNode(WORDS))
  measure()
}

function reset() {
  for (const el of [trigger.value, nested.value]) {
    if (!el) continue
    for (const node of [...el.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes('lorem')) node.remove()
    }
  }
  measure()
}

// The gap between the reference's bottom edge and the host's top edge. Zero
// means the host is still anchored; anything else is drift the directive was
// never told about.
//
// Read three frames late on purpose. The observers report through the same
// RAF-batched recalc path as scroll and resize, so a reading taken in the next
// frame catches the transient before the repositioning lands and reports drift
// even when `autoUpdate` did its job.
function measure() {
  let frames = 3
  const tick = () => {
    if (frames-- > 0) return requestAnimationFrame(tick)
    const t = trigger.value
    const h = host.value
    const out = gapEl.value
    if (!t || !h || !out) return
    const drift = Math.round(h.getBoundingClientRect().top - t.getBoundingClientRect().bottom)
    out.textContent = `${drift}px`
  }
  requestAnimationFrame(tick)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="autoUpdate" type="checkbox" /> autoUpdate</label>
    <label class="pg-label">
      <input v-model="subtree" type="checkbox" :disabled="!autoUpdate" /> autoUpdateSubtree
    </label>
    <button class="pg-btn" @click="grow(trigger)">Grow the reference itself</button>
    <button class="pg-btn" @click="grow(nested)">Grow a nested descendant</button>
    <button class="pg-btn" @click="reset">Reset</button>
    <span class="pg-muted">drift: <strong ref="gapEl">—</strong></span>
  </div>

  <div class="column">
    <span ref="trigger" class="reference">
      inline reference —
      <span ref="nested" class="nested">a nested span</span>
    </span>
  </div>

  <div ref="host" v-teleport-to="options" class="pop">tracking host</div>

  <p class="pg-muted">
    Both buttons append a text node with <code>document.createTextNode</code>, and the drift
    readout is written straight into its own text node — no reactive state anywhere, so Vue never
    re-renders and the directive's <code>updated</code> hook never fires. The reference is an
    <strong>inline</strong> element in a narrow column, so the added words wrap onto new lines and
    it gets taller. Untick <code>autoUpdate</code>, press <em>Grow the reference itself</em>, and
    the drift readout leaves zero: the reference got taller and nothing told the host. Reset, tick
    <code>autoUpdate</code> back on, grow again, and the drift stays at <code>0px</code>.
  </p>
  <p class="pg-muted">
    Compare by growing, not by toggling. The two checkboxes <em>are</em> reactive, so ticking one
    re-renders this component and repositions the host as a side effect — that is Vue doing it, not
    the observers.
  </p>
  <p class="pg-muted">
    <em>Grow a nested descendant</em> is the second box's job, and the inline reference is what
    makes it honest. <code>ResizeObserver</code> does not report non-replaced inline elements at
    all, so the <code>MutationObserver</code> is the only observer that can see this change — and
    it is attached to the reference alone. Appending to the reference itself is a
    <code>childList</code> mutation <em>on the reference</em>, so it is caught either way; appending
    inside the nested span is not, and is caught only once <code>autoUpdateSubtree</code> widens
    the scope. With <code>autoUpdate</code> on and <code>autoUpdateSubtree</code> off, the second
    button drifts and the first does not. Subtree is off by default because chatty subtrees can
    trampoline.
  </p>
  <p class="pg-muted">
    Give the reference a block <code>display</code> and the <code>ResizeObserver</code> covers all
    of this on its own — which is the usual case, and why <code>autoUpdateSubtree</code> is a
    narrow tool rather than a default.
  </p>
</template>

<style scoped>
.column {
  /* Narrow enough that appended words wrap and the inline reference grows
     vertically — the only direction the host's anchor cares about. */
  width: 18rem;
  padding: 0.4rem 0;
  font-size: 0.85rem;
  line-height: 1.5;
}
.reference {
  background: #eef0ff;
  box-shadow: inset 0 0 0 2px #4f46e5;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  color: #3730a3;
}
.nested {
  background: #fff7ed;
  box-shadow: inset 0 0 0 1px #f59e0b;
  border-radius: 3px;
  padding: 0 0.2rem;
  color: #92400e;
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
