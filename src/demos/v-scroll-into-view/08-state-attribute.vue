<script setup lang="ts">
import { ref } from 'vue'

const go = ref(false)

function jump() {
  go.value = false
  requestAnimationFrame(() => (go.value = true))
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" @click="jump">Scroll (watch the ring)</button>
    <span class="pg-muted">
      the ring is CSS keyed on <code>[data-scroll-into-view-state="pending"]</code> — one frame
      long, so it reads as a flash
    </span>
  </div>

  <div id="state-pane" class="pg-scroller">
    <p v-for="i in 14" :key="i" class="filler">filler {{ i }}</p>
    <p
      class="target"
      v-scroll-into-view="{ condition: go, container: '#state-pane', block: 'center' }"
    >
      🎯 target
    </p>
    <p v-for="i in 14" :key="`t${i}`" class="filler">filler {{ i + 14 }}</p>
  </div>
</template>

<style scoped>
.filler {
  margin: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: #97a0b4;
  border-bottom: 1px solid #eef1f6;
}
.target {
  margin: 0;
  padding: 0.7rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  outline: 0 solid transparent;
  transition: outline-color 600ms ease, outline-width 200ms ease;
}
.target[data-scroll-into-view-state='pending'] {
  outline: 3px solid #4f46e5;
  transition: none;
}
</style>
