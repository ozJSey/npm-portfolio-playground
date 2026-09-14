<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef } from 'vue'
import type { TeleportToEventDetail } from '@ozjsey/v-teleport-to'

// Two hosts, identical bindings, differing only in the order the two
// directives are written. `compileTemplate` emits the directive array in
// SOURCE order, so the left-hand host runs the teleport directive while
// `v-show` still has `display: none` on it, and the right-hand one runs it
// after `v-show` has cleared it.
//
// The README's own Usage example writes `v-show` second — the left-hand
// column — and that column used to report `fit: unmeasured` on every open,
// keep the cramped side and clamp the menu to it, permanently. The two columns
// must agree. That they do is the whole card.
const open = ref(false)
const stage = useTemplateRef<HTMLElement>('stage')
const triggerA = useTemplateRef<HTMLElement>('triggerA')
const triggerB = useTemplateRef<HTMLElement>('triggerB')

// A boundary makes the geometry the same wherever the page is scrolled: 200px
// above the reference and ~248 below, against a menu that wants 336 and is
// capped at the default `maxHeight` of 240. So the host needs 240px: above
// cannot hold it, below can, and `placement: 'top'` must flip. A host that
// could not be measured would not know to — it would keep `top`, clamp itself
// to the 200px there, and report `unmeasured`. That is the difference this
// card exists to make visible, and it needs no options beyond `to`.
const optionsA = computed(() => ({
  to: triggerA.value,
  boundary: stage.value ?? ('viewport' as const),
  placement: 'top' as const,
}))
const optionsB = computed(() => ({
  to: triggerB.value,
  boundary: stage.value ?? ('viewport' as const),
  placement: 'top' as const,
}))

const a = reactive({ fit: '—', placement: '—', maxHeight: 0, content: 0 })
const b = reactive({ fit: '—', placement: '—', maxHeight: 0, content: 0 })

function read(target: typeof a) {
  return (e: Event) => {
    const d = (e as CustomEvent<TeleportToEventDetail>).detail
    target.fit = d.fit
    target.placement = d.placement
    target.maxHeight = Math.round(d.maxHeight)
    target.content = d.contentHeight === null ? 0 : Math.round(d.contentHeight)
  }
}
const onA = read(a)
const onB = read(b)

const agree = computed(
  () =>
    a.placement === b.placement && a.fit === b.fit && a.maxHeight === b.maxHeight,
)
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="open" type="checkbox" /> open both</label>
    <span class="pg-chip" :class="agree ? 'is-chosen' : 'is-cut'">
      {{ agree ? 'both orderings agree' : 'the two orderings disagree' }}
    </span>
  </div>

  <div class="pg-row" style="margin-bottom: 0.7rem">
    <span class="pg-chip is-soft">
      directive first (the README's order): {{ a.placement }} / {{ a.fit }} / maxHeight
      {{ a.maxHeight }}px / content {{ a.content }}px
    </span>
  </div>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <span class="pg-chip is-soft">
      v-show first: {{ b.placement }} / {{ b.fit }} / maxHeight {{ b.maxHeight }}px / content
      {{ b.content }}px
    </span>
  </div>

  <div ref="stage" class="stage">
    <button ref="triggerA" class="pg-btn pg-btn--primary refA">directive first</button>
    <button ref="triggerB" class="pg-btn pg-btn--primary refB">v-show first</button>
  </div>

  <!-- v-show written AFTER the directive — the order the README teaches. -->
  <div
    v-teleport-to="optionsA"
    v-show="open"
    class="menu"
    @teleport-positioned="onA"
  >
    <div v-for="n in 12" :key="n" class="row">row {{ n }}</div>
  </div>

  <!-- v-show written BEFORE the directive. -->
  <div
    v-show="open"
    v-teleport-to="optionsB"
    class="menu"
    @teleport-positioned="onB"
  >
    <div v-for="n in 12" :key="n" class="row">row {{ n }}</div>
  </div>

  <p class="pg-muted">
    Both menus are 336px tall, both references have 200px above them and about 248px below, and
    both bindings say <code>placement: 'top'</code>. The default <code>maxHeight</code> caps the
    host at 240px, so 240px is what has to fit: it does not above, it does below, and both columns
    must therefore report <code>flipped</code> with <code>max-height: 240px</code>. The menu is
    still taller than that, which is what <code>data-teleport-truncated</code> is for.
  </p>
  <p class="pg-muted">
    Before the measurement was fixed, only the right-hand column did.
    <code>compileTemplate</code> emits directives in source order, so writing
    <code>v-show</code> after <code>v-teleport-to</code> — which is what
    <a href="https://github.com/ozJSey/vue-teleport-to#readme">the README's Usage example</a>
    does — ran the positioning hook while the host was still <code>display: none</code>. There was
    no box to read, the verdict was <code>unmeasured</code>, the requested side stood, and nothing
    ever re-measured: it stayed wrong on every subsequent open until an unrelated scroll or resize.
    The measurement now clears the inline <code>display</code> for the duration of one synchronous
    read and puts it back, so ordering cannot decide the answer — and <code>v-show</code> keeps
    working, which is the reason the directive never writes <code>display</code> itself.
  </p>
</template>

<style scoped>
.stage {
  position: relative;
  height: 482px;
  border-radius: 8px;
  outline: 2px dashed #4f46e5;
  outline-offset: -2px;
  background: #fbfcfe;
}
.refA,
.refB {
  position: absolute;
  top: 200px;
}
.refA {
  left: 8%;
}
.refB {
  left: 55%;
}
.menu {
  background: #fff;
  border: 1px solid #d7dced;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
  overflow: hidden;
  font-size: 0.8rem;
}
.row {
  height: 28px;
  line-height: 28px;
  padding: 0 0.7rem;
}
.pg-chip.is-cut {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
</style>
