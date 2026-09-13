<script setup lang="ts">
import { ref } from 'vue'
import type { ResizeEvent } from 'v-observe'

const axis = ref<'width' | 'height' | 'both'>('width')
const log = ref<string[]>([])

function onCross(e: ResizeEvent) {
  if (e.mode !== 'crossed') return
  log.value.unshift(`${e.axis} crossed ${e.threshold} going ${e.direction} → ${e.bracket}`)
  log.value.length = Math.min(log.value.length, 8)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      axis
      <select v-model="axis" class="pg-select">
        <option>width</option>
        <option>height</option>
        <option>both</option>
      </select>
    </label>
    <button class="pg-btn" @click="log = []">Clear log</button>
    <span class="pg-muted">thresholds: 240 and 400</span>
  </div>

  <div
    class="box"
    v-observe="{ resize: { on: 'crossed', breakpoints: [240, 400], axis, handler: onCross } }"
  >
    drag me across 240px / 400px
  </div>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— resize past a threshold —' }}</pre>
  <p class="pg-muted">
    Nothing fires while you stay inside a bracket — that is the difference from tick mode. With
    <code>axis: 'both'</code> a diagonal drag emits one event per axis.
  </p>
</template>

<style scoped>
.box {
  width: 300px;
  height: 200px;
  resize: both;
  overflow: auto;
  display: grid;
  place-items: center;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  background: #f5f6ff;
  font-size: 0.85rem;
  color: #3730a3;
}
</style>
