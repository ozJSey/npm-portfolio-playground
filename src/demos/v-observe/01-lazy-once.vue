<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { IntersectEvent } from '@ozjsey/v-observe'

const loaded = ref(false)
const calls = ref(0)
const scroller = useTemplateRef<HTMLElement>('scroller')

function onIntersect(e: IntersectEvent) {
  calls.value++
  if (e.isIntersecting) loaded.value = true
}
</script>

<template>
  <p class="pg-muted">
    Scroll the box down to the placeholder. Callback count stops climbing after the first
    intersection — <code>once: true</code> disconnects the observer.
  </p>

  <div ref="scroller" class="pg-scroller" style="height: 180px">
    <p v-for="i in 10" :key="i" class="filler">scroll down… {{ i }}</p>

    <div
      class="card"
      v-observe="{ intersect: { once: true, root: scroller, on: onIntersect } }"
    >
      <template v-if="loaded">
        <strong>🖼️ loaded</strong>
        <span class="pg-muted">the real payload would be fetched here</span>
      </template>
      <span v-else class="pg-muted">placeholder — not loaded yet</span>
    </div>

    <p v-for="i in 10" :key="`b${i}`" class="filler">…and back up {{ i }}</p>
  </div>

  <p class="pg-kv" style="margin-top: 0.5rem">
    callbacks: {{ calls }} · loaded: {{ loaded }}
  </p>
</template>

<style scoped>
.filler {
  margin: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: #97a0b4;
  border-bottom: 1px solid #eef1f6;
}
.card {
  margin: 0.5rem;
  padding: 1.2rem;
  border-radius: 8px;
  background: #f4f6fb;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: center;
}
</style>
