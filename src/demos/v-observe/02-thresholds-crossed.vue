<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { IntersectCrossEvent } from 'v-observe'

const log = ref<string[]>([])
const pages = ref(1)
const scroller = useTemplateRef<HTMLElement>('scroller')

function onCross(e: IntersectCrossEvent) {
  log.value.unshift(`threshold ${e.threshold} crossed ${e.direction} (ratio ${e.ratio.toFixed(2)})`)
  log.value.length = Math.min(log.value.length, 8)

  // The infinite-scroll trigger: sentinel becoming mostly visible = load more.
  if (e.threshold >= 0.8 && e.direction === 'up') pages.value++
}
</script>

<template>
  <p class="pg-muted">
    Scroll the sentinel into view. Each threshold reports once per crossing — no bucketing in your
    own code.
  </p>

  <div ref="scroller" class="pg-scroller" style="height: 180px">
    <article v-for="i in pages * 6" :key="i" class="post">post {{ i }}</article>
    <div
      class="sentinel"
      v-observe="{
        intersect: { root: scroller, thresholds: [0.25, 0.5, 0.8, 1], crossed: onCross },
      }"
    >
      sentinel — pages loaded: {{ pages }}
    </div>
  </div>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— nothing crossed yet —' }}</pre>
</template>

<style scoped>
.post {
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.sentinel {
  height: 60px;
  display: grid;
  place-items: center;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.8rem;
}
</style>
