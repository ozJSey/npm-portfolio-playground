<script setup lang="ts">
import { useTemplateRef } from 'vue'

const scroller = useTemplateRef<HTMLElement>('scroller')

// A no-op handler is enough: configuring the mode is what makes the directive
// maintain the state attribute. There is no JS state in this demo at all.
const noop = () => {}
</script>

<template>
  <p class="pg-muted">
    Scroll the box — the cards fade in with pure CSS keyed on the state attribute. Inspect one to
    see <code>data-observe-state="intersect:visible;resize:-;mutate:-"</code>.
  </p>

  <div ref="scroller" class="pg-scroller" style="height: 220px">
    <div
      v-for="i in 8"
      :key="i"
      class="card"
      v-observe="{ intersect: { root: scroller, thresholds: [0.35], on: noop } }"
    >
      card {{ i }}
    </div>
  </div>
</template>

<style scoped>
.card {
  margin: 0.5rem;
  padding: 1.1rem;
  border-radius: 8px;
  background: #f4f6fb;
  font-size: 0.85rem;
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 280ms ease-out, transform 280ms ease-out;
}
.card[data-observe-state*='intersect:visible'] {
  opacity: 1;
  transform: none;
}
</style>
