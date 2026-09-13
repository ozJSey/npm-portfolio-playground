<script setup lang="ts">
import { ref } from 'vue'
import type { ResizeEvent } from 'v-observe'

const width = ref(520)
const labelled = ref('—')
const defaulted = ref('—')

// Object form: your labels. Include an explicit `0` key to own the smallest
// bracket, otherwise it is reported as '(base)'.
const named = { xs: 0, sm: 320, md: 640, lg: 960 }

// Array form: default labels '<320' / '320-640' / '>=640'.
const plain = [320, 640]

function onLabelled(e: ResizeEvent) {
  if (e.mode === 'tick') labelled.value = e.bracket ?? 'null'
}

function onDefaulted(e: ResizeEvent) {
  if (e.mode === 'tick') defaulted.value = e.bracket ?? 'null'
}
</script>

<template>
  <label class="pg-label" style="margin-bottom: 0.6rem">
    width
    <input v-model.number="width" type="range" min="160" max="1000" />
    {{ width }}px
  </label>

  <div
    class="grid"
    :style="{ width: `${width}px` }"
    v-observe="{ resize: { breakpoints: named, handler: onLabelled } }"
  >
    <span>object breakpoints → <strong>{{ labelled }}</strong></span>
    <i v-for="n in 8" :key="n" class="cell" />
  </div>

  <div
    class="strip"
    :style="{ width: `${width}px` }"
    v-observe="{ resize: { breakpoints: plain, handler: onDefaulted } }"
  >
    array breakpoints → <strong>{{ defaulted }}</strong>
  </div>

  <p class="pg-muted">
    The grid's column count is pure CSS: the directive writes the bracket into
    <code>data-observe-state</code> and the stylesheet keys off
    <code>[data-observe-state*="resize:md"]</code>.
  </p>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 0.35rem;
  grid-template-columns: 1fr;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  padding: 0.6rem;
  font-size: 0.82rem;
  margin-bottom: 0.6rem;
}
.grid[data-observe-state*='resize:sm'] {
  grid-template-columns: 1fr 1fr;
}
.grid[data-observe-state*='resize:md'] {
  grid-template-columns: repeat(3, 1fr);
}
.grid[data-observe-state*='resize:lg'] {
  grid-template-columns: repeat(4, 1fr);
}
.grid span {
  grid-column: 1 / -1;
}
.cell {
  height: 1.4rem;
  border-radius: 4px;
  background: #e5e9f7;
}
.strip {
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  font-size: 0.82rem;
}
</style>
