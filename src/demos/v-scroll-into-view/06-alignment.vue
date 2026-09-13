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
    <div v-for="cell in 64" :key="cell" class="cell" :class="{ target: cell === 27 }">
      <span
        v-if="cell === 27"
        v-scroll-into-view="{
          condition: go,
          container: '#grid-pane',
          behavior,
          block,
          inline,
          offset: { top: offsetTop, left: offsetLeft },
        }"
        >🎯</span
      >
      <template v-else>{{ cell }}</template>
    </div>
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
  grid-template-columns: repeat(8, 8rem);
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
