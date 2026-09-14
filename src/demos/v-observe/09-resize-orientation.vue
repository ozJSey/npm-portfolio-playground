<script setup lang="ts">
import { ref } from 'vue'
import type { ResizeEvent } from '@ozjsey/v-observe'

const tolerance = ref(0.08)
const current = ref('—')
const log = ref<string[]>([])

function onFlip(e: ResizeEvent) {
  if (e.mode !== 'orientation') return
  current.value = e.to
  log.value.unshift(`${e.from ?? '(initial)'} → ${e.to} at ratio ${e.ratio.toFixed(2)}`)
  log.value.length = Math.min(log.value.length, 6)
}
</script>

<template>
  <label class="pg-label" style="margin-bottom: 0.6rem">
    squareTolerance
    <input v-model.number="tolerance" type="range" min="0" max="0.4" step="0.02" />
    {{ tolerance.toFixed(2) }}
  </label>

  <div
    class="box"
    :data-orientation="current"
    v-observe="{ resize: { on: 'orientation', squareTolerance: tolerance, handler: onFlip } }"
  >
    {{ current }}
  </div>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— resize to flip —' }}</pre>
  <p class="pg-muted">
    The first event arrives at first paint with <code>from: null</code> — it is the only signal an
    orientation consumer gets before anything is dragged. After that, drag the box wider than tall
    and back. With tolerance at 0 the <code>square</code> state needs an exact 1:1; widen the band
    and near-square sizes report <code>square</code> too. Hiding the box reports nothing at all: a
    0×0 element is unmeasured, not square.
  </p>
</template>

<style scoped>
.box {
  width: 240px;
  height: 200px;
  resize: both;
  overflow: auto;
  display: grid;
  place-items: center;
  border: 2px solid #b9c1d4;
  border-radius: 8px;
  font-size: 0.95rem;
  font-family: var(--mono);
  transition: background 200ms ease, border-color 200ms ease;
}
.box[data-orientation='portrait'] {
  border-color: #4f46e5;
  background: #f5f6ff;
}
.box[data-orientation='landscape'] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.box[data-orientation='square'] {
  border-color: #b45309;
  background: #fffbeb;
}
</style>
