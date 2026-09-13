<script setup lang="ts">
import { ref } from 'vue'
import type { ResizeEvent } from 'v-observe'

const size = ref({ width: 0, height: 0 })
const delta = ref({ width: 0, height: 0 })
const firstTick = ref(true)
const ticks = ref(0)

function onResize(e: ResizeEvent) {
  if (e.mode !== 'tick') return
  ticks.value++
  firstTick.value = e.from === null
  size.value = e.to
  delta.value = e.delta
}
</script>

<template>
  <p class="pg-muted">
    Drag the bottom-right corner. The first tick always has <code>from: null</code> and a zero
    delta — <code>ResizeObserver</code> fires once on observe, and the directive says so rather
    than faking a change.
  </p>

  <div class="box" v-observe="{ resize: { handler: onResize } }">
    {{ Math.round(size.width) }} × {{ Math.round(size.height) }}
  </div>

  <p class="pg-kv" style="margin-top: 0.5rem">
    ticks: {{ ticks }} · delta: {{ Math.round(delta.width) }} × {{ Math.round(delta.height) }} ·
    from === null: {{ firstTick }}
  </p>
</template>

<style scoped>
.box {
  width: 260px;
  height: 110px;
  resize: both;
  overflow: auto;
  display: grid;
  place-items: center;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  background: #f5f6ff;
  font-family: var(--mono);
  font-size: 0.9rem;
  color: #3730a3;
}
</style>
