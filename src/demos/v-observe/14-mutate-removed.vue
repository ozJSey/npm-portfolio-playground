<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { MutateEvent } from 'v-observe'

const status = ref('mounted — chart instance alive')
const gone = ref(false)
const host = useTemplateRef<HTMLElement>('host')

function onRemoved(e: MutateEvent) {
  if (e.type !== 'removed') return
  gone.value = true
  status.value = 'removed — tearDownChartInstance() ran'
}

// Simulates a third-party library (Bootstrap modals, jQuery plugins, a chart
// lib) ripping the node out of the DOM without telling Vue.
function rip() {
  host.value?.remove()
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" :disabled="gone" @click="rip">
      Rip the node out with plain DOM (el.remove())
    </button>
    <span class="pg-muted">Press Re-run on this card to restore it</span>
  </div>

  <div ref="host" class="host" v-observe="{ mutate: { on: 'removed', handler: onRemoved } }">
    I am observed for my own removal
  </div>

  <p class="pg-kv" style="margin-top: 0.6rem">{{ status }}</p>
  <p class="pg-muted">
    Vue's <code>unmounted</code> hook never runs here — nothing unmounted, the node was simply
    detached. A second observer on the parent (recorded at mount) catches it, fires once, and
    disconnects itself.
  </p>
</template>

<style scoped>
.host {
  padding: 0.9rem;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  background: #f5f6ff;
  font-size: 0.85rem;
  color: #3730a3;
  max-width: 30rem;
}
</style>
