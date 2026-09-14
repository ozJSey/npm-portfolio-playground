<script setup lang="ts">
import { ref } from 'vue'

const behavior = ref<ScrollBehavior>('smooth')
const block = ref<ScrollLogicalPosition>('center')
const inline = ref<ScrollLogicalPosition>('center')
const offsetTop = ref(0)
const offsetLeft = ref(0)
const go = ref(false)

function jump() {
  go.value = false
  requestAnimationFrame(() => (go.value = true))
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      behavior
      <select v-model="behavior" class="pg-select">
        <option>smooth</option>
        <option>instant</option>
        <option>auto</option>
      </select>
    </label>
    <label class="pg-label">
      block
      <select v-model="block" class="pg-select">
        <option>start</option>
        <option>center</option>
        <option>end</option>
        <option>nearest</option>
      </select>
    </label>
    <label class="pg-label">
      inline
      <select v-model="inline" class="pg-select">
        <option>start</option>
        <option>center</option>
        <option>end</option>
        <option>nearest</option>
      </select>
    </label>
    <button class="pg-btn pg-btn--primary" @click="jump">Scroll</button>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      offset.top
      <input v-model.number="offsetTop" type="range" min="-60" max="60" step="4" />
      {{ offsetTop }}px
    </label>
    <label class="pg-label">
      offset.left
      <input v-model.number="offsetLeft" type="range" min="-60" max="60" step="4" />
      {{ offsetLeft }}px
    </label>
    <span class="pg-muted">both axes independent; negatives push past natural alignment</span>
  </div>

  <div id="grid-pane" class="grid-pane">
    <div v-for="cell in 55" :key="cell" class="cell">{{ cell }}</div>
    <!--
      The directive is on the CELL, not on a glyph inside it. Bound to the 23px
      emoji, `block: 'start'` aligned the emoji and visibly clipped the cell the
      eye reads as the target — the demo disagreed with itself.
    -->
    <div
      class="cell target"
      v-scroll-into-view="{
        condition: go,
        container: '#grid-pane',
        behavior,
        block,
        inline,
        offset: { top: offsetTop, left: offsetLeft },
      }"
    >
      🎯
    </div>
    <div v-for="cell in 72" :key="`a${cell}`" class="cell">{{ cell + 56 }}</div>
  </div>
</template>

<style scoped>
.grid-pane {
  width: 100%;
  height: 220px;
  overflow: auto;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  display: grid;
  /*
    16 columns, not 8. At 8 the content was 1024px inside a ~937px scrollport,
    so the whole horizontal range was 87px: `center`, `end` and `nearest` all
    landed on `scrollLeft 0` and only `start` moved, by clamping to the maximum.
    The control advertised "every native alignment including the horizontal
    axis" and was inert at desktop width. Four distinct answers need the target
    to be reachable from both ends, which needs content wider than
    2 x scrollport - cell: 2048px does it, and leaves the target (cell 56, row 4
    column 8) at x 1024-1152 with a maximum scroll of ~1111.

    Eight rows, not six: `offset.top: -40` on a start alignment asks the pane to
    go 40px PAST the target, and with six rows that request clamped at the
    scroll maximum, so the card stopped demonstrating negative offsets. 128
    cells over 16 columns keeps the 640px content height the 8-column grid had.
  */
  grid-template-columns: repeat(16, 8rem);
  grid-auto-rows: 5rem;
}
.cell {
  display: grid;
  place-items: center;
  border-right: 1px solid #eef1f6;
  border-bottom: 1px solid #eef1f6;
  font-size: 0.8rem;
  color: #97a0b4;
}
.cell.target {
  background: #eef2ff;
  font-size: 1.4rem;
}
</style>
