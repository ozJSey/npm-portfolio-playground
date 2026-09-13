<script setup lang="ts">
import { onUnmounted, ref, useTemplateRef } from 'vue'
import type { MutateEvent, ResizeEvent } from 'v-observe'

const gate = ref(true)
const mutations = ref(0)
const resizes = ref(0)
const beats = ref(0)
const scroller = useTemplateRef<HTMLElement>('scroller')

// A ticking heartbeat keeps mutating the host whether or not you can see it.
const heartbeat = setInterval(() => beats.value++, 400)
onUnmounted(() => clearInterval(heartbeat))

function onMutate(_e: MutateEvent) {
  mutations.value++
}
function onResize(e: ResizeEvent) {
  if (e.mode === 'tick') resizes.value++
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="gate" type="checkbox" /> gateOnIntersect</label>
    <button class="pg-btn" @click="((mutations = 0), (resizes = 0))">Reset counters</button>
    <span class="pg-muted">scroll the host out of the box and watch the counter freeze</span>
  </div>

  <div ref="scroller" class="pg-scroller" style="height: 150px">
    <p v-for="i in 6" :key="i" class="filler">filler {{ i }}</p>
    <div
      class="host"
      :data-beat="beats"
      v-observe="{
        intersect: { root: scroller, on: () => {} },
        mutate: { on: 'attr:data-beat', gateOnIntersect: gate, handler: onMutate },
        resize: { gateOnIntersect: gate, handler: onResize },
      }"
    >
      beat {{ beats }} · mutate handler calls {{ mutations }} · resize ticks {{ resizes }}
    </div>
    <p v-for="i in 8" :key="`b${i}`" class="filler">filler {{ i + 6 }}</p>
  </div>

  <p class="pg-muted">
    Gated handlers stay silent while the host is off-screen, and the resize baseline resets on
    return (the next tick reports <code>from: null</code>) so you never get a bogus delta spanning
    the invisible period. <code>mutate.on: 'removed'</code> is deliberately exempt — it is terminal,
    so gating it could mean never hearing about it. If <code>IntersectionObserver</code> is missing
    entirely the gate becomes "always fire" rather than swallowing everything.
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
.host {
  margin: 0.5rem;
  padding: 1rem;
  border-radius: 8px;
  background: #f4f6fb;
  font-family: var(--mono);
  font-size: 0.78rem;
}
.host[data-observe-state*='intersect:visible'] {
  background: #f0fdf4;
}
</style>
