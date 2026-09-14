<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import type { VirtualReference } from '@ozjsey/v-teleport-to'

const open = ref(false)
const surface = useTemplateRef<HTMLElement>('surface')
// Any object with getBoundingClientRect() is a valid reference — cursor
// coordinates, a selection Range, a canvas hit-test result…
const cursor = shallowRef<VirtualReference | null>(null)

function openAt(e: MouseEvent) {
  const { clientX: x, clientY: y } = e
  cursor.value = {
    getBoundingClientRect: () =>
      ({ x, y, top: y, left: x, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect,
  }
  open.value = true
}

const options = computed(() => ({
  to: cursor.value ?? undefined,
  enabled: open.value && cursor.value !== null,
  // The fit test measures against the BOUNDARY, and the default boundary is
  // the viewport — so "right-click near the bottom of the box and the menu
  // opens above the cursor" used to be true only if the box itself happened to
  // be near the bottom of your window. At 900px and 700px of viewport height it
  // never flipped, because 260px of window remained below the box (TT-22
  // finding 8). Clipping to the drawn surface makes the card's own sentence
  // literally true, at any window size, and costs nothing: `boundary` treats a
  // virtual reference exactly as it treats an element.
  boundary: surface.value ?? ('viewport' as const),
  placement: 'bottom' as const,
  // A cursor position has no width, so `widthMultiplier` — which multiplies the
  // REFERENCE's width — projects zero and the menu renders at nothing but its
  // own padding. Every virtual reference wants an explicit width instead.
  maxWidth: 170,
  maxHeight: 160,
  overflow: 'shift' as const,
}))
</script>

<template>
  <div ref="surface" class="surface" @contextmenu.prevent="openAt" @click="open = false">
    right-click anywhere in this box — near the top it opens downwards, near the bottom it flips
  </div>

  <div v-show="open" v-teleport-to="options" class="menu">
    <button class="item" @click="open = false">Cut</button>
    <button class="item" @click="open = false">Copy</button>
    <button class="item" @click="open = false">Paste</button>
  </div>

  <p class="pg-muted">
    Virtual references skip the <code>isConnected</code> check and the
    <code>autoUpdate</code> observers — there is no element to observe. Recalculate by triggering a
    directive update (as this demo does when the cursor object is replaced) or by calling
    <code>update()</code> from the composable.
  </p>
  <p class="pg-muted">
    Two things follow from a reference with no box. <code>widthMultiplier</code> multiplies the
    reference's width, so it projects <code>0</code> here — pass <code>maxWidth</code> instead, as
    this card does. And the fit test still runs on a virtual reference: right-click near the
    <em>bottom</em> of the box and the menu opens <em>above</em> the cursor rather than being
    clamped into the sliver below it; right-click near the top and it opens downwards as asked.
    This card passes <code>boundary</code> — the dashed box — so that sentence is about the box you
    can see rather than about where your window edge happens to be. Leave <code>boundary</code> at
    its default <code>'viewport'</code> and exactly the same thing happens against the bottom of
    the window instead.
  </p>
</template>

<style scoped>
.surface {
  /* Tall enough that a click near one edge leaves real room at the other —
     with `boundary` set to this element, the box IS the space the fit test is
     deciding about, so it has to be able to hold the menu on one side and not
     on the other. */
  height: 220px;
  display: grid;
  place-items: center;
  border: 2px dashed #b9c1d4;
  border-radius: 8px;
  background: #fbfcfe;
  color: #6b7488;
  font-size: 0.85rem;
  user-select: none;
}
.menu {
  background: #fff;
  border: 1px solid #dfe3ec;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 20, 35, 0.18);
  padding: 0.25rem;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.item {
  appearance: none;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.3rem 0.9rem;
  border-radius: 5px;
  cursor: pointer;
}
.item:hover {
  background: #eef2ff;
}
</style>
