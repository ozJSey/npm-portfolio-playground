<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { IntersectEvent } from 'v-observe'

const last = ref<string>('—')
const reveal = ref<'from-below' | 'from-above' | null>(null)
const scroller = useTemplateRef<HTMLElement>('scroller')

function onIntersect(e: IntersectEvent) {
  // `direction` is null on intermediate ticks where visibility did not flip.
  if (!e.direction) return
  last.value = e.direction
  if (e.direction === 'enter-from-below') reveal.value = 'from-below'
  else if (e.direction === 'enter-from-above') reveal.value = 'from-above'
}
</script>

<template>
  <p class="pg-muted">
    Scroll down past the card, then back up. The animation direction follows the scroll direction —
    <code>direction</code> is <code>null</code> on ticks where visibility did not change.
  </p>

  <div ref="scroller" class="pg-scroller" style="height: 200px">
    <p v-for="i in 8" :key="i" class="filler">above {{ i }}</p>
    <section
      class="reveal"
      :data-reveal="reveal"
      v-observe="{ intersect: { root: scroller, on: onIntersect } }"
    >
      <h5>Revealed section</h5>
      <p class="pg-muted">last direction: {{ last }}</p>
    </section>
    <p v-for="i in 8" :key="`b${i}`" class="filler">below {{ i }}</p>
  </div>
</template>

<style scoped>
.filler {
  margin: 0;
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  color: #97a0b4;
  border-bottom: 1px solid #eef1f6;
}
.reveal {
  margin: 0.6rem;
  padding: 1rem;
  border-radius: 8px;
  background: #f4f6fb;
}
.reveal h5 {
  margin: 0 0 0.2rem;
}
.reveal[data-reveal='from-below'] {
  animation: slide-up 320ms both;
}
.reveal[data-reveal='from-above'] {
  animation: slide-down 320ms both;
}
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-18px);
  }
}
</style>
