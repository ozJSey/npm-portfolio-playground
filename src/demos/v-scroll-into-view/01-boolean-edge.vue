<script setup lang="ts">
import { ref } from 'vue'

const target = ref(false)
const scrollCount = ref(0)

function activate() {
  // Second press with the value already true is a deliberate no-op.
  if (target.value) scrollCount.value++
  target.value = true
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" @click="activate">Set condition = true</button>
    <button class="pg-btn" :disabled="!target" @click="target = false">Set false (rewind)</button>
    <span class="pg-muted">no-op presses while already true: {{ scrollCount }}</span>
  </div>

  <div class="pg-scroller" id="edge-scroller">
    <p v-for="i in 12" :key="i" class="filler">filler line {{ i }}</p>
    <p class="target" v-scroll-into-view="{ condition: target, container: '#edge-scroller', block: 'center' }">
      🎯 the target
    </p>
    <p v-for="i in 12" :key="`b${i}`" class="filler">filler line {{ i + 12 }}</p>
  </div>
</template>

<style scoped>
.filler {
  margin: 0;
  padding: 0.5rem 0.75rem;
  color: #97a0b4;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.target {
  margin: 0;
  padding: 0.75rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
</style>
