<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { IntersectEvent } from '@ozjsey/v-observe'

const margin = ref(120)
const eager = ref(false)
const plain = ref(false)
const scroller = useTemplateRef<HTMLElement>('scroller')

function onEager(e: IntersectEvent) {
  if (e.isIntersecting) eager.value = true
}

function onPlain(e: IntersectEvent) {
  if (e.isIntersecting) plain.value = true
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.5rem">
    <label class="pg-label">
      rootMargin bottom
      <input v-model.number="margin" type="range" min="0" max="220" step="20" />
      {{ margin }}px
    </label>
    <button class="pg-btn" @click="((eager = false), (plain = false))">Reset flags</button>
  </div>

  <div ref="scroller" class="pg-scroller" style="height: 170px">
    <p v-for="i in 9" :key="i" class="filler">scroll… {{ i }}</p>

    <div
      class="probe"
      :class="{ hit: eager }"
      v-observe="{
        intersect: { root: scroller, rootMargin: `0px 0px ${margin}px 0px`, on: onEager },
      }"
    >
      rootMargin: {{ margin }}px — fires {{ margin }}px early
    </div>

    <div class="probe" :class="{ hit: plain }" v-observe="{ intersect: { root: scroller, on: onPlain } }">
      no rootMargin — fires exactly at the edge
    </div>

    <p v-for="i in 6" :key="`b${i}`" class="filler">…more {{ i }}</p>
  </div>

  <p class="pg-muted">
    <code>root</code> is the scroll box, not the viewport, so this stays reproducible regardless of
    where the page is scrolled.
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
.probe {
  margin: 0.4rem;
  padding: 0.7rem;
  border-radius: 8px;
  background: #f4f6fb;
  font-size: 0.82rem;
  border: 2px solid transparent;
}
.probe.hit {
  border-color: #16a34a;
  background: #f0fdf4;
}
</style>
