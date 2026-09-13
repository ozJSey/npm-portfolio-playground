<script setup lang="ts">
import { ref } from 'vue'

const items = Array.from({ length: 40 }, (_, i) => `Item ${i + 1}`)
const activeIndex = ref(0)

function step(delta: number) {
  activeIndex.value = (activeIndex.value + delta + items.length) % items.length
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn" @click="step(-1)">← prev</button>
    <button class="pg-btn pg-btn--primary" @click="step(1)">next →</button>
    <button class="pg-btn" @click="activeIndex = 39">jump to last</button>
    <span class="pg-chip">active: {{ items[activeIndex] }}</span>
  </div>

  <div class="pg-scroller" id="list-scroller">
    <div
      v-for="(item, i) in items"
      :key="item"
      class="row"
      :class="{ active: i === activeIndex }"
      v-scroll-into-view="{
        condition: i === activeIndex,
        container: '#list-scroller',
        block: 'nearest',
        behavior: 'smooth',
      }"
    >
      {{ item }}
    </div>
  </div>

  <p class="pg-muted">
    Every row carries the directive; only the one transitioning to <code>true</code> scrolls. With
    <code>block: 'nearest'</code> the list moves the minimum distance.
  </p>
</template>

<style scoped>
.row {
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.row.active {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
</style>
